"""Inspect the actual signed app through OS accessibility. No in-app test bridge."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

binary, output_arg = sys.argv[1:3]
output = Path(output_arg).resolve()
output.mkdir(parents=True, exist_ok=True)
log = (output / "launch.log").open("w")
app = subprocess.Popen([binary], stdout=log, stderr=log)
try:
    time.sleep(12)
    assert app.poll() is None, "Packaged app exited before inspection"
    (output / "process.txt").write_text(subprocess.check_output(
        ["ps", "-p", str(app.pid), "-o", "pid=,command="], text=True))
    if sys.platform == "darwin":
        helper = subprocess.Popen([os.environ["AX_HELPER"]], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, text=True, bufsize=1)
        def rpc(**data):
            helper.stdin.write(json.dumps(data) + "\n"); helper.stdin.flush()
            response = json.loads(helper.stdout.readline())
            assert response["ok"], response
            return response["result"]
        assert rpc(op="trusted"), "CI test controller lacks Accessibility permission"
        rpc(op="activate", pid=app.pid)
        tree = rpc(op="snapshot", pid=app.pid)
        subprocess.run(["screencapture", "-x", str(output / "screen.png")], check=True)
        helper.terminate()
    else:
        import pyatspi
        desktop = pyatspi.Registry.getDesktop(0)
        candidates = [a for a in desktop if a.get_process_id() == app.pid]
        assert len(candidates) == 1, [(a.name,a.get_process_id()) for a in desktop]
        tree = []
        def walk(e, parent=-1, depth=0):
            if depth > 35 or len(tree) > 18000: return
            ident = len(tree)
            node = dict(id=ident, parent=parent, role=e.getRoleName(), name=e.name,
                description=e.description, enabled=e.getState().contains(pyatspi.STATE_ENABLED))
            try: node["rect"] = list(e.queryComponent().getExtents(pyatspi.DESKTOP_COORDS))
            except NotImplementedError: pass
            tree.append(node)
            for child in e:
                if child: walk(child, ident, depth + 1)
        walk(candidates[0])
        subprocess.run(["import", "-window", "root", str(output / "screen.png")], check=True)
    (output / "accessibility.json").write_text(json.dumps(tree, ensure_ascii=False, indent=2))
    (output / "acceptance.txt").write_text("UI accessibility discovery only. Four acceptance scenarios: NOT RUN\n")
    print(json.dumps(dict(pid=app.pid, nodes=len(tree), named=sum(bool(n.get("name")) for n in tree))))
finally:
    app.terminate()
    try: app.wait(timeout=10)
    except subprocess.TimeoutExpired: app.kill(); app.wait()
