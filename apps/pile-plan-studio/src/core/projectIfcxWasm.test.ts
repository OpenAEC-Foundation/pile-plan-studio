import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { captureProjectContent, projectDocumentDraftFromContent } from "../domain/project/projectContent.ts";
import { createInitialProjectState } from "../domain/project/projectState.ts";
import { projectDocumentOutcomeFromCore, toBrowserProjectDocumentDraft } from "./projectDocumentContract.ts";
import { initSync, preview_pile_driving_files, read_project_document, write_project_document } from "./wasm/pile-plan-wasm/pile_plan_wasm.js";

initSync({ module: readFileSync(new URL("./wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm", import.meta.url)) });

test("the browser opens and resaves IFCX with stable paths, pile numbers, CSV settings and exact costs", () => {
  const contents = readFileSync(new URL("../../../../schemas/ifcpp/fixtures/schema-9-complete.ifcpp", import.meta.url), "utf8");
  const loaded = projectDocumentOutcomeFromCore({ status: "valid", ...read_project_document({ contents }) });
  assert.equal(loaded.status, "valid");
  if (loaded.status !== "valid") return;
  const state = createInitialProjectState(loaded.project, { initializeDefaultPiles: false }, loaded.keys);
  const draft = projectDocumentDraftFromContent(captureProjectContent(state), state.activePilePlanId);
  const saved = write_project_document({ draft: toBrowserProjectDocumentDraft(draft) });
  const original = JSON.parse(contents);
  const written = JSON.parse(saved);
  assert.equal(written.header.id, original.header.id);
  assert.deepEqual(written.data.map((node: { path: string }) => node.path).sort(),
    original.data.map((node: { path: string }) => node.path).sort());
  const result = written.data.find((node: { attributes: Record<string, unknown> }) =>
    node.attributes["openaec::opps::optimizerResult"]).attributes["openaec::opps::optimizerResult"];
  assert.equal(result.solution.cost, "9007199254740993");
  const reopened = read_project_document({ contents: saved });
  const driving = reopened.project.inputs.pile_driving;
  assert.equal(driving.shared_ignore_csv_leading_zeros, false);
  assert.equal(driving.files[0].overrides.ignore_csv_leading_zeros, false);
  assert.equal(reopened.project.user_state.pile_plans[0].revit_marks_by_load_point.get(17), "001-A");
  assert.equal(reopened.project.user_state.pile_plans[1].revit_marks_by_load_point.get(17), "P-17-B");

  const [file] = driving.files;
  const drivingResult = preview_pile_driving_files({
    files: [{
      file_name: file.file_name,
      format: file.format,
      bytes: Buffer.from(file.data_base64, "base64"),
      match_by: file.overrides.match_by,
      ignore_csv_leading_zeros: file.overrides.ignore_csv_leading_zeros,
      independent: true,
      table: file.overrides.table,
    }],
    targets: [{ load_point_id: 17, revit_mark: "001-A" }],
    pile_head_level_m: reopened.project.settings.pile_head_level_m,
  }).files[0];
  assert.equal(drivingResult.status, "ready", JSON.stringify(drivingResult.error));
  assert.deepEqual(drivingResult.preview.records[0].matching, { status: "matched", load_point_id: 17 });
  assert.equal(drivingResult.preview.records[0].matched_pile_number, "001-A");
});

test("the browser preserves adjacent whole-millimetre keys and a precise head level", () => {
  const fixture = readFileSync(new URL("../../../../schemas/ifcpp/fixtures/minimal.ifcpp", import.meta.url), "utf8");
  const contents = fixture
    .replace('"tipLevel": -18', '"tipLevel": 9007199254740.99')
    .replace('"tipLevel": -17', '"tipLevel": 9007199254740.991')
    .replace('"pileHeadLevel": -0.75', '"pileHeadLevel": -0.7501234567890123');
  const loaded = projectDocumentOutcomeFromCore({ status: "valid", ...read_project_document({ contents }) });
  assert.equal(loaded.status, "valid");
  if (loaded.status !== "valid") return;
  const state = createInitialProjectState(loaded.project, { initializeDefaultPiles: false }, loaded.keys);
  const draft = projectDocumentDraftFromContent(captureProjectContent(state), state.activePilePlanId);
  const saved = write_project_document({ draft: toBrowserProjectDocumentDraft(draft) });
  assert.match(saved, /"tipLevel": 9007199254740\.99\s*[,}]/);
  assert.match(saved, /"tipLevel": 9007199254740\.991\s*[,}]/);
  const reopened = read_project_document({ contents: saved }).project;
  assert.ok(Object.is(reopened.settings.pile_head_level_m, -0.7501234567890123));
  assert.equal(reopened.user_state.pile_plans[0].selected_piles.get(17).pile.pile_tip_level_m_key, 9007199254740990);
  assert.equal(reopened.user_state.pile_plans[1].selected_piles.get(17).pile.pile_tip_level_m_key, 9007199254740991);
});
