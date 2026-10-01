import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createPilePlanImportOperations } from "./pilePlanImportOperations.ts";
import type { PilePlanImportPreview } from "../../core/pilePlanImportContract.ts";
import type { LoadPointGroupAssignmentBatchResult } from "../../core/loadPointGroupContract.ts";

const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
const initial = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const marker = { project_instance_id: "project", project_revision: 1 };
const preview = { patch: { changes: [] }, summary: { matchedRows: 0, skippedRows: 0, conflicts: 0 } } as unknown as PilePlanImportPreview;
const input = { preview, fileName: "plan.csv", planName: "Imported", marker,
  options: { importPileAssignments: true, importCptSelections: false, coordinateToleranceMm: 1 } };
function setup(enabled = true, acceptCommit = true, batch?: () => Promise<LoadPointGroupAssignmentBatchResult>) {
  let state = initial, commits = 0, current = { ...marker };
  const operations = createPilePlanImportOperations({
    requirements: async () => ({}), currentState: () => state, currentMarker: () => current,
    canEdit: () => enabled, currentGroups: () => {
      if (!batch) throw new Error("no group request expected");
      return [];
    },
    commit: (update) => { commits++; if (acceptCommit) state = update(state); },
  }, { preview: async () => { current = { ...current, project_revision: 2 }; return preview; },
    ...(batch ? { applyBatch: batch } : {}) });
  return { operations, state: () => state, commits: () => commits, disable: () => { enabled = false; } };
}
test("an accepted import installs one new active plan in one commit", async () => {
  const context = setup();
  const result = await context.operations.apply(input);
  assert.equal(context.commits(), 1);
  assert.equal(context.state().pilePlans.length, initial.pilePlans.length + 1);
  assert.equal(result.plan_id, context.state().activePilePlanId);
});
test("disabled editing rejects before committing", async () => {
  const context = setup(false);
  await assert.rejects(context.operations.apply(input), /write_access_disabled/);
  assert.equal(context.commits(), 0);
});
test("an installation rejected by the session reports a changed project", async () => {
  const context = setup(true, false);
  await assert.rejects(context.operations.apply(input), /project_changed/);
  assert.equal(context.state(), initial);
});
test("preview rejects a project changed during core validation", async () => {
  const context = setup();
  await assert.rejects(context.operations.validate({ ...input, bytes: new Uint8Array() }), /project_changed/);
});

const assignmentInput = { ...input, preview: { ...preview, patch: { changes: [{
  load_point_id: initial.loadPoints[0].id,
  pile: { action: "set" as const, value: { pile_size_mm: 290, pile_tip_level_mm: -18000 } },
  manual_cpt_ids: { action: "preserve" as const },
}] } } };
test("a blocked group/lock edit never enters history", async () => {
  const context = setup(true, true, async () => ({ status: "blocked", reason: "locked_load_point",
    load_point_ids: [initial.loadPoints[0].id] }));
  await assert.rejects(context.operations.apply(assignmentInput), /locked_load_point/);
  assert.equal(context.commits(), 0);
});
test("Rust changes outside the requested import are rejected", async () => {
  const context = setup(true, true, async () => ({ status: "applied", changes: [{ load_point_id: -1, configuration: null }] }));
  await assert.rejects(context.operations.apply(assignmentInput), /group_assignment_expansion_required/);
  assert.equal(context.commits(), 0);
});
test("permission revoked while group validation runs prevents installation", async () => {
  const context = setup(true, true, async () => {
    context.disable();
    return { status: "applied", changes: [] };
  });
  await assert.rejects(context.operations.apply(assignmentInput), /write_access_disabled/);
  assert.equal(context.commits(), 0);
});
