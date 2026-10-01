import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initSync } from "../../core/wasm/pile-plan-wasm/pile_plan_wasm.js";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createManagedProjectState, projectHistoryReducer } from "../../domain/project/history/projectHistoryReducer.ts";
import { createLegendEditorDraft } from "../../domain/legend/legendEditorModel.ts";
import { prepareProjectDocumentEdit, prepareLegendEditorEdit } from "./projectEditOperations.ts";
import * as operations from "./projectEditOperations.ts";

initSync({ module: readFileSync(new URL("../../core/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm", import.meta.url)) });
const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));

describe("shared project edit operations", () => {
  it("validates cost edits through Rust and commits one undoable change", async () => {
    const original = state.pileCostSettings.items[0];
    const prepared = await operations.preparePileCostCatalogEdit(state, [
      { action: "update", pile_size_mm: original.pile_size_mm, cost_per_m3: original.cost_per_m3 + 10 },
      { action: "add", item: { pile_size_mm: 999, shape: "round", cost_per_m3: 200 } },
    ]);
    const history = projectHistoryReducer(createManagedProjectState(state), { type: "commit", update: prepared.update });
    assert.equal(history.history.past.length, 1);
    assert.equal(history.present.pileCostSettings.items.find((item) => item.pile_size_mm === 999)?.cost_per_m3, 200);
    assert.deepEqual(projectHistoryReducer(history, { type: "undo" }).present.pileCostSettings, state.pileCostSettings);
    assert.equal(state.pileCostSettings.items.some((item) => item.pile_size_mm === 999), false);
  });

  it("rejects fractional and out-of-range pile sizes before changing project content", async () => {
    for (const pile_size_mm of [300.5, 4_294_967_296]) {
      await assert.rejects(operations.preparePileCostCatalogEdit(state, [
        { action: "add", item: { pile_size_mm, shape: "round", cost_per_m3: 200 } },
      ]));
      assert.equal(state.pileCostSettings.items.some((item) => item.pile_size_mm === pile_size_mm), false);
    }
  });

  it("rejects an entire cost batch when it removes a used pile size", async () => {
    await assert.rejects(operations.preparePileCostCatalogEdit(state, [
      { action: "add", item: { pile_size_mm: 999, shape: "round", cost_per_m3: 200 } },
      { action: "remove", pile_size_mm: state.bearingCapacities[0].pile_size_mm },
    ]), /used_pile_size/);
    assert.equal(state.pileCostSettings.items.some((item) => item.pile_size_mm === 999), false);
  });

  it("loads a cost default through the same validator and preserves used rows", async () => {
    const extra = await operations.preparePileCostCatalogEdit(state, [
      { action: "add", item: { pile_size_mm: 999, shape: "round", cost_per_m3: 200 } },
    ]);
    const before = extra.update(state);
    const prepared = await operations.preparePileCostCatalogDefaultEdit(before, {
      schema_version: 1, items: [{ pile_size_mm: 998, shape: "square", cost_per_m3: 300 }],
    });
    const next = prepared.update(before);
    assert.equal(next.pileCostSettings.items.some((item) => item.pile_size_mm === 999), false);
    assert.equal(next.pileCostSettings.items.find((item) => item.pile_size_mm === 998)?.cost_per_m3, 300);
    for (const size of new Set(state.bearingCapacities.map((row) => row.pile_size_mm))) {
      assert.deepEqual(next.pileCostSettings.items.find((item) => item.pile_size_mm === size),
        state.pileCostSettings.items.find((item) => item.pile_size_mm === size));
    }
    const unchanged = await operations.preparePileCostCatalogDefaultEdit(next, next.pileCostSettings);
    assert.equal(unchanged.changed, false);
    assert.equal(unchanged.update(next), next);
    await assert.rejects(operations.preparePileCostCatalogDefaultEdit(state, {
      schema_version: 1, items: [{ pile_size_mm: 300.5, shape: "round", cost_per_m3: 200 }],
    }));
  });

  it("validates merged import defaults while preserving personal-over-built-in precedence", async () => {
    const size = state.pileCostSettings.items[0].pile_size_mm;
    const personal = { schema_version: 1, items: [{ pile_size_mm: size, shape: "round" as const, cost_per_m3: 123 }] };
    const builtIn = { schema_version: 1, items: [{ pile_size_mm: size, shape: "square" as const, cost_per_m3: 456 }] };
    const prepared = await operations.prepareMergedPileCostCatalogEdit(state, personal, builtIn);
    assert.equal(prepared.update(state).pileCostSettings.items.find((item) => item.pile_size_mm === size)?.cost_per_m3, 123);
    await assert.rejects(operations.prepareMergedPileCostCatalogEdit(state, {
      schema_version: 1, items: [{ pile_size_mm: 300.5, shape: "round", cost_per_m3: 200 }],
    }, builtIn));
  });

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
