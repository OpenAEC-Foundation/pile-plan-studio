"""The four agreed #47 scenarios, against a real uninstrumented desktop package."""
import copy
import csv
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import traceback
import xml.etree.ElementTree as ET
import zipfile
from ui import UI
from process_identity import is_application_process

binary, output_arg = sys.argv[1:3]
portable = len(sys.argv)>3 and sys.argv[3]=="portable"
output = Path(output_arg).resolve()
output.mkdir(parents=True, exist_ok=True)
files = output / "Bestanden met spaties é"
files.mkdir(exist_ok=True)
sample = json.loads(Path("sample_project/sample_project.ifcpp").read_text(encoding="utf-8"))
expected_version=json.loads(Path("apps/pile-plan-studio/package.json").read_text(encoding="utf-8"))["version"]
first = copy.deepcopy(sample)
first["metadata"]["name"] = "Proef één α"
second = copy.deepcopy(sample)
second["metadata"]["name"] = "Tweede proef β"
source = files / "Project één α.ifcpp"
other = files / "Ander project β.ifcpp"
source.write_text(json.dumps(first, ensure_ascii=False), encoding="utf-8")
other.write_text(json.dumps(second, ensure_ascii=False), encoding="utf-8")
saved = files / "Opgeslagen één α.ifcpp"
association_stage = "file-argument-delivery" if portable else "os-association"
report = {"package":binary, "version":expected_version, "format":"AppImage" if portable else "installed", "scenarios":{name:{"status":"NOT RUN"} for name in
    ("screen-and-drawing", "native-files", association_stage, "optimization")}}
user_directory = tempfile.TemporaryDirectory(prefix="pile-plan-acceptance-user-")
if sys.platform!="darwin":
    for kind in ("CONFIG","DATA","CACHE"):
        os.environ[f"XDG_{kind}_HOME"]=str(Path(user_directory.name)/kind.lower())
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
def project(path, evidence=None):
    contents=wait_file(path)
    if evidence: (output/evidence).write_bytes(contents)
    return json.loads(contents)
def content(p):
    # Version/timestamps are serialization metadata, not user project content.
    return {k:v for k,v in p.items() if k not in ("application", "metadata")}
def native_dialog():
    ui.wait(lambda tree:[n for n in tree if n["role"] in ("AXSheet", "dialog", "file chooser")], timeout=15)
