import {render} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import ViewerMarkerGraphics from "./ViewerMarkerGraphics.tsx";
import type {ViewerMarkerGraphic} from "./viewerMarkerPresentation.ts";
import {renderPileSymbolSvgChildren} from "../../../viewer/pileSymbols.ts";
vi.mock("../../../viewer/pileSymbols.ts",async importOriginal=>{
  const actual=await importOriginal<typeof import("../../../viewer/pileSymbols.ts")>();
  return {...actual,renderPileSymbolSvgChildren:vi.fn(actual.renderPileSymbolSvgChildren)};
});
const marker=(id:number):ViewerMarkerGraphic=>({id,key:`load-point:${id}`,kind:"load-point",x:id*20,y:30,
  scale:1,drawPriority:20,ring:null,halo:null,locked:false,opacity:1,
  appearance:{type:"pile",symbol:{baseShape:"circle",fillPattern:"full"},color:"red",smallDot:false}});
it("reuses symbols across selection/hover changes while updating rings, styles and scale",()=>{
  const graphics=[marker(1),marker(2)];
  const view=render(<svg><ViewerMarkerGraphics graphics={graphics}/></svg>);
  const initial=vi.mocked(renderPileSymbolSvgChildren).mock.calls.length;
  const selected=graphics.map(g=>({...g,appearance:{...g.appearance}}));
  selected[0]={...selected[0],ring:{color:"selection",radius:7.75}};
  view.rerender(<svg><ViewerMarkerGraphics graphics={selected}/></svg>);
  expect(renderPileSymbolSvgChildren).toHaveBeenCalledTimes(initial);
  expect(view.container.querySelector('circle[stroke="#ed7100"]')).not.toBeNull();
  const changed=[{...marker(1),scale:2,appearance:{type:"pile" as const,symbol:{baseShape:"circle" as const,fillPattern:"full" as const},color:"blue",smallDot:false}},marker(2)];
  view.rerender(<svg><ViewerMarkerGraphics graphics={changed}/></svg>);
  expect(renderPileSymbolSvgChildren).toHaveBeenCalledTimes(initial+1);
  expect(view.container.querySelector('circle[stroke="#ed7100"]')).toBeNull();
});
it("refreshes CPT inspection styling and capacity halos when their inputs change",()=>{
  const cpt:ViewerMarkerGraphic={...marker(8),kind:"cpt",key:"cpt:8",
    appearance:{type:"cpt",label:"8",labelScale:1,selectedStyle:false,inspectedOnly:false}};
  const load={...marker(1),halo:{kind:"above" as const,intensity:0.5,opacity:1}};
  const view=render(<svg><ViewerMarkerGraphics graphics={[cpt,load]}/></svg>);
  const before=view.container.querySelector('#viewer-status-halo-1 stop')?.getAttribute('stop-color');
  view.rerender(<svg><ViewerMarkerGraphics graphics={[
    {...cpt,appearance:{type:"cpt",label:"Test CPT",labelScale:0.8,selectedStyle:true,inspectedOnly:false}},
    {...load,halo:{kind:"missing",intensity:0,opacity:0.28}},
  ]}/></svg>);
  expect(view.container.querySelector('.viewer-cpt-triangle.is-selected text')?.textContent).toBe("Test CPT");
  expect(view.container.querySelector('#viewer-status-halo-1 stop')?.getAttribute('stop-color')).not.toBe(before);
  expect(view.container.querySelector('.viewer-status-halos > g')?.getAttribute('opacity')).toBe("0.28");
});
it("draws large sets of status halos without per-marker raster filters",()=>{
  const graphics=Array.from({length:1155},(_,i)=>({...marker(i+1),halo:{kind:"above" as const,intensity:0.5,opacity:1}}));
  const view=render(<svg><ViewerMarkerGraphics graphics={graphics}/></svg>);
  expect(view.container.querySelectorAll('.viewer-status-halos > g')).toHaveLength(1155);
  expect(view.container.querySelectorAll('.viewer-status-halos [filter]')).toHaveLength(0);
});
