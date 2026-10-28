import {act,render,screen,fireEvent,waitFor} from "@testing-library/react";
import {test,expect,vi,beforeEach} from "vitest";
import LocationMatchingWorkspace from "./LocationMatchingWorkspace.tsx";
import {reconcileLocationsCore} from "../../../core/exportRevisionCoreClient.ts";
import i18n from "../../../i18n/config.ts";
vi.mock("../../../core/exportRevisionCoreClient.ts",()=>({reconcileLocationsCore:vi.fn()}));
beforeEach(()=>vi.mocked(reconcileLocationsCore).mockReset());
const t=(key:string)=>i18n.t(`exportTools.${key}`);
const initial={links:[{old_id:1,new_id:9,distance_mm:0}],added:[],removed:[],unmatched_old:[],unmatched_new:[],proposals:[],complete:true};
const points={oldLocations:[{id:1,x_mm:0,y_mm:0}],newLocations:[{id:9,x_mm:0,y_mm:0}]};
test("hundreds of locations use one editor instead of a dropdown matrix",()=>{
  const oldLocations=Array.from({length:300},(_,i)=>({id:i+1,x_mm:i*1000,y_mm:0}));
  const newLocations=oldLocations.map(p=>({...p,id:p.id+1000}));
  const links=oldLocations.map(p=>({old_id:p.id,new_id:p.id+1000,distance_mm:0}));
  const started=performance.now();
  const view=render(<LocationMatchingWorkspace oldLocations={oldLocations} newLocations={newLocations} initial={{...initial,links}} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  console.info(`matching 300 locations: ${Math.round(performance.now()-started)}ms; ${view.container.querySelectorAll('option').length} options`);
  expect(view.container.querySelectorAll('option').length).toBeLessThan(310);
  expect(screen.queryByRole('dialog')).toBeNull();
});
test("an automatic link can be released and incomplete decisions cannot be confirmed",async()=>{
  const confirm=vi.fn(),cancel=vi.fn();
  vi.mocked(reconcileLocationsCore).mockResolvedValueOnce({...initial,links:[],unmatched_old:[1],unmatched_new:[9],proposals:[{new_id:9,candidates:[{old_id:1,distance_mm:0}]}],complete:false});
  render(<LocationMatchingWorkspace {...points} initial={initial} toleranceMm={99} onConfirm={confirm} onCancel={cancel}/>);
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickNew",{id:9})}));
  fireEvent.change(screen.getByLabelText(i18n.t("exportTools.oldChoice",{id:9})),{target:{value:""}});
  await waitFor(()=>expect((screen.getByRole("button",{name:t("confirm")}) as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(screen.getByRole("button",{name:t("inspectOldTool")}));
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickOld",{id:1})}));
  expect(screen.getByRole("button",{name:t("markRemoved")})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:t("cancel")}));
  expect(confirm).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledOnce();
});
test("bulk decisions are shown and only confirmed through the explicit confirm action",async()=>{
  const confirm=vi.fn();
  vi.mocked(reconcileLocationsCore).mockResolvedValueOnce({...initial,links:[],added:[9],removed:[1],complete:true});
  render(<LocationMatchingWorkspace {...points} initial={{...initial,links:[],unmatched_old:[1],unmatched_new:[9],complete:false}} toleranceMm={99} onConfirm={confirm} onCancel={()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:t("bulkSeparateShort")}));
  await waitFor(()=>expect((screen.getByRole("button",{name:t("confirm")}) as HTMLButtonElement).disabled).toBe(false));
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:t("confirm")}));
  expect(confirm).toHaveBeenCalledWith({links:[],added:[9],removed:[1]});
});

