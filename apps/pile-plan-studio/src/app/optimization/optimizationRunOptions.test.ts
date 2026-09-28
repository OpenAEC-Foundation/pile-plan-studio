import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { resolveOptimizationRunOptions } from "./optimizationRunOptions.ts";

const state = { loadPoints: [{ id: 1 }, { id: 2 }, { id: 3 }], selectedLoadPointIds: [2] } as ProjectState;
const basic = { timeLimitSeconds: 600, localOnly: false };

describe("optimization run options", () => {
  it("targets all load points when IDs are omitted, independently of the screen selection", () => {
    assert.deepEqual(resolveOptimizationRunOptions(state, basic).targetLoadPointIds, [1, 2, 3]);
  });
  it("allows a whole project with more than one thousand load points", () => {
    const largeState={loadPoints:Array.from({length:1001},(_,index)=>({id:index+1}))} as ProjectState;
    assert.equal(resolveOptimizationRunOptions(largeState,basic).targetLoadPointIds.length,1001);
  });
  it("passes explicit IDs unchanged and rejects invalid lists", () => {
    assert.deepEqual(resolveOptimizationRunOptions(state, { ...basic, targetLoadPointIds: [3, 1] }).targetLoadPointIds, [3, 1]);
    for (const targetLoadPointIds of [[], [1, 1], [4]]) {
      assert.throws(() => resolveOptimizationRunOptions(state, { ...basic, targetLoadPointIds }));
    }
  });
  it("keeps no deadline distinct from a finite deadline", () => {
    assert.equal(resolveOptimizationRunOptions(state, { ...basic, timeLimitSeconds: null }).timeLimitMs, null);
    assert.equal(resolveOptimizationRunOptions(state, basic).timeLimitMs, 600_000);
  });
  it("allows explicit run-scoped limit and boundary settings", () => {
    const resolved = resolveOptimizationRunOptions(state, { ...basic,
      limitScope: "whole-plan", includeBoundaryTransitions: true });
    assert.equal(resolved.limitScope, "whole-plan");
    assert.equal(resolved.includeBoundaryTransitions, true);
  });
});
