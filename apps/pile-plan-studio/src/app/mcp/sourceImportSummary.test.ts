import { it } from "node:test";
import assert from "node:assert/strict";
import { summarizeImportReconciliation } from "./sourceImportSummary.ts";
import type { IfcppProject } from "../../core/projectFile.ts";

it("counts Rust-preserved, remapped and lost project choices across a refresh", () => {
  const before = { user_state: {
    pile_plans: [{ id: "plan", selected_piles: { "1": {}, "2": {} }, locked_load_point_ids: [1, 2] }],
    manual_cpt_selections: { "1": [11], "2": [12] },
  } } as unknown as IfcppProject;
  const after = { user_state: {
    pile_plans: [{ id: "plan", selected_piles: { "1": {}, "3": {} }, locked_load_point_ids: [1] }],
    manual_cpt_selections: { "1": [11], "3": [12] },
  } } as unknown as IfcppProject;
  assert.deepEqual(summarizeImportReconciliation(before, after), {
    assignments: { before: 2, after: 2, remapped: 1, lost: 0 },
    locks: { before: 2, after: 1, remapped: 0, lost: 1 },
    manual_cpt_selections: { before: 2, after: 2, remapped: 1, lost: 0 },
  });
});
