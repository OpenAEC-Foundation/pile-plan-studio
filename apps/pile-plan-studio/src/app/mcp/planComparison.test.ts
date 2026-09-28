import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { comparePilePlans } from "./planComparison.ts";

const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
const base = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const id = base.loadPoints[0].id;
const a = { pile_size_mm: 300, pile_tip_level_mm: -12000 };
const b = { pile_size_mm: 350, pile_tip_level_mm: -13000 };
const state = { ...base,
  selectedPileConfigurationsByLoadPoint: new Map([[id, a]]),
  pilePlans: [{ ...base.pilePlans[0], selectedPileConfigurationsByLoadPoint: new Map([[id, a]]), lockedLoadPointIds: [id] },
    { ...base.pilePlans[0], id: "plan-b", name: "B",
      selectedPileConfigurationsByLoadPoint: new Map([[id, b]]), lockedLoadPointIds: [] }],
};
const marker = { project_instance_id: "compare", project_revision: 2 };

describe("MCP plan comparison", () => {
  it("compares assignments, locks, and complete Rust costs without changing plans", async () => {
    const result = await comparePilePlans({ state, marker,
      calculateCost: async ({ pileSizeMm }) => pileSizeMm }, base.activePilePlanId, "plan-b", { limit: 10, offset: 0 });
    assert.equal(result.data.cost_difference, 50);
    assert.equal(result.data.cost_difference_percent, 50 / 300 * 100);
    assert.equal(result.data.different_assignment_count, 1);
    assert.equal(result.data.different_lock_count, 1);
    assert.equal((result.data.differences as { items: unknown[] }).items.length, 1);
    assert.equal(state.activePilePlanId, base.activePilePlanId);
  });

  it("suppresses cost deltas when a price is missing", async () => {
    const result = await comparePilePlans({ state, marker,
      calculateCost: async ({ pileSizeMm }) => pileSizeMm === 350 ? null : 300 },
    base.activePilePlanId, "plan-b", { limit: 10, offset: 0 });
    assert.equal(result.data.cost_difference, null);
    assert.equal(result.data.cost_difference_percent, null);
  });

  it("rejects a changed project after asynchronous costing", async () => {
    let current = true;
    await assert.rejects(comparePilePlans({ state, marker, isCurrent: () => current,
      calculateCost: async () => { current = false; return 300; } },
    base.activePilePlanId, "plan-b", { limit: 10, offset: 0 }), /project_changed/);
  });
});
