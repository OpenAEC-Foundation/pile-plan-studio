import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPilePlanImportSession } from "./pilePlanImportSession.ts";

const marker = { project_instance_id: "project", project_revision: 3 };
const preview = { canApply: true, supportsCptSelections: true,
  summary: { sourceRows: 2, matchedRows: 1, skippedRows: 1, conflicts: 0, coordinateFallbacks: 0 },
  diagnostics: [{ severity: "warning", code: "unmatched-load-point", message: "unmatched", location: null }],
  patch: { changes: [{ load_point_id: 1, pile: { action: "set", value: { pile_size_mm: 300, pile_tip_level_mm: -12000 } },
    manual_cpt_ids: { action: "preserve" } }] } };

async function ready(session: ReturnType<typeof createPilePlanImportSession>, transactionId: string) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const result = await session.call("pile_get_pile_plan_import_status", { transaction_id: transactionId }, marker);
    if (result.data.status === "ready") return result;
    if (result.data.status === "failed") throw new Error(JSON.stringify(result.data));
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("validation did not finish");
}

describe("MCP pile-plan import session", () => {
  it("releases the apply lock after a failed application so the validated import can be retried", async () => {
    let applications = 0;
    const session = createPilePlanImportSession({ requirements: async () => ({}), validate: async () => preview,
      apply: async () => {
        applications++;
        if (applications === 1) throw new Error("retryable failure");
        return { plan_id: "new" };
      } });
    const begun = await session.call("pile_begin_pile_plan_import", { file_name: "plan.csv",
      coordinate_tolerance_mm: 1, import_pile_assignments: true, import_cpt_selections: false,
      expected_project_instance_id: "project", expected_project_revision: 3 }, marker);
    const transaction_id = begun.data.transaction_id as string;
    await session.call("pile_append_pile_plan_import", { transaction_id, chunk_index: 0, text: "test", final: true }, marker);
    await session.call("pile_validate_pile_plan_import", { transaction_id }, marker);
    const validated = await ready(session, transaction_id);
    const args = { transaction_id, validation_id: validated.data.validation_id, allow_partial_import: true };
    await assert.rejects(session.call("pile_apply_pile_plan_import", args, marker), /retryable failure/);
    await session.call("pile_apply_pile_plan_import", args, marker);
    assert.equal(applications, 2);
  });

  it("rejects concurrent apply requests before entering the apply callback twice", async () => {
    let applications = 0;
    const session = createPilePlanImportSession({ requirements: async () => ({}),
      validate: async () => preview,
      apply: async () => { applications++; return { plan_id: "new" }; } });
    const begun = await session.call("pile_begin_pile_plan_import", { file_name: "plan.csv",
      coordinate_tolerance_mm: 1, import_pile_assignments: true, import_cpt_selections: false,
      expected_project_instance_id: "project", expected_project_revision: 3 }, marker);
    const transaction_id = begun.data.transaction_id as string;
    await session.call("pile_append_pile_plan_import", { transaction_id, chunk_index: 0,
      text: "Load Point ID\n1", final: true }, marker);
    await session.call("pile_validate_pile_plan_import", { transaction_id }, marker);
    const validated = await ready(session, transaction_id);
    const args = { transaction_id, validation_id: validated.data.validation_id, allow_partial_import: true };
    const results = await Promise.allSettled([
      session.call("pile_apply_pile_plan_import", args, marker),
      session.call("pile_apply_pile_plan_import", args, marker),
    ]);
    assert.equal(applications, 1);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "rejected");
    if (results[1].status === "rejected") assert.match(String(results[1].reason), /import_busy/);
  });

  it("requires explicit acceptance of skipped rows and applies once", async () => {
    let applications = 0;
    const session = createPilePlanImportSession({ requirements: async () => ({ version: 1 }),
      validate: async () => preview,
      apply: async () => { applications++; return { plan_id: "new" }; } });
    const begun = await session.call("pile_begin_pile_plan_import", { file_name: "plan.csv", plan_name: "New",
      coordinate_tolerance_mm: 1, import_pile_assignments: true, import_cpt_selections: false,
      expected_project_instance_id: "project", expected_project_revision: 3 }, marker);
    const transactionId = begun.data.transaction_id as string;
    await session.call("pile_append_pile_plan_import", { transaction_id: transactionId, chunk_index: 0,
      text: "Load Point ID\n1", final: true }, marker);
    await session.call("pile_validate_pile_plan_import", { transaction_id: transactionId }, marker);
    const validated = await ready(session, transactionId);
    assert.equal(validated.data.summary.skipped_rows, 1);
    await assert.rejects(session.call("pile_apply_pile_plan_import", { transaction_id: transactionId,
      validation_id: validated.data.validation_id }, marker), /partial_import_requires_acceptance/);
    assert.equal(applications, 0);
    await session.call("pile_apply_pile_plan_import", { transaction_id: transactionId,
      validation_id: validated.data.validation_id, allow_partial_import: true }, marker);
    assert.equal(applications, 1);
    await assert.rejects(session.call("pile_apply_pile_plan_import", { transaction_id: transactionId,
      validation_id: validated.data.validation_id, allow_partial_import: true }, marker), /import_not_found/);
  });

  it("refuses out-of-order chunks and project changes", async () => {
    const session = createPilePlanImportSession({ requirements: async () => ({}),
      validate: async () => preview, apply: async () => ({}) });
    const begun = await session.call("pile_begin_pile_plan_import", { file_name: "plan.csv", plan_name: "New",
      coordinate_tolerance_mm: 1, import_pile_assignments: true, import_cpt_selections: false,
      expected_project_instance_id: "project", expected_project_revision: 3 }, marker);
    const id = begun.data.transaction_id;
    await assert.rejects(session.call("pile_append_pile_plan_import", { transaction_id: id, chunk_index: 1,
      text: "bad", final: true }, marker), /invalid_chunk_order/);
    await assert.rejects(session.call("pile_append_pile_plan_import", { transaction_id: id, chunk_index: 0,
      text: "x", final: true }, { ...marker, project_revision: 4 }), /project_changed/);
    await session.call("pile_append_pile_plan_import", { transaction_id: id, chunk_index: 0,
      text: "first", final: true }, marker);
    await assert.rejects(session.call("pile_append_pile_plan_import", { transaction_id: id, chunk_index: 1,
      text: "extra", final: true }, marker), /invalid_chunk_order/);
    await session.call("pile_append_pile_plan_import", { transaction_id: id, chunk_index: 0,
      text: "replacement", final: true }, marker);
  });
});
