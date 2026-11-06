"""Native input/accessibility adapters for disposable Linux/macOS CI desktops."""
import json
import os
from pathlib import Path
import re
import select
import subprocess
import sys
import time


class UI:
    def __init__(self, pid):
        self.pid = pid
        self.tree = []
        self.mac = sys.platform == "darwin"
        if self.mac:
            self.helper = subprocess.Popen([os.environ["AX_HELPER"]], stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, text=True, bufsize=1)
            assert self.rpc(op="trusted"), "Test controller lacks Accessibility permission"
            self.rpc(op="activate", pid=pid)
        else:
            import pyatspi
            from gi.repository import GLib
            self.atspi = pyatspi
            self.GLib = GLib
            subprocess.run(["xdotool", "search", "--sync", "--pid", str(pid), "--onlyvisible", "--name",
                "Open Pile Plan Studio", "windowactivate", "--sync"], check=True,timeout=30)

    def rpc(self, **data):
        self.helper.stdin.write(json.dumps(data) + "\n")
        self.helper.stdin.flush()
        assert select.select([self.helper.stdout], [], [], 35)[0], "Accessibility controller timeout"
        response = json.loads(self.helper.stdout.readline())
        assert response["ok"], response
        return response["result"]

    def snapshot(self):
        if self.mac:
            self.tree = self.rpc(op="snapshot", pid=self.pid)
            return self.tree
        # GTK/WebKit may retire an accessible object or its Text interface.
        # Retry a complete observation; never use a partially collected tree.
        for attempt in range(4):
            try: return self.linux_snapshot()
            except self.GLib.GError as error:
                message = str(error).lower()
                retired = "does not exist" in message or (
                    "no such interface" in message and "org.a11y.atspi.text" in message)
                if not retired or attempt==3: raise
                time.sleep(0.2)

    def linux_snapshot(self):
        desktop = self.atspi.Registry.getDesktop(0)
        apps = [a for a in desktop if a.get_process_id() == self.pid]
        assert len(apps) == 1, "Packaged app missing from AT-SPI desktop"
        self.elements = []
        self.tree = []
        def walk(e, parent=-1, depth=0):
            if depth > 35 or len(self.tree) > 18000: return
            ident = len(self.tree)
            self.elements.append(e)
            node = dict(id=ident, parent=parent, role=e.getRoleName(), name=e.name,
                description=e.description, enabled=e.getState().contains(self.atspi.STATE_ENABLED),
                checked=e.getState().contains(self.atspi.STATE_CHECKED))
            try: node["rect"] = list(e.queryComponent().getExtents(self.atspi.DESKTOP_COORDS))
            except NotImplementedError: pass
            try: node["value"] = e.queryText().getText(0, -1)
            except NotImplementedError: pass
            self.tree.append(node)
            for child in e:
                if child: walk(child, ident, depth+1)
        walk(apps[0])
        return self.tree

    @staticmethod
    def label(node):
        return node.get("name") or node.get("value") or node.get("description", "")

    @staticmethod
    def button(node):
        return node["role"] in ("AXButton", "push button", "toggle button", "AXCheckBox", "check box")

    def find(self, name, button=False, refresh=True):
        if refresh: self.snapshot()
        names = name if isinstance(name, tuple) else (name,)
        return [n for n in self.tree if self.label(n) in names and (not button or self.button(n))]

    def wait(self, predicate, timeout=30):
        deadline = time.monotonic()+timeout
        while time.monotonic() < deadline:
            self.snapshot()
            result = predicate(self.tree)
            if result: return result
            time.sleep(0.3)
        raise AssertionError("Timed out waiting for expected native UI state")

    def wait_name(self, name, timeout=30):
        return self.wait(lambda _: self.find(name, refresh=False), timeout)

    def verify_version(self, expected):
        # WebKit does not expose the decorative titlebar version on Linux.
        # The About panel provides the product version as ordinary text.
        self.click("File")
        self.click("About")
        version = re.compile(r"(?<![\d.])" + re.escape(expected) + r"(?![\d.])")
        self.wait(lambda tree: any(version.search(self.label(node)) for node in tree))

    def press(self, node, physical=False):
        assert node.get("enabled", True), f"Disabled control: {node}"
        if physical:
            x,y,w,h = node["rect"]
            assert w > 0 and h > 0, node
            if self.mac: self.rpc(op="click", x=x+w/2, y=y+h/2)
            else: subprocess.run(["xdotool", "mousemove", str(int(x+w/2)), str(int(y+h/2)), "click", "1"], check=True)
        elif self.mac:
            self.rpc(op="press", id=node["id"])
        else:
            action = self.elements[node["id"]].queryAction()
            indexes = [i for i in range(action.nActions) if action.getName(i) in ("click", "press", "activate", "toggle")]
            assert indexes and action.doAction(indexes[0]), f"No accessible press action: {node}"
        time.sleep(0.35)

    def click(self, name):
        candidates = self.find(name, button=True)
        assert len(candidates) == 1, f"Expected one control {name!r}: {candidates}"
        self.press(candidates[0])

    def check(self, name, checked):
        nodes=self.find(name,button=True)
        assert len(nodes)==1 and "checked" in nodes[0], nodes
        if nodes[0]["checked"] != checked: self.press(nodes[0],physical=not self.mac)
        assert self.find(name,button=True)[0]["checked"] == checked

    def key(self, key, *modifiers):
        if self.mac:
            codes = {"a":0,"s":1,"d":2,"g":5,"z":6,"x":7,"c":8,"v":9,"o":31,"l":37,
                "return":36,"escape":53,"tab":48,"space":49,"equal":24,"minus":27,"0":29}
            self.rpc(op="key", code=codes[key], modifiers=list(modifiers))
        else:
            names = {"meta":"super", "ctrl":"ctrl", "shift":"shift", "alt":"alt"}
            special = {"return":"Return","escape":"Escape","tab":"Tab","space":"space","equal":"equal","minus":"minus"}
            subprocess.run(["xdotool", "key", "--clearmodifiers", "+".join([names[m] for m in modifiers]+[special.get(key,key)])], check=True)
        time.sleep(0.25)

    def shortcut(self, key, *modifiers):
        self.key(key, "meta" if self.mac else "ctrl", *modifiers)

    def text(self, value):
        if self.mac: self.rpc(op="text", value=value)
        else:
            subprocess.run(["xclip", "-selection", "clipboard"], input=value.encode(), check=True)
            self.key("v", "ctrl")
        time.sleep(0.3)

    def evidence(self, output, name):
        self.snapshot()
        output = Path(output)
        (output / (name+".json")).write_text(json.dumps(self.tree, ensure_ascii=False, indent=2), encoding="utf-8")
        command = ["screencapture", "-x"] if self.mac else ["import", "-window", "root"]
        subprocess.run(command+[str(output / (name+".png"))], check=True)

    def close(self):
        if self.mac: self.helper.terminate(); self.helper.wait(timeout=5)
