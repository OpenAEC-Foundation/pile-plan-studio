"""The four agreed #47 scenarios, against a real uninstrumented desktop package."""
import copy
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import traceback
import zipfile
from ui import UI

binary, output_arg = sys.argv[1:3]
output = Path(output_arg).resolve()
output.mkdir(parents=True, exist_ok=True)
files = output / "Bestanden met spaties é"
files.mkdir(exist_ok=True)
sample = json.loads(Path("sample_project/sample_project.ifcpp").read_text(encoding="utf-8"))
first = copy.deepcopy(sample)
first["metadata"]["name"] = "Proef één α"
second = copy.deepcopy(sample)
second["metadata"]["name"] = "Tweede proef β"
source = files / "Project één α.ifcpp"
other = files / "Ander project β.ifcpp"
source.write_text(json.dumps(first, ensure_ascii=False), encoding="utf-8")
other.write_text(json.dumps(second, ensure_ascii=False), encoding="utf-8")
saved = files / "Opgeslagen één α.ifcpp"
report = {"package":binary, "scenarios":{name:{"status":"NOT RUN"} for name in
    ("screen-and-drawing", "native-files", "os-association", "optimization")}}
ui = None
app = None
stage = "screen-and-drawing"

def record():
    (output / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
def passed(name, **details):
    report["scenarios"][name] = dict(status="PASS", **details)
    record()
    print("PASS: " + name, flush=True)
def wait_file(path):
    deadline = time.monotonic()+20
    while time.monotonic()<deadline:
        if path.exists() and path.stat().st_size>0:
            time.sleep(0.4)
            return path.read_bytes()
        time.sleep(0.2)
    raise AssertionError(f"App did not write {path}")
def project(path):
    return json.loads(wait_file(path))
def content(p):
    # Version/timestamps are serialization metadata, not user project content.
    return {k:v for k,v in p.items() if k not in ("application", "metadata")}
def native_dialog():
    ui.wait(lambda tree:[n for n in tree if n["role"] in ("AXSheet", "dialog", "file chooser")], timeout=15)
def choose_path(path, save=False):
    native_dialog()
    if ui.mac:
        ui.key("g", "meta", "shift")
        time.sleep(0.5)
        ui.text(str(path.parent if save else path))
        ui.key("return")
        time.sleep(0.8)
        if save:
            fields = [n for n in ui.snapshot() if n["role"]=="AXTextField" and n.get("enabled",True)]
            assert fields, "Native Save As field missing"
            field = next((n for n in fields if "Save" in ui.label(n)), fields[0])
            ui.rpc(op="set", id=field["id"], value=path.name)
            time.sleep(0.3)
        ui.key("return")
    else:
        ui.key("l", "ctrl")
        ui.text(str(path))
        ui.key("return")
    time.sleep(1)
def open_file(path):
    ui.shortcut("o")
    choose_path(path)
    ui.wait_name(first["metadata"]["name"] if path != other else second["metadata"]["name"])
def save_as(path, cancel=False):
    ui.click("File")
    ui.click("Save project as...")
    if cancel:
        native_dialog(); ui.evidence(output, "native-save-cancel"); ui.key("escape"); return
    choose_path(path, save=True)
def save_current():
    ui.shortcut("s")
    time.sleep(1)
def stop_app():
    global app, ui
    if ui: ui.close(); ui=None
    if app and app.poll() is None:
        app.terminate()
        try: app.wait(timeout=8)
        except subprocess.TimeoutExpired: app.kill(); app.wait()
    app=None
def start_app():
    global app, ui
    log = (output / "application.log").open("a")
    app = subprocess.Popen([binary], stdout=log, stderr=log)
    time.sleep(5)
    assert app.poll() is None, "Packaged process exited"
    ui=UI(app.pid)
    ui.wait_name("Load points 328 rows", timeout=45)
    with (output / "processes.txt").open("a") as f:
        f.write(subprocess.check_output(["ps","-p",str(app.pid),"-o","pid=,command="],text=True))

record()
try:
    start_app()
    tree=ui.snapshot()
    by_id={n["id"]:n for n in tree}
    def in_viewer(node):
        while node["parent"]!=-1:
            node=by_id[node["parent"]]
            if ui.label(node)=="Pile plan viewer": return True
        return False
    markers=[n for n in tree if ui.label(n).startswith("Load point ") and ui.button(n) and in_viewer(n)]
    assert len(markers)==328, f"Expected all 328 drawing hit targets, got {len(markers)}"
    chosen=markers[50]
    ui.press(chosen, physical=True)
    ui.evidence(output,"screen-selection")
    before=ui.find(ui.label(chosen),button=True)[0]["rect"]
    ui.shortcut("equal")
    ui.wait(lambda _ : ui.find(ui.label(chosen),button=True,refresh=False)[0]["rect"] != before)
    ui.evidence(output,"screen-scaled")
    ui.shortcut("0")
    passed(stage, load_point_targets=328, selection="native pointer", interface_scale="changed and reset")

    stage="native-files"
    ui.shortcut("o"); native_dialog(); ui.evidence(output,"native-open-cancel"); ui.key("escape")
    open_file(source)
    save_as(saved, cancel=True)
    assert not saved.exists(), "Cancelling Save As created a file"
    save_as(saved)
    actual=project(saved)
    assert actual["metadata"]["name"] == first["metadata"]["name"]
    assert actual["inputs"]==first["inputs"], "Native round trip changed source data"
    stable=content(actual)
    # An existing valid project is deliberately overwritten through the real dialog.
    overwritten=files / "Bestaand bestand é.ifcpp"
    overwritten.write_text(json.dumps(second),encoding="utf-8")
    save_as(overwritten)
    replacements=ui.find(("Replace","_Replace","Replace File"),button=True)
    if replacements: ui.press(replacements[0])
    assert project(overwritten)["metadata"]["name"] == first["metadata"]["name"]
    open_file(saved)
    ui.evidence(output,"native-reopened")
    ui.click("File"); ui.click("Export")
    csv_file=files / "Palenplan é α.csv"
    ui.click("Export CSV"); choose_path(csv_file,save=True)
    csv_bytes=wait_file(csv_file)
    rows=list(csv.reader(io.StringIO(csv_bytes.decode("utf-8-sig")),delimiter=";"))
    if len(rows[0])==1: rows=list(csv.reader(io.StringIO(csv_bytes.decode("utf-8-sig")),delimiter=","))
    assert len(rows)==329 and len(rows[0])>=5, f"Unexpected CSV dimensions: {len(rows)}"
    xlsx_file=files / "Palenplan é β.xlsx"
    ui.click("Export Excel"); choose_path(xlsx_file,save=True)
    with zipfile.ZipFile(io.BytesIO(wait_file(xlsx_file))) as archive:
        assert archive.testzip() is None and "xl/workbook.xml" in archive.namelist()
        sheets=[n for n in archive.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
        assert sheets and any(archive.read(n).count(b"<row")>=329 for n in sheets), "Export omitted load point rows"
    ui.click("File")
    passed(stage, unicode_and_spaces=True, cancelled_open=True,cancelled_save=True, overwritten=True,
        reopened=True,csv_data_rows=len(rows)-1,xlsx_valid=True)

    # Association is independently diagnosed below; keep the optimization proof
    # even when a package's OS integration is absent.
    stage="optimization"
    ui.click("Optimize")
    ui.wait_name("Optimization")
    # Use a long enough native ILP run to observe and cancel actual progress.
    optimize_buttons=ui.find("Optimize",button=True)
    assert len(optimize_buttons)==2, optimize_buttons
    ui.press(optimize_buttons[-1])
    ui.wait_name("Cancel",timeout=30)
    ui.evidence(output,"optimization-running")
    ui.click("Cancel")
    ui.wait(lambda _: not ui.find("Cancel",button=True,refresh=False),timeout=30)
    save_current()
    after_cancel=project(saved)
    assert after_cancel["user_state"]["pile_plans"]==actual["user_state"]["pile_plans"], "Cancellation committed a result"
    ui.evidence(output,"optimization-cancelled")
    # A fresh run saves as a new plan so one atomic result/undo is observable.
    disclosures=[n for n in ui.snapshot() if ui.button(n) and ui.label(n).startswith("Save as")]
    assert len(disclosures)==1, disclosures
    ui.press(disclosures[0])
    ui.click("Save as new pile plan")
    ui.click("Optimize coherence")
    save_current()
    baseline=project(saved)
    optimize_buttons=ui.find("Optimize",button=True)
    ui.press(optimize_buttons[-1])
    ui.wait_name("Last calculated result:",timeout=180)
    save_current()
    solved=project(saved)
    assert len(solved["user_state"]["pile_plans"])==len(baseline["user_state"]["pile_plans"])+1
    assert any(p.get("ilp_result") for p in solved["user_state"]["pile_plans"]), "No persisted native solver result"
    ui.evidence(output,"optimization-applied")
    ui.click("Undo (Ctrl+Z)")
    save_current()
    undone=project(saved)
    assert undone["user_state"]["pile_plans"]==baseline["user_state"]["pile_plans"], "One undo failed to restore pre-run plans"
    ui.evidence(output,"optimization-undone")
    passed(stage, native_run=True,progress_visible=True,cancel_acknowledged=True,cancel_preserves_plans=True,
        result_committed=True,atomic_undo=True)

    stage="os-association"
    stop_app()
    if sys.platform=="darwin":
        bundle=Path(binary).parents[2]
        subprocess.run(["/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister","-f",str(bundle)],check=True)
        subprocess.run(["open",str(other)],check=True)
    else:
        mime=subprocess.check_output(["xdg-mime","query","filetype",str(other)],text=True).strip()
        assert mime=="application/x-ifcpp", f"IFCPP MIME type missing from package: {mime}"
        handler=subprocess.check_output(["xdg-mime","query","default",mime],text=True).strip()
        assert handler=="Open Pile Plan Studio.desktop", f"Wrong installed handler: {handler}"
        subprocess.run(["xdg-open",str(other)],check=True,timeout=15)
    # Locate only this product's native process, not the controller or launcher.
    deadline=time.monotonic()+30
    pid=None
    while time.monotonic()<deadline:
        entries=subprocess.check_output(["ps","-axo","pid=,comm="],text=True)
        candidates=[int(line.split(None,1)[0]) for line in entries.splitlines() if line.strip().endswith("/pile-plan-studio") or line.strip().endswith(" pile-plan-studio")]
        if len(candidates)==1: pid=candidates[0]; break
        time.sleep(0.5)
    assert pid, "OS association did not launch the installed application"
    ui=UI(pid)
    ui.wait_name(second["metadata"]["name"],timeout=45)
    ui.evidence(output,"association-cold")
    subprocess.Popen(["open" if ui.mac else "xdg-open",str(source)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    ui.wait_name(first["metadata"]["name"],timeout=30)
    os.kill(pid,0)
    ui.evidence(output,"association-warm")
    passed(stage,cold=True,warm_same_process=True,pid=pid)
    os.kill(pid,15)
except Exception as error:
    report["scenarios"][stage]=dict(status="FAIL",error=str(error),traceback=traceback.format_exc())
    record()
    if ui:
        try: ui.evidence(output,"failure-"+stage)
        except Exception: traceback.print_exc()
    raise
finally:
    stop_app()
    record()
