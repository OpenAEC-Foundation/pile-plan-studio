import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdviceImportPreviewController } from "./adviceImportPreviewController.ts";
import { createEmptyImportDrafts, type ImportDrafts } from "../../domain/imports/projectImportModel.ts";
import { createEmptyAdviceDraft } from "../../domain/imports/adviceImportModel.ts";
import type { ProjectImportPreview } from "../../core/adviceImportContract.ts";

test("late joint preview cannot make a newer selection ready", async () => {
  let drafts: ImportDrafts<File> = { ...createEmptyImportDrafts<File>(), advice: createEmptyAdviceDraft<File>() };
  let resolve!: (result: ProjectImportPreview) => void;
  const result = new Promise<ProjectImportPreview>(r => { resolve = r; });
  const controller = createAdviceImportPreviewController({ readDrafts: () => drafts, update: f => { drafts = f(drafts); },
    discoverSource: async () => { throw new Error("not used"); }, previewProject: async () => result,
    readMode: () => "refresh", contextKey: () => "one" });
  const running = controller.preview();
  await Promise.resolve();
  drafts = { ...drafts, advice: { ...drafts.advice!, generation: 1, previewState: { status: "empty" } } };
  resolve({ canApply: true, conflicts: [], diagnostics: [], uniqueValueCount: 1, importedValueCount: 1, exactDuplicateCount: 0, orphanValueCount: 0 });
  await running;
  assert.equal(drafts.advice!.previewState.status, "empty");
});
import { addAdviceSource, removeAdviceSource, setAdviceSourceSelected } from "../../domain/imports/adviceImportModel.ts";
import type { ImportSourcePreview } from "../../core/coreImportContract.ts";

test("a removed file cannot reappear when discovery finishes", async () => {
  let drafts: ImportDrafts<File>={...createEmptyImportDrafts<File>(),advice:addAdviceSource(createEmptyAdviceDraft<File>(),"a",new File(["data"],"a.csv"))};
  let resolve!: (p:ImportSourcePreview)=>void;
  let started!: ()=>void;
  const pending=new Promise<ImportSourcePreview>(r=>{resolve=r;}), reached=new Promise<void>(r=>{started=r;});
  const controller=createAdviceImportPreviewController({readDrafts:()=>drafts,update:f=>{drafts=f(drafts);},readMode:()=>"refresh",contextKey:()=>"one",
    discoverSource:()=>{started();return pending;},previewProject:async()=>{throw new Error("not used");}});
  const running=controller.discover("a");await reached;
  drafts={...drafts,advice:removeAdviceSource(drafts.advice!,"a")};
  resolve({details:{kind:"foundation-advice",advice:{sourceId:"a",sheets:[],suggestedSelection:[],diagnostics:[]}}} as unknown as ImportSourcePreview);
  await running;assert.deepEqual(drafts.advice!.sources,[]);
});

for (const change of ["mode","context","dispose"] as const) test(`joint preview discards stale ${change}`,async()=>{
  let mode:"refresh"|"new-project"="refresh",context="one";
  let resolve!: (v:ProjectImportPreview)=>void,started!:()=>void;
  const pending=new Promise<ProjectImportPreview>(r=>{resolve=r;}),reached=new Promise<void>(r=>{started=r;});
  let drafts:ImportDrafts<File>={...createEmptyImportDrafts<File>(),advice:createEmptyAdviceDraft<File>()};
  const controller=createAdviceImportPreviewController({readDrafts:()=>drafts,update:f=>{drafts=f(drafts);},readMode:()=>mode,contextKey:()=>context,
    discoverSource:async()=>{throw new Error("not used");},previewProject:()=>{started();return pending;}});
  const running=controller.preview();await reached;
  if(change==="mode")mode="new-project";
  if(change==="context")context="two";
  if(change==="dispose")controller.invalidate();
  resolve({canApply:true,conflicts:[],diagnostics:[],uniqueValueCount:1,importedValueCount:1,exactDuplicateCount:0,orphanValueCount:0});
  await running;
  assert.notEqual(drafts.advice!.previewState.status,"ready");
});

