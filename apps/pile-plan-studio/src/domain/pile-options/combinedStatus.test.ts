import {test} from "node:test";
import assert from "node:assert/strict";
import {combinedOptionStatus} from "./combinedStatus.ts";
import type {DirectionStatus} from "../../core/projectTypes.ts";
const assessment=(status:DirectionStatus)=>({status,demand_kn:1,governing_cpt_id:1,governing_frd_kn:2,utilization:.5,missing_cpt_ids:[]});
test("one combined status prioritizes the selected direction and names the other",()=>{
 for(const mode of ["compression","tension"] as const){
  assert.equal(combinedOptionStatus([{compression:assessment("valid"),tension:assessment("valid")}],mode)?.key,"valid");
  assert.equal(combinedOptionStatus([{compression:assessment("insufficient_capacity"),tension:assessment("insufficient_capacity")}],mode)?.key,"insufficient_capacity");
  assert.equal(combinedOptionStatus([{compression:assessment("insufficient_capacity"),tension:assessment("insufficient_capacity")}],mode)?.className,"is-not-ok");
 }
 const input=[{compression:assessment("valid"),tension:assessment("insufficient_capacity")}];
 assert.equal(combinedOptionStatus(input,"compression")?.key,"tension_insufficient_capacity");
 assert.equal(combinedOptionStatus(input,"compression")?.switchTo,"tension");
 assert.equal(combinedOptionStatus(input,"compression")?.className,"is-not-ok");
 assert.equal(combinedOptionStatus(input,"tension")?.key,"insufficient_capacity");
});
test("missing, zero and absent remain different, including aggregated options",()=>{
 assert.equal(combinedOptionStatus([{compression:assessment("valid"),tension:assessment("no_load")}],"tension")?.className,"is-ok");
 assert.equal(combinedOptionStatus([{compression:assessment("valid"),tension:assessment("no_load")}],"compression")?.key,"valid");
 assert.equal(combinedOptionStatus([{compression:assessment("valid"),tension:assessment("not_assessed")}],"tension")?.key,"not_assessed");
 assert.equal(combinedOptionStatus([{compression:assessment("valid"),tension:assessment("missing_demand")}],"compression")?.key,"tension_missing_demand");
 assert.equal(combinedOptionStatus([{compression:assessment("valid"),tension:assessment("valid")},{compression:assessment("valid"),tension:assessment("missing_capacity_data")}],"compression")?.key,"tension_missing_capacity_data");
 assert.equal(combinedOptionStatus([{compression:assessment("insufficient_capacity"),tension:assessment("missing_capacity_data")}],"compression")?.key,"insufficient_capacity");
});
