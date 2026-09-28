import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initSync } from "../../core/wasm/pile-plan-wasm/pile_plan_wasm.js";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createManagedProjectState, projectHistoryReducer } from "../../domain/project/history/projectHistoryReducer.ts";
import { createLegendEditorDraft } from "../../domain/legend/legendEditorModel.ts";
import { prepareProjectDocumentEdit, prepareLegendEditorEdit } from "./projectEditOperations.ts";

initSync({ module: readFileSync(new URL("../../core/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm", import.meta.url)) });
const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));

describe("shared project edit operations", () => {
  it("validates and commits project properties through one operation", async () => {
    const prepared = await prepareProjectDocumentEdit(state, {
      kind: "project_properties", name: "  Shared project  ", pile_head_level_m: -3, currency_code: "usd",
    });
    const history = projectHistoryReducer(createManagedProjectState(state), { type: "commit", update: prepared.update });
    assert.equal(history.history.past.length, 1);
    assert.equal(history.present.name, "Shared project");
    assert.equal(history.present.pileHeadLevelM, -3);
    assert.equal(history.present.currencyCode, "USD");
    assert.equal(projectHistoryReducer(history, { type: "undo" }).present.name, state.name);
  });

  it("applies legend appearance and activation together as one undo step", async () => {
    const draft = createLegendEditorDraft({
      pileSizes: state.pilePlans[0].activePileSizes,
      pileTipLevelMms: state.pilePlans[0].activePileTipLevelMms,
    }, state.pileLegend);
    draft.active.pileSizes = draft.active.pileSizes.slice(0, 1);
    draft.legend.pileSizes[0].color = "#123456";
    draft.legend.pileSizes[0].colorAutomatic = false;
    const prepared = await prepareLegendEditorEdit(state, draft, true);
    const history = projectHistoryReducer(createManagedProjectState(state), { type: "commit", update: prepared.update });
    assert.equal(history.history.past.length, 1);
    assert.deepEqual(history.present.pilePlans[0].activePileSizes, draft.active.pileSizes);
    assert.equal(history.present.pileLegend.pileSizes[0].color, "#123456");
    assert.equal(history.present.showTipLevelRegions, true);
    assert.deepEqual(projectHistoryReducer(history, { type: "undo" }).present.pilePlans[0].activePileSizes,
      state.pilePlans[0].activePileSizes);
  });

  it("does not prepare a partial legend edit when activation is invalid", async () => {
    const draft = createLegendEditorDraft({
      pileSizes: state.pilePlans[0].activePileSizes,
      pileTipLevelMms: state.pilePlans[0].activePileTipLevelMms,
    }, state.pileLegend);
    draft.legend.pileSizes[0].color = "#123456";
    draft.active.pileSizes = [99999];
    await assert.rejects(prepareLegendEditorEdit(state, draft, false),
      /unknown_or_duplicate_configuration/);
    assert.notEqual(state.pileLegend.pileSizes[0].color, "#123456");
  });
});