def choose_path(path, save=False):
    native_dialog()
    if ui.mac:
        sheets=sum(n["role"]=="AXSheet" for n in ui.snapshot())
        ui.key("g", "meta", "shift")
        ui.wait(lambda tree:sum(n["role"]=="AXSheet" for n in tree)>sheets)
        ui.shortcut("a")
        ui.text(str(path.parent if save else path))
        ui.key("return")
        ui.wait(lambda tree:sum(n["role"]=="AXSheet" for n in tree)==sheets)
        if save:
            fields = [n for n in ui.snapshot() if n["role"]=="AXTextField" and n.get("editable") and n.get("description")!="tag editor"]
            assert len(fields)==1, f"Native Save As field ambiguous: {fields}"
            ui.rpc(op="set", id=fields[0]["id"], value=path.name)
            time.sleep(0.3)
        action="Save" if save else "Open"
        controls=ui.wait(lambda _: [n for n in ui.find(action,button=True,refresh=False) if n.get("enabled",True)])
        ui.press(controls[-1],physical=True)
    else:
        ui.key("l", "ctrl")
        ui.shortcut("a")
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
def close_backstage():
    buttons=ui.find("File",button=True)
    assert len(buttons)==2, buttons
    ui.press(max(buttons,key=lambda n:n["rect"][2]),physical=True)
    ui.wait(lambda _: len(ui.find("File",button=True,refresh=False))==1)
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
    ui.verify_version(expected_version)
    ui.evidence(output,"product-version")
    close_backstage()
    with (output / "processes.txt").open("a") as f:
        f.write(subprocess.check_output(["ps","-p",str(app.pid),"-o","pid=,command="],text=True))
    if sys.platform!="darwin":
        executable=os.readlink(f"/proc/{app.pid}/exe")
        if portable: assert executable.startswith("/tmp/.mount_") and executable.endswith("/usr/bin/pile-plan-studio"), executable
        else: assert executable=="/usr/bin/pile-plan-studio", executable
        report["executable"]=executable
    else:
        identity=ui.rpc(op="identity",pid=app.pid)
        assert identity["executable"]==binary, identity
        report["executable"]=identity["executable"]

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
    actual=project(saved,"native-roundtrip.ifcpp")
    assert actual["metadata"]["name"] == first["metadata"]["name"]
    assert actual["inputs"]==first["inputs"], "Native round trip changed source data"
    for original_plan in first["user_state"]["pile_plans"]:
        round_trip=next(p for p in actual["user_state"]["pile_plans"] if p["id"]==original_plan["id"])
        for field in ("selected_piles","locked_load_point_ids","active_pile_sizes","active_pile_tip_levels"):
            assert round_trip[field]==original_plan[field], f"Native save changed {field}"
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
    expected_points={p["id"]:p for p in first["inputs"]["load_points"]}
    assert {int(row[0]) for row in rows[1:]}==set(expected_points), "CSV lost or duplicated load point IDs"
    for row in rows[1:]:
        point=expected_points[int(row[0])]
        assert [float(v) for v in row[1:4]]==[point["x_mm"],point["y_mm"],point["design_load_kn"]], "CSV changed source coordinates/loads"
    xlsx_file=files / "Palenplan é β.xlsx"
    ui.click("Export Excel"); choose_path(xlsx_file,save=True)
    with zipfile.ZipFile(io.BytesIO(wait_file(xlsx_file))) as archive:
        assert archive.testzip() is None and "xl/workbook.xml" in archive.namelist()
        sheets=[n for n in archive.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
        assert sheets and any(archive.read(n).count(b"<row")>=329 for n in sheets), "Export omitted load point rows"
        ns={"s":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        shared=["".join(e.itertext()) for e in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si",ns)]
        sheet=ET.fromstring(archive.read(sheets[0]))
        ids=[]
        for row in sheet.findall("s:sheetData/s:row",ns)[1:]:
            cell=row.find("s:c",ns)
            value=cell.findtext("s:v",namespaces=ns)
            ids.append(int(shared[int(value)] if cell.get("t")=="s" else value))
        assert len(ids)==328 and set(ids)==set(expected_points), "Excel changed exported load point IDs"
    close_backstage()
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
    ui.wait(lambda tree: any(ui.label(n).startswith("Elapsed:") for n in tree))
    ui.evidence(output,"optimization-running")
    ui.click("Cancel")
    ui.wait(lambda _: not ui.find("Cancel",button=True,refresh=False),timeout=30)
    save_current()
    after_cancel=project(saved,"optimization-cancelled.ifcpp")
    assert content(after_cancel)==content(actual), "Cancellation persisted transient project content"
    ui.evidence(output,"optimization-cancelled")
    # A fresh run saves as a new plan so one atomic result/undo is observable.
    if not ui.find("Save as new pile plan",button=True):
        disclosures=[n for n in ui.snapshot() if ui.button(n) and ui.label(n).startswith("Save as")]
        assert len(disclosures)==1, disclosures
        ui.press(disclosures[0])
    ui.check("Save as new pile plan", True)
    ui.check("Optimize coherence", False)
    save_current()
    baseline=project(saved,"optimization-baseline.ifcpp")
    optimize_buttons=ui.find("Optimize",button=True)
    ui.press(optimize_buttons[-1])
    ui.wait_name("Last calculated result:",timeout=180)
    save_current()
    solved=project(saved,"optimization-result.ifcpp")
    assert len(solved["user_state"]["pile_plans"])==len(baseline["user_state"]["pile_plans"])+1
    assert any(p.get("ilp_result") for p in solved["user_state"]["pile_plans"]), "No persisted native solver result"
    ui.evidence(output,"optimization-applied")
    undo=[n for n in ui.snapshot() if ui.button(n) and ui.label(n).startswith("Undo: ") and ui.label(n).endswith("(Ctrl+Z)")]
    assert len(undo)==1, undo
    ui.press(undo[0],physical=True)
    save_current()
    undone=project(saved,"optimization-undone.ifcpp")
    assert undone["user_state"]["pile_plans"]==baseline["user_state"]["pile_plans"], "One undo failed to restore pre-run plans"
    ui.evidence(output,"optimization-undone")
    passed(stage, native_run=True,progress_visible=True,cancel_acknowledged=True,cancel_preserves_plans=True,
        result_committed=True,atomic_undo=True)

    stage=association_stage
    stop_app()
    if portable:
        log=(output/"application.log").open("a")
        app=subprocess.Popen([binary,str(other)],stdout=log,stderr=log)
    elif sys.platform=="darwin":
        bundle=Path(binary).parents[2]
        subprocess.run(["/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister","-f",str(bundle)],check=True)
        subprocess.run(["open",str(other)],check=True)
    else:
        info=subprocess.check_output(["gio","info","-a","standard::content-type",str(other)],text=True)
        (output/"association-file-info.txt").write_text(info)
        mime=next(line.split(": ",1)[1].strip() for line in info.splitlines() if line.strip().startswith("standard::content-type:"))
        assert mime=="application/x-ifcpp", f"IFCPP MIME type missing from package: {mime}"
        handler=subprocess.check_output(["xdg-mime","query","default",mime],text=True).strip()
        assert handler=="Open Pile Plan Studio.desktop", f"Wrong installed handler: {handler}"
        subprocess.run(["gio","open",str(other)],check=True,timeout=15)
    # Locate only this product's native process, not the controller or launcher.
    deadline=time.monotonic()+30
    pid=None
    while time.monotonic()<deadline:
        if sys.platform=="darwin":
            entries=subprocess.check_output(["ps","-axo","pid=,comm="],text=True)
            candidates=[]
            for line in entries.splitlines():
                if not line.strip().endswith("/pile-plan-studio"): continue
                process_id, executable = line.strip().split(None,1)
                process_id = int(process_id)
                arguments = subprocess.run(["ps","-ww","-p",str(process_id),"-o","args="],capture_output=True,text=True)
                if arguments.returncode == 0 and is_application_process(
                        executable, arguments.stdout.split(), binary, pid=process_id):
                    candidates.append((process_id, executable))
        else:
            # Linux comm is truncated to 15 characters. Match the actual delivered
            # executable, as in the package probe, rather than a display name.
            candidates=[]
            for process in Path("/proc").iterdir():
                if not process.name.isdigit(): continue
                try:
                    executable=os.readlink(process/"exe")
                    arguments=[os.fsdecode(value) for value in (process/"cmdline").read_bytes().split(b"\0") if value]
                except (FileNotFoundError,PermissionError,ProcessLookupError): continue
                process_id=int(process.name)
                if is_application_process(executable, arguments, binary, portable=portable,
                        pid=process_id, launched_pid=app.pid if portable else None):
                    candidates.append((process_id, executable))
        if len(candidates)==1: pid, associated_executable=candidates[0]; break
        time.sleep(0.5)
    assert pid, "OS association did not launch the installed application"
    ui=UI(pid)
    if ui.mac: associated_executable=ui.rpc(op="identity",pid=pid)["executable"]
    if portable: assert associated_executable.startswith("/tmp/.mount_") and associated_executable.endswith("/usr/bin/pile-plan-studio")
    else: assert associated_executable==binary, associated_executable
    with (output/"processes.txt").open("a") as f:
        f.write(subprocess.check_output(["ps","-p",str(pid),"-o","pid=,command="],text=True))
    ui.wait_name(second["metadata"]["name"],timeout=45)
    ui.evidence(output,"association-cold")
    command=[binary,str(source)] if portable else (["open",str(source)] if ui.mac else ["gio","open",str(source)])
    subprocess.Popen(command,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    ui.wait_name(first["metadata"]["name"],timeout=30)
    os.kill(pid,0)
    ui.evidence(output,"association-warm")
    passed(stage,cold=True,warm_same_process=True,pid=pid,executable=associated_executable)
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
    user_directory.cleanup()
