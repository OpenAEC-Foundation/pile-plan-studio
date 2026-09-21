import {test} from "node:test";
import assert from "node:assert/strict";
import {createIlpOptimizationClient} from "./ilpOptimizationClient.ts";
import {ilpRequestForTest,ilpSolvedForTest} from "./ilpOptimizationTestSupport.ts";
import {mockIPC,clearMocks} from "@tauri-apps/api/mocks";
import type {Channel} from "@tauri-apps/api/core";
import type {IlpProgress,IlpOptimizationOutcome} from "./ilpOptimizationTypes.ts";
class TestWorker {
  static instances:TestWorker[]=[];
  onmessage:((e:any)=>void)|null=null;onerror:(()=>void)|null=null;terminated=false;request:any;
  constructor(){TestWorker.instances.push(this);}
  postMessage(request:any){this.request=request;}
  terminate(){this.terminated=true;}
  finish(id:string,outcome:unknown){this.onmessage?.({data:{kind:"finished",run_id:id,outcome}});}
}
test("stop uses the best validated snapshot, cancellation still discards it", async()=>{
  const previous=globalThis.Worker; globalThis.Worker=TestWorker as any;
  const client=createIlpOptimizationClient();
  try {
    const request=ilpRequestForTest();
    const scores:Array<number|null>=[];
    const run=client.start(request,p=>scores.push(p.incumbent_objective)); const worker=TestWorker.instances.at(-1)!;
    const solution={...ilpSolvedForTest.solution,proof:"feasible",score_milli:5000};
    const diagnostics=[{code:"skipped_unsolvable_units",load_point_ids:[99],blocking:false}];
    const update=(s:unknown)=>worker.onmessage?.({data:{kind:"progress",run_id:request.runId,progress:{phase:"spatial",elapsed_ms:100,incumbent_objective:5000,best_bound:0,relative_gap:1,best_solution:s,diagnostics}}});
    update(solution); update({...solution,score_milli:8000}); update({...solution,cost:solution.budget+1,score_milli:0});
    assert.deepEqual(scores,[5000,5000,5000]);
    run.stop(); const result=await run.finished;
    assert.equal(result.status,"solved");
    if(result.status==="solved") assert.ok(result.diagnostics.some(d=>d.code==="skipped_unsolvable_units" && d.load_point_ids[0]===99));
    if(result.status==="solved") {assert.equal(result.solution.score_milli,5000);assert.equal(result.solution.termination,"stopped");assert.equal(result.solution.proof,"feasible");}
    assert.ok(worker.terminated);
    const cancelled=client.start(request,()=>{}); cancelled.cancel(); assert.equal((await cancelled.finished).status,"cancelled");
    const empty=client.start(request,()=>{});empty.stop();assert.deepEqual(await empty.finished,{status:"no_solution",phase:"preparation",termination:"stopped"});
  } finally {client.dispose();globalThis.Worker=previous;}
});
test("worker cancellation, late events, crash and session reuse",async()=>{
  const previous=globalThis.Worker;
  globalThis.Worker=TestWorker as any;
  const client=createIlpOptimizationClient();
  try {
    const request=ilpRequestForTest();let progress=0;
    const a=client.start({...request,runId:"a"},()=>progress++);
    const first=TestWorker.instances.at(-1)!;
    first.finish("unknown",ilpSolvedForTest);assert.throws(()=>client.start(request,()=>{}));
    a.cancel();assert.deepEqual(await a.finished,{status:"cancelled"});assert.ok(first.terminated);
    const b=client.start({...request,runId:"b"},()=>progress++);const second=TestWorker.instances.at(-1)!;
    first.onerror?.();first.finish("a",ilpSolvedForTest);a.cancel();assert.equal(second.terminated,false);
    second.finish("b",ilpSolvedForTest);assert.deepEqual(await b.finished,ilpSolvedForTest);
    const c=client.start({...request,runId:"c"},()=>progress++);assert.equal(TestWorker.instances.at(-1),second);
    second.onerror?.();assert.equal((await c.finished).status,"failed");assert.ok(second.terminated);
    assert.equal(progress,0);
  } finally {client.dispose();globalThis.Worker=previous;}
});

test("native stop waits for interruption and retains newer progress; cancel overrides stop",async()=>{
  const previous=globalThis.window;
  globalThis.window={crypto:globalThis.crypto} as any;
  let complete!:(outcome:IlpOptimizationOutcome)=>void;
  let channel!:Channel<IlpProgress>;
  let cancellations=0;
  mockIPC((command,payload)=>{
    if(command==="cancel_ilp_optimization"){cancellations++;return;}
    if(command==="ilp_optimize") {channel=(payload as any).progress;return new Promise<IlpOptimizationOutcome>(r=>{complete=r;});}
  });
  const client=createIlpOptimizationClient();
  const update=(score:number)=>channel.onmessage({phase:"spatial",elapsed_ms:100,best_bound:0,relative_gap:1,incumbent_objective:score,best_solution:{...ilpSolvedForTest.solution,proof:"feasible",score_milli:score}});
  try {
    const first=client.start(ilpRequestForTest(),()=>{});update(5000);first.stop();
    assert.throws(()=>client.start(ilpRequestForTest(),()=>{}));
    update(3000);complete({status:"cancelled"});const outcome=await first.finished;
    assert.equal(cancellations,1);assert.equal(outcome.status,"solved");
    if(outcome.status==="solved") assert.equal(outcome.solution.score_milli,3000);
    const second=client.start(ilpRequestForTest(),()=>{});update(2000);second.stop();second.cancel();
    complete(ilpSolvedForTest);assert.deepEqual(await second.finished,{status:"cancelled"});
  } finally {client.dispose();clearMocks();globalThis.window=previous;}
});
