import { test } from "node:test";
import assert from "node:assert/strict";
import { IlpOptimizationController } from "./ilpOptimizationController.ts";
import type { IlpOptimizationClient } from "../../core/ilpOptimizationClient.ts";
import type { IlpOptimizationOutcome,IlpRunRequest,IlpProgress } from "../../core/ilpOptimizationTypes.ts";
import {ilpRequestForTest,ilpSolvedForTest} from "../../core/ilpOptimizationTestSupport.ts";
// Controller does not interpret engineering input; the real contract fixture supplies the payload.
const request=ilpRequestForTest();
function transport() {
  let report!:(progress:IlpProgress)=>void;
  let resolve!:(value:IlpOptimizationOutcome)=>void; let cancelled=false;
  const client:IlpOptimizationClient={start:(_request,onProgress)=>{report=onProgress;return {finished:new Promise(r=>{resolve=r;}),cancel:()=>{cancelled=true;},stop:()=>{}};},dispose:()=>undefined};
  return {client,progress:(progress:IlpProgress)=>report(progress),finish:(outcome:IlpOptimizationOutcome)=>resolve(outcome),cancelled:()=>cancelled};
}
test("controller waits for the result and rejects a changed project snapshot",async()=>{
  const fake=transport();let current=true;let applied=0;
  const controller=new IlpOptimizationController(fake.client,()=>undefined);
  const pending=controller.start(request,()=>current,()=>{applied++;});
  assert.equal(controller.state.running,true);
  current=false;fake.finish(ilpSolvedForTest);await pending;
  assert.equal(applied,0);assert.equal(controller.state.running,false);
});
test("stop accepts the best result but a subsequent context change still discards it",async()=>{
  for(const change of [false,true]) {
    const fake=transport();let current=true;let applied=0;
    const controller=new IlpOptimizationController(fake.client,()=>{});
    const pending=controller.start(request,()=>current,()=>applied++);
    controller.stop(); assert.equal(fake.cancelled(),false);
    if(change){current=false;controller.cancel();}
    fake.finish(ilpSolvedForTest); await pending;
    assert.equal(applied,change?0:1);
  }
});
test("stop cancels transport and prevents late results from applying",async()=>{
  const fake=transport();let applied=0;
  const controller=new IlpOptimizationController(fake.client,()=>undefined);
  const pending=controller.start(request,()=>true,()=>{applied++;});
  controller.cancel();assert.equal(fake.cancelled(),true);assert.equal(controller.state.stopping,true);
  fake.finish(ilpSolvedForTest);await pending;
  assert.equal(applied,0);assert.equal(controller.state.outcome?.status,"cancelled");
});

test("dispose invalidates a late successful result; a new run applies once",async()=>{
  const fake=transport();let applied=0;
  const controller=new IlpOptimizationController(fake.client,()=>undefined);
  const pending=controller.start(request,()=>true,()=>{applied++;});
  controller.dispose();fake.finish(ilpSolvedForTest);await pending;assert.equal(applied,0);
  const next=controller.start(request,()=>true,()=>{applied++;});fake.finish(ilpSolvedForTest);await next;
  assert.equal(applied,1);assert.equal(controller.state.outcome?.status,"solved");
});

function progress(score: number): IlpProgress {
  if(ilpSolvedForTest.status!=="solved")throw new Error("fixture");
  return {phase:"spatial",elapsed_ms:0,incumbent_objective:score,best_bound:0,relative_gap:1,
    best_solution:{...ilpSolvedForTest.solution,score_milli:score,proof:"feasible"}};
}

test("live preview shows the first plan immediately and coalesces improvements once a second",async(t)=>{
  t.mock.timers.enable({apis:["Date","setTimeout"],now:10000});
  const fake=transport();const controller=new IlpOptimizationController(fake.client,()=>{});
  const pending=controller.start(request,()=>true,()=>{});
  fake.progress(progress(9000));assert.equal(controller.state.previewSolution?.score_milli,9000);
  fake.progress(progress(7000));fake.progress(progress(5000));fake.progress(progress(8000));
  assert.equal(controller.state.previewSolution?.score_milli,9000);
  t.mock.timers.tick(999);assert.equal(controller.state.previewSolution?.score_milli,9000);
  t.mock.timers.tick(1);assert.equal(controller.state.previewSolution?.score_milli,5000);
  fake.finish(ilpSolvedForTest);await pending;
  assert.equal(controller.state.previewSolution,undefined);
});

