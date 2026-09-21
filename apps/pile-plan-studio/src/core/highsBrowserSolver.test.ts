import {test} from "node:test";
import assert from "node:assert/strict";
import loadHighs from "highs";
import type {Highs,Model} from "highs";
import {createHighsBrowserSolver,type IlpSolverModel} from "./highsBrowserSolver.ts";
const highs=await loadHighs();
const solver=createHighsBrowserSolver(highs);
const one:IlpSolverModel={col_cost:[1],col_lower:[0],col_upper:[2],row_lower:[1],row_upper:[Infinity],starts:[0,1],indices:[0],values:[1],initial_solution:null};
test("browser HiGHS solves integer models and classifies infeasibility",()=>{
 assert.deepEqual(solver(one,5,()=>{}),{status:"solved",values:[1],optimal:true});
 assert.deepEqual(solver({...one,col_upper:[0]},5,()=>{}),{status:"infeasible"});
});
test("browser HiGHS does not claim optimality or a solution when the deadline has expired",()=>{
 assert.deepEqual(solver(one,0,()=>{}),{status:"no_solution"});
});

const knapsack:IlpSolverModel={col_cost:[-1,-1],col_lower:[0,0],col_upper:[1,1],row_lower:[-Infinity],row_upper:[3],starts:[0,2],indices:[0,1],values:[2,2],initial_solution:[1,0]};
function limitedRuntime(){
  let model:Model|undefined;
  const runtime:Highs={...highs,createModel(data){
    model=highs.createModel(data);model.options.set({presolve:"off",mip_max_nodes:0});return model;
  }};
  return {solve:createHighsBrowserSolver(runtime),disposed:()=>model?.disposed};
}
test("limited HiGHS returns the warm incumbent without an optimality claim and disposes the model",()=>{
 const runtime=limitedRuntime();const snapshots:number[][]=[];
 const result=runtime.solve(knapsack,5,p=>{if(p.values)snapshots.push(p.values);});
 assert.deepEqual(result,{status:"solved",values:[1,0],optimal:false});
 assert.ok(snapshots.length>0);assert.deepEqual(snapshots[0],[1,0]);
 assert.equal(runtime.disposed(),true);
});
test("limited HiGHS without a start does not return infeasible LP values as a plan",()=>{
 const runtime=limitedRuntime();
 assert.deepEqual(runtime.solve({...knapsack,initial_solution:null},5,()=>{}),{status:"no_solution"});
 assert.equal(runtime.disposed(),true);
});
test("callback failures release the HiGHS model and allow subsequent solves",()=>{
 const runtime=limitedRuntime();
 assert.throws(()=>runtime.solve(knapsack,5,()=>{throw new Error("preview failed");}),/preview failed/);
 assert.equal(runtime.disposed(),true);
 assert.equal(solver(one,5,()=>{}).status,"solved");
});