test("clicking a new pile and an old partner submits a validated link",async()=>{
  const unresolved={...initial,links:[],unmatched_old:[1],unmatched_new:[9],complete:false};
  vi.mocked(reconcileLocationsCore).mockClear().mockResolvedValueOnce(initial);
  const confirm=vi.fn();
  render(<LocationMatchingWorkspace {...points} initial={unresolved} toleranceMm={99} onConfirm={confirm} onCancel={()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickPartner",{id:1})}));
  await waitFor(()=>expect(reconcileLocationsCore).toHaveBeenCalledWith(expect.objectContaining({decisions:{links:[{old_id:1,new_id:9}],added:[],removed:[]}})));
  await waitFor(()=>expect((screen.getByRole("button",{name:t("confirm")}) as HTMLButtonElement).disabled).toBe(false));
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:t("confirm")}));
  expect(confirm).toHaveBeenCalledWith({links:[{old_id:1,new_id:9}],added:[],removed:[]});
});

test("an occupied partner is reassigned and its previous owner becomes the next review location",async()=>{
  const next={...initial,links:[{old_id:1,new_id:10,distance_mm:1000}],unmatched_new:[9],complete:false};
  vi.mocked(reconcileLocationsCore).mockClear().mockResolvedValueOnce(next);
  render(<LocationMatchingWorkspace {...points} newLocations={[...points.newLocations,{id:10,x_mm:1000,y_mm:0}]}
    initial={{...initial,unmatched_new:[10],complete:false}} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickPartner",{id:1})}));
  await waitFor(()=>expect(screen.getByLabelText(i18n.t("exportTools.oldChoice",{id:9}))).toBeTruthy());
  expect(reconcileLocationsCore).toHaveBeenCalledWith(expect.objectContaining({decisions:{links:[{old_id:1,new_id:10}],added:[],removed:[]}}));
});

test("a pointer click chooses the nearest pile when transparent hit areas overlap",()=>{
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockReturnValue({x:0,y:0,left:0,top:0,width:800,height:600,right:800,bottom:600,toJSON:()=>({})});
  render(<LocationMatchingWorkspace {...points} newLocations={[...points.newLocations,{id:10,x_mm:1000,y_mm:0}]}
    initial={{...initial,unmatched_new:[10],complete:false}} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:t("selectNewTool")}));
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickNew",{id:9})}),{detail:1,clientX:720,clientY:300});
  expect(screen.getByLabelText(i18n.t("exportTools.oldChoice",{id:10}))).toBeTruthy();
});

test("review starts ready to pick an old partner and advances immediately to the next unlinked new location",async()=>{
  const next={...initial,unmatched_old:[2],unmatched_new:[10],complete:false};
  vi.mocked(reconcileLocationsCore).mockClear().mockResolvedValueOnce(next);
  render(<LocationMatchingWorkspace oldLocations={[...points.oldLocations,{id:2,x_mm:1000,y_mm:0}]} newLocations={[...points.newLocations,{id:10,x_mm:1000,y_mm:0}]}
    initial={{...initial,links:[],unmatched_old:[1,2],unmatched_new:[9,10],complete:false}} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  expect((screen.getByLabelText(t("pendingFilter")) as HTMLInputElement).checked).toBe(true);
  fireEvent.change(screen.getByLabelText(t("searchLocations")),{target:{value:"9"}});
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickPartner",{id:1})}));
  await waitFor(()=>expect(screen.getByLabelText(i18n.t("exportTools.oldChoice",{id:10}))).toBeTruthy());
  expect(screen.getByRole("button",{name:i18n.t("exportTools.pickPartner",{id:2})})).toBeTruthy();
  await waitFor(()=>expect((screen.getByLabelText(t("searchLocations")) as HTMLInputElement).value).toBe(""));
});
test("Escape and an empty canvas click clear selection without canceling review",()=>{
  const cancel=vi.fn();
  const view=render(<LocationMatchingWorkspace {...points} initial={{...initial,links:[],unmatched_old:[1],unmatched_new:[9],complete:false}} toleranceMm={99} onConfirm={()=>{}} onCancel={cancel}/>);
  fireEvent.keyDown(window,{key:"Escape"});
  expect(screen.queryByLabelText(i18n.t("exportTools.oldChoice",{id:9}))).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickNew",{id:9})}));
  fireEvent.click(view.container.querySelector('.matching-canvas')!);
  expect(screen.queryByLabelText(i18n.t("exportTools.oldChoice",{id:9}))).toBeNull();
  expect(cancel).not.toHaveBeenCalled();
});
test("old hover and selection use a dashed marker while new selection is solid",()=>{
  const view=render(<LocationMatchingWorkspace {...points} initial={{...initial,links:[],unmatched_old:[1],unmatched_new:[9],complete:false}} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:t("inspectOldTool")}));
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickOld",{id:1})}));
  const old=view.container.querySelector('[data-matching-side="old"][data-location-id="1"] .matching-selection-ring');
  expect(old?.getAttribute('stroke-dasharray')).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:t("selectNewTool")}));
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickNew",{id:9})}));
  expect(view.container.querySelector('[data-matching-side="new"][data-location-id="9"] .matching-selection-ring')?.getAttribute('stroke-dasharray')).toBeNull();
});

