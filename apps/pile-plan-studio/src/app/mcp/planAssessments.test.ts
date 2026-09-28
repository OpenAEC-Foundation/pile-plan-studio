import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createIlpPlanRun, completeIlpPlanRun } from "../../domain/pile-plans/ilp-optimization/ilpPlanRun.ts";
import { ilpSolvedForTest } from "../../core/ilpOptimizationTestSupport.ts";
import { readPlanAssessment } from "./planAssessments.ts";

const source = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");
const project = canonicalProjectForTest(source);
const base = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const marker = { project_instance_id: "test", project_revision: 1 };

describe("MCP plan reads", () => {
  it("counts a core-calculated cost for every assigned load point", async () => {
    const configuration = { pile_size_mm: 300, pile_tip_level_mm: -12000 };
    const state = { ...base, selectedPileConfigurationsByLoadPoint: new Map(base.loadPoints.slice(0, 2).map((point) => [point.id, configuration] as const)) };
    let calls = 0;
    const result = await readPlanAssessment({ state, marker, calculateCost: async () => { calls++; return 125; } },
      "pile_get_plan_costs", {});
    assert.equal(calls, 1);
    assert.equal(result.data.known_subtotal, 250);
    assert.equal(result.data.complete, true);
  });

  it("keeps saved and transient optimization outcomes separate", async () => {
    const result = await readPlanAssessment({ state: base, marker }, "pile_get_plan_optimization", {});
    assert.equal(result.data.result, null);
    const current = await readPlanAssessment({ state: base, marker }, "pile_get_current_optimization", {});
    assert.equal(current.data.status, "none");
  });

  it("keeps an invalidated run readable as a terminal cancellation", async () => {
    const run = createIlpPlanRun(base, "nl", false);
    const result = await readPlanAssessment({
      state: base, marker,
      currentOptimization: { run, valid: false, runId: "run-1", timeLimitSeconds: 600,
        runState: { running: false, stopping: false, progress: null, outcome: {status:"cancelled"} } },
    }, "pile_get_current_optimization", {});
    assert.equal(result.data.status,"cancelled");
    assert.equal(result.data.run_id,"run-1");
  });

  it("reports a solved terminal run after its new plan has been committed", async () => {
    const run=createIlpPlanRun(base,"nl",false,undefined,true);
    if(ilpSolvedForTest.status!=="solved")throw new Error("fixture");
    const committed=completeIlpPlanRun(base,run,ilpSolvedForTest,true);
    const result=await readPlanAssessment({state:committed,marker,currentOptimization:{run,valid:false,runId:"run-2",timeLimitSeconds:null,
      runState:{running:false,stopping:false,progress:{phase:"spatial",elapsed_ms:500,incumbent_objective:123,best_bound:100,relative_gap:0.1},outcome:ilpSolvedForTest}}},
      "pile_get_current_optimization",{});
    assert.equal(result.data.status,"solved");
    assert.equal(result.data.run_id,"run-2");
    assert.equal(result.data.time_limit_seconds,null);
    assert.equal(result.data.elapsed_ms,500);
    assert.equal(result.data.destination_plan_id,run.target.id);
    assert.equal(result.data.committed,true);
    assert.equal(result.data.committed_destination_plan_id,run.target.id);
  });
});