test("cancel removes the preview immediately and rejects queued and late snapshots",async(t)=>{
  t.mock.timers.enable({apis:["Date","setTimeout"],now:10000});
  const fake=transport();const controller=new IlpOptimizationController(fake.client,()=>{});
  const pending=controller.start(request,()=>true,()=>assert.fail("cancel must not commit"));
  fake.progress(progress(9000));fake.progress(progress(5000));controller.cancel();
  assert.equal(controller.state.previewSolution,undefined);
  t.mock.timers.tick(1000);fake.progress(progress(1000));
  assert.equal(controller.state.previewSolution,undefined);
  fake.finish(ilpSolvedForTest);await pending;
});

test("a stale context or worker failure removes the preview without applying a plan",async(t)=>{
  t.mock.timers.enable({apis:["Date","setTimeout"],now:10000});
  const fake=transport();let current=true;const controller=new IlpOptimizationController(fake.client,()=>{});
  const pending=controller.start(request,()=>current,()=>assert.fail("stale result"));
  fake.progress(progress(9000));fake.progress(progress(5000));current=false;
  t.mock.timers.tick(1000);assert.equal(controller.state.previewSolution,undefined);
  fake.finish({status:"failed",code:"solver_worker_error"});await pending;
  assert.equal(controller.state.previewSolution,undefined);
});

test("stop commits the final best solution even when a better preview is still queued",async(t)=>{
  t.mock.timers.enable({apis:["Date","setTimeout"],now:10000});
  const fake=transport();let applied:IlpOptimizationOutcome|undefined;
  const controller=new IlpOptimizationController(fake.client,()=>{});
  const pending=controller.start(request,()=>true,outcome=>{applied=outcome;});
  fake.progress(progress(9000));fake.progress(progress(5000));controller.stop();
  assert.equal(controller.state.previewSolution?.score_milli,9000);
  fake.finish({...ilpSolvedForTest});await pending;
  assert.deepEqual(applied,ilpSolvedForTest);
  t.mock.timers.tick(1000);assert.equal(controller.state.previewSolution,undefined);
});

test("dispose cancels a queued preview and the next run starts with its own first solution",async(t)=>{
  t.mock.timers.enable({apis:["Date","setTimeout"],now:10000});
  const fake=transport();const controller=new IlpOptimizationController(fake.client,()=>{});
  const pending=controller.start(request,()=>true,()=>assert.fail("disposed run"));
  fake.progress(progress(9000));fake.progress(progress(5000));controller.dispose();
  fake.finish(ilpSolvedForTest);await pending;
  const next=controller.start(request,()=>true,()=>{});
  fake.progress(progress(12000));assert.equal(controller.state.previewSolution?.score_milli,12000);
  t.mock.timers.tick(1000);assert.equal(controller.state.previewSolution?.score_milli,12000);
  fake.finish(ilpSolvedForTest);await next;
});

test("cancel waits for solver acknowledgement and refuses a new run while stopping",async()=>{
  const fake=transport();let applied=0;
  const controller=new IlpOptimizationController(fake.client,()=>{});
  const pending=controller.start(request,()=>true,()=>applied++);
  controller.cancel();
  assert.equal(controller.state.running,true);
  assert.equal(controller.state.stopping,true);
  assert.equal(controller.state.cancelling,true);
  assert.equal(controller.state.outcome,null);
  await controller.start(request,()=>true,()=>assert.fail("must not start while stopping"));
  controller.cancel(); // Repeated cancellation must stay harmless.
  fake.finish(ilpSolvedForTest);await pending;
  assert.equal(controller.state.running,false);
  assert.equal(controller.state.stopping,false);
  assert.equal(controller.state.outcome?.status,"cancelled");
  assert.equal(applied,0);
});