test("choosing added advances to the remaining old location and deciding removal finishes review",async()=>{
  vi.mocked(reconcileLocationsCore).mockResolvedValueOnce({...initial,links:[],added:[9],unmatched_old:[1],complete:false})
    .mockResolvedValueOnce({...initial,links:[],added:[9],removed:[1],complete:true});
  render(<LocationMatchingWorkspace {...points} initial={{...initial,links:[],unmatched_old:[1],unmatched_new:[9],complete:false}} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:t("newPile")}));
  await waitFor(()=>expect(screen.getByRole("button",{name:t("markRemoved")})).toBeTruthy());
  fireEvent.click(screen.getByRole("button",{name:t("markRemoved")}));
  await waitFor(()=>expect((screen.getByRole("button",{name:t("confirm")}) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByRole("button",{name:t("showAllLocations")})).toBeTruthy();
});
test("an occupied location remains selectable in the explicit link editor",async()=>{
  vi.mocked(reconcileLocationsCore).mockResolvedValueOnce({...initial,links:[{old_id:1,new_id:10,distance_mm:1000}],unmatched_new:[9],complete:false});
  render(<LocationMatchingWorkspace {...points} newLocations={[...points.newLocations,{id:10,x_mm:1000,y_mm:0}]} initial={{...initial,unmatched_new:[10],complete:false}} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  const select=screen.getByLabelText(i18n.t("exportTools.oldChoice",{id:10}));
  expect((select.querySelector('option[value="1"]') as HTMLOptionElement).disabled).toBe(false);
  fireEvent.change(select,{target:{value:"1"}});
  await waitFor(()=>expect(screen.getByLabelText(i18n.t("exportTools.oldChoice",{id:9}))).toBeTruthy());
});
test("a failed link keeps the current location available for correction",async()=>{
  vi.mocked(reconcileLocationsCore).mockRejectedValueOnce("invalid_location_mapping");
  render(<LocationMatchingWorkspace {...points} initial={{...initial,links:[],unmatched_old:[1],unmatched_new:[9],complete:false}} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickPartner",{id:1})}));
  await waitFor(()=>expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.getByLabelText(i18n.t("exportTools.oldChoice",{id:9}))).toBeTruthy();
});
test("clearing selection during a pending link does not reselect a location when it finishes",async()=>{
  let resolve!:(value:typeof initial)=>void;
  vi.mocked(reconcileLocationsCore).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  render(<LocationMatchingWorkspace {...points} initial={{...initial,links:[],unmatched_old:[1],unmatched_new:[9],complete:false}} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickPartner",{id:1})}));
  fireEvent.keyDown(window,{key:"Escape"});
  await act(async()=>resolve(initial));
  expect(screen.queryByLabelText(i18n.t("exportTools.oldChoice",{id:9}))).toBeNull();
});
test("dragging empty canvas pans without clearing the current review selection",()=>{
  const view=render(<LocationMatchingWorkspace {...points} initial={{...initial,links:[],unmatched_old:[1],unmatched_new:[9],complete:false}} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  const canvas=view.container.querySelector<HTMLElement>('.matching-canvas')!;canvas.setPointerCapture=vi.fn();
  fireEvent.pointerDown(canvas,{button:0,clientX:100,clientY:100,pointerId:1});
  fireEvent.pointerMove(canvas,{clientX:140,clientY:160,pointerId:1});
  fireEvent.pointerUp(canvas,{pointerId:1});fireEvent.click(canvas);
  expect(screen.getByLabelText(i18n.t("exportTools.oldChoice",{id:9}))).toBeTruthy();
});

test("the shared coordinate grid is on by default and can be toggled",()=>{
  const view=render(<LocationMatchingWorkspace {...points} initial={initial} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  expect(view.container.querySelector('.viewer-coordinate-grid')).toBeTruthy();
  fireEvent.click(screen.getByLabelText(t("matchingGrid")));
  expect(view.container.querySelector('.viewer-coordinate-grid')).toBeNull();
  fireEvent.click(screen.getByLabelText(t("matchingGrid")));
  expect(view.container.querySelector('.viewer-coordinate-grid')).toBeTruthy();
});

test("all connection lines are shown initially and can switch to selected or hidden",()=>{
  const view=render(<LocationMatchingWorkspace {...points} newLocations={[{id:9,x_mm:1,y_mm:0}]} initial={initial} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  const lines=screen.getByLabelText(t("connectionLines"));
  expect((lines as HTMLSelectElement).value).toBe("all");
  expect(view.container.querySelectorAll('.matching-link')).toHaveLength(1);
  fireEvent.change(lines,{target:{value:"selected"}});
  expect(view.container.querySelectorAll('.matching-link')).toHaveLength(0);
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.pickNew",{id:9})}));
  expect(view.container.querySelectorAll('.matching-link')).toHaveLength(1);
  fireEvent.change(lines,{target:{value:"none"}});
  expect(view.container.querySelectorAll('.matching-link')).toHaveLength(0);
});

test("nearby locations have one thin straight center-to-center line above the symbols",()=>{
  const view=render(<LocationMatchingWorkspace {...points} newLocations={[{id:9,x_mm:1,y_mm:0}]} initial={initial} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  const oldSymbol=view.container.querySelector('[data-matching-side="old"]')!;
  const newSymbol=view.container.querySelector('[data-matching-side="new"]')!;
  const links=view.container.querySelector('.matching-connection-layer')!;
  expect(newSymbol.compareDocumentPosition(links)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const line=links.querySelector('line.matching-link')!;
  const point=(element:Element)=>element.getAttribute('transform')!.match(/translate\(([^ ]+) ([^)]+)\)/)!.slice(1);
  expect([line.getAttribute('x1'),line.getAttribute('y1')]).toEqual(point(oldSymbol));
  expect([line.getAttribute('x2'),line.getAttribute('y2')]).toEqual(point(newSymbol));
  expect(links.querySelectorAll('line')).toHaveLength(1);
  expect(links.querySelector('path')).toBeNull();
  expect(links.querySelector('.matching-link-halo')).toBeNull();
});

test("coincident locations do not show a connection line or loop",()=>{
  const view=render(<LocationMatchingWorkspace {...points} initial={initial} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  expect(view.container.querySelector('.matching-connection-layer')?.childElementCount).toBe(0);
});

test("the layer legend uses a transparent old outline and a filled new symbol that follow chrome contrast",()=>{
  const view=render(<LocationMatchingWorkspace {...points} initial={initial} toleranceMm={99} onConfirm={()=>{}} onCancel={()=>{}}/>);
  expect(view.container.querySelector('.matching-old-key circle')?.getAttribute('fill')).toBe('none');
  expect(view.container.querySelector('.matching-new-key circle')?.getAttribute('fill')).toBe('currentColor');
});