test("excluding a real advice during its file read prevents validation of stale bytes",async()=>{
  let finish!: (v:ArrayBuffer)=>void,started!:()=>void, calls=0;
  const pending=new Promise<ArrayBuffer>(r=>{finish=r;}), reached=new Promise<void>(r=>{started=r;});
  const file=new File(["data"],"a.csv");
  Object.defineProperty(file,"arrayBuffer",{value:()=>{started();return pending;}});
  let advice=addAdviceSource(createEmptyAdviceDraft<File>(),"a",file);
  advice.sources[0].discovery={status:"ready",requestId:1,preview:{sourceId:"a",sheets:[],suggestedSelection:[],diagnostics:[]}};
  let drafts:ImportDrafts<File>={...createEmptyImportDrafts<File>(),advice};
  const controller=createAdviceImportPreviewController({readDrafts:()=>drafts,update:f=>{drafts=f(drafts);},readMode:()=>"refresh",contextKey:()=>"one",
    discoverSource:async()=>{throw new Error("not used");},previewProject:async()=>{calls++;throw new Error("must not validate excluded bytes");}});
  const running=controller.preview();await reached;
  drafts={...drafts,advice:setAdviceSourceSelected(drafts.advice!,"a",false)};
  finish(new ArrayBuffer(0));await running;
  assert.equal(calls,0);assert.equal(drafts.advice!.previewState.status,"empty");
});

test("a new project waits for load-point and CPT files before joint validation and clears old totals", async () => {
  let drafts: ImportDrafts<File>={...createEmptyImportDrafts<File>(),advice:{...createEmptyAdviceDraft<File>(),previewState:{status:"ready",requestId:1,preview:{canApply:true,conflicts:[],diagnostics:[],uniqueValueCount:2,importedValueCount:2,exactDuplicateCount:0,orphanValueCount:0}}}};
  let calls=0;
  const controller=createAdviceImportPreviewController({readDrafts:()=>drafts,update:f=>{drafts=f(drafts);},readMode:()=>"new-project",contextKey:()=>"one",
    discoverSource:async()=>{throw new Error("not used");},previewProject:async()=>{calls++;return {canApply:true,conflicts:[],diagnostics:[],uniqueValueCount:2,importedValueCount:2,exactDuplicateCount:0,orphanValueCount:0};}});
  await controller.preview();
  assert.equal(calls,0);assert.equal(drafts.advice!.previewState.status,"empty");
  drafts={...drafts,"load-points":{...drafts["load-points"],file:new File(["1,0,0,100"],"loads.csv")}};
  await controller.preview();assert.equal(calls,0);
  drafts={...drafts,cpts:{...drafts.cpts,file:new File(["1,0,0"],"cpts.csv")}};
  await controller.preview();assert.equal(calls,1);assert.equal(drafts.advice!.previewState.status,"ready");
});

import { setAdviceSheetSelection } from '../../domain/imports/adviceImportModel.ts';
import { prepareAdviceSource } from './projectImportRequest.ts';
test('explicit worksheet profiles reach discovery and stale responses cannot undo a profile choice', async()=>{
 let advice=addAdviceSource(createEmptyAdviceDraft<File>(),'a',new File(['x'],'a.xlsx'));
 advice=setAdviceSheetSelection(advice,'a',[{sheetName:'Blad1',profile:'auto'}]);
 let drafts:ImportDrafts<File>={...createEmptyImportDrafts<File>(),advice};
 let resolve!:(p:ImportSourcePreview)=>void, started!:()=>void;
 const pending=new Promise<ImportSourcePreview>(r=>resolve=r),reached=new Promise<void>(r=>started=r);
 const controller=createAdviceImportPreviewController({readDrafts:()=>drafts,update:f=>drafts=f(drafts),readMode:()=> 'refresh',contextKey:()=> 'one',
 discoverSource:()=>{started();return pending;},previewProject:async()=>{throw new Error('unused');}});
 const running=controller.discover('a');await reached;
 drafts={...drafts,advice:setAdviceSheetSelection(drafts.advice!,'a',[{sheetName:'Blad1',profile:'capacity-columns'}])};
 assert.equal(drafts.advice!.sources[0].discovery.status,'empty');
 const input=await prepareAdviceSource(drafts.advice!.sources[0],true);
 assert.deepEqual(input.profileOptions.adviceSheets,[{sheetName:'Blad1',profile:'capacity-columns'}]);
 resolve({details:{kind:'foundation-advice',advice:{sourceId:'a',sheets:[],suggestedSelection:[],diagnostics:[]}}} as unknown as ImportSourcePreview);
 await running;
 assert.equal(drafts.advice!.sources[0].discovery.status,'empty');
 assert.equal(drafts.advice!.sources[0].sheetSelection![0].profile,'capacity-columns');
});
