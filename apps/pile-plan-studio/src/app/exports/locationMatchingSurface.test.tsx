import {useLayoutEffect, useState} from "react";
import {fireEvent, render, screen,waitFor} from "@testing-library/react";
import {expect, test,vi} from "vitest";
import {LocationMatchingSurface, LocationMatchingSurfaceContext, useLocationMatchingSurface} from "./locationMatchingSurface.tsx";
import {createBuiltInLegend} from "../../viewer/legend.ts";

test("the canvas mounts after its workspace is visible and source state survives returning", () => {
  const mountedHidden: boolean[] = [];
  function Canvas() {
    useLayoutEffect(() => {mountedHidden.push(document.querySelector<HTMLElement>("#review-host")!.hidden === true);}, []);
    return <p>canvas</p>;
  }
  function Harness() {
    const surface = useLocationMatchingSurface(createBuiltInLegend([]));
    const [open, setOpen] = useState(false), [draft, setDraft] = useState("source selected");
    return <LocationMatchingSurfaceContext.Provider value={surface.value}>
      <div ref={surface.setElement} id="review-host" hidden={!surface.active}/>
      <div hidden={surface.active}><input aria-label="source" value={draft} onChange={e => setDraft(e.target.value)}/><button onClick={() => setOpen(true)}>review</button></div>
      {open && <LocationMatchingSurface><Canvas/><button onClick={() => setOpen(false)}>return</button></LocationMatchingSurface>}
    </LocationMatchingSurfaceContext.Provider>;
  }
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText("source"), {target: {value: "changed draft"}});
  fireEvent.click(screen.getByRole("button", {name: "review"}));
  expect(mountedHidden).toEqual([false]);
  fireEvent.click(screen.getByRole("button", {name: "return"}));
  expect((screen.getByLabelText("source") as HTMLInputElement).value).toBe("changed draft");
});


test("the existing title-bar history buttons operate the active editor and release it on close",async()=>{
 const {default:Workspace}=await import("../../components/domain/location-matching/LocationMatchingWorkspace.tsx");
 const {default:TitleBar}=await import("../../components/template/TitleBar.tsx");
 const {default:i18n}=await import("../../i18n/config.ts");
 const pending={links:[],added:[],removed:[],unmatched_old:[],unmatched_new:[9],proposals:[],complete:false};
 const evaluate=vi.fn().mockResolvedValue({...pending,added:[9],unmatched_new:[],complete:true});
 function Harness(){
  const surface=useLocationMatchingSurface(createBuiltInLegend([]));const [open,setOpen]=useState(true);
  return <LocationMatchingSurfaceContext.Provider value={surface.value}>
    <TitleBar projectActionKind="download" canUndo={surface.history?.canUndo??false} canRedo={surface.history?.canRedo??false}
      undoLabel={i18n.t("matchingEditor.undo")} redoLabel={i18n.t("matchingEditor.redo")} onUndo={()=>surface.history?.undo()} onRedo={()=>surface.history?.redo()}/>
    <div ref={surface.setElement} hidden={!surface.active}/>
    {open&&<Workspace mode="import" evaluate={evaluate} oldLocations={[]} newLocations={[{id:9,x_mm:null,y_mm:null}]} initial={pending} toleranceMm={1} onConfirm={()=>{}} onCancel={()=>setOpen(false)}/>}
  </LocationMatchingSurfaceContext.Provider>;
 }
 const view=render(<Harness/>);
 fireEvent.click(screen.getByRole("button",{name:i18n.t("pilePlanMatching.skip")}));
 await waitFor(()=>expect(screen.getAllByRole("button",{name:i18n.t("matchingEditor.undo")})).toHaveLength(1));
 const undo=screen.getByRole("button",{name:i18n.t("matchingEditor.undo")});
 await waitFor(()=>expect(undo.hasAttribute("disabled")).toBe(false));
 fireEvent.click(undo);
 expect(screen.getByRole("button",{name:i18n.t("exportTools.confirm")}).hasAttribute("disabled")).toBe(true);
 fireEvent.click(screen.getByRole("button",{name:i18n.t("matchingEditor.redo")}));
 expect(screen.getByRole("button",{name:i18n.t("exportTools.confirm")}).hasAttribute("disabled")).toBe(false);
 fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.cancel")}));
 expect(view.container.querySelector('.location-matching-workspace')).toBeNull();
 expect(undo.hasAttribute("disabled")).toBe(true);
});
