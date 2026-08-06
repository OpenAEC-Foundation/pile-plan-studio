import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyAutomaticColors,
  applyAutomaticSymbols,
  applyLegendEditorBulkAction,
  createLegendEditorDraft,
  resetLegendEditorAppearance,
  setLegendAssignmentScope,
  setLegendColorScheme,
  setLegendEditorItemEnabled,
  setLegendEncodingMode,
  updateLegendColor,
  updateLegendSymbol,
} from "./legendEditorModel.ts";
import { createBuiltInLegend } from "../viewer/legend.ts";

const capacities = [
  { cpt_id: 1, pile_tip_level_m: -18, pile_size_mm: 290, frd_kn: 700 },
  { cpt_id: 1, pile_tip_level_m: -19, pile_size_mm: 320, frd_kn: 800 },
];

describe("legend editor model", () => {
  it("copies activation and appearance into an isolated draft", () => {
    const active = { pileSizes: [290], pileTipLevels: [-18] };
    const legend = createBuiltInLegend(capacities);
    const draft = createLegendEditorDraft(active, legend);

    draft.active.pileSizes.push(320);
    draft.legend.pileSizes[0].color = "#123456";

    assert.deepEqual(active.pileSizes, [290]);
    assert.notEqual(legend.pileSizes[0].color, "#123456");
    assert.equal(draft.assignmentScope, "enabled");
    assert.equal(draft.colorScheme, "distinct");
  });

  it("enables values separately from changing their appearance", () => {
    const draft = createLegendEditorDraft(
      { pileSizes: [290], pileTipLevels: [-18] },
      createBuiltInLegend(capacities),
    );
    const enabled = setLegendEditorItemEnabled(draft, "size", 320, true);
    const styled = updateLegendSymbol(enabled, "size", 320, {
      baseShape: "rectangle-horizontal",
      fillPattern: "top-half",
    });
    const recolored = updateLegendColor(styled, "tip", -18, "#123456");

    assert.deepEqual(enabled.active.pileSizes, [290, 320]);
    assert.deepEqual(styled.legend.pileSizes[1].symbol, {
      baseShape: "rectangle-horizontal",
      fillPattern: "top-half",
    });
    assert.equal(recolored.legend.pileTipLevels[0].color, "#123456");
  });

  it("updates mode, scope, and color scheme without rewriting mappings", () => {
    const draft = createLegendEditorDraft(
      { pileSizes: [290], pileTipLevels: [-18] },
      createBuiltInLegend(capacities),
    );
    const changed = setLegendColorScheme(
      setLegendAssignmentScope(setLegendEncodingMode(draft, "tip-symbol"), "all"),
      "colorblind-friendly",
    );

    assert.equal(changed.legend.encodingMode, "tip-symbol");
    assert.equal(changed.assignmentScope, "all");
    assert.equal(changed.colorScheme, "colorblind-friendly");
    assert.deepEqual(changed.legend.pileSizes, draft.legend.pileSizes);
  });

  it("supports all, used-only, and empty enabled sets without changing appearance", () => {
    const draft = createLegendEditorDraft(
      { pileSizes: [290], pileTipLevels: [-18] },
      createBuiltInLegend(capacities),
    );
    const available = { pileSizes: [290, 320], pileTipLevels: [-18, -19] };
    const used = { pileSizes: [320], pileTipLevels: [-19] };

    assert.deepEqual(
      applyLegendEditorBulkAction(draft, "enable-used", available, used).active,
      used,
    );
    assert.deepEqual(
      applyLegendEditorBulkAction(draft, "disable-all", available, used).active,
      { pileSizes: [], pileTipLevels: [] },
    );
    assert.equal(
      applyLegendEditorBulkAction(draft, "enable-all", available, used).legend,
      draft.legend,
    );
  });

  it("applies symbols and colors independently to enabled or all values", () => {
    let draft = createLegendEditorDraft(
      { pileSizes: [320], pileTipLevels: [-19] },
      createBuiltInLegend(capacities),
    );
    draft = updateLegendColor(draft, "size", 290, "#123456");
    const symbols = applyAutomaticSymbols(draft, "size");
    assert.equal(symbols.ok, true);
    if (!symbols.ok) return;
    assert.deepEqual(symbols.draft.legend.pileSizes[1].symbol, {
      baseShape: "circle",
      fillPattern: "full",
    });

    draft = setLegendColorScheme(draft, "colorblind-friendly");
    const colors = applyAutomaticColors(draft, "size");
    assert.equal(colors.legend.pileSizes[0].color, "#123456");
    assert.equal(colors.legend.pileSizes[1].color, "#0072B2");
  });

  it("reports catalog exhaustion without changing the draft", () => {
    const legend = createBuiltInLegend(Array.from({ length: 55 }, (_, index) => ({
      cpt_id: 1,
      pile_tip_level_m: -18,
      pile_size_mm: 200 + index,
      frd_kn: 700,
    })));
    const draft = setLegendAssignmentScope(createLegendEditorDraft({
      pileSizes: legend.pileSizes.map(({ value }) => value),
      pileTipLevels: [-18],
    }, legend), "all");

    assert.deepEqual(applyAutomaticSymbols(draft, "size"), {
      ok: false,
      draft,
      error: "catalog-exhausted",
      limit: 54,
    });
  });

  it("resets appearance while retaining activation and editor choices", () => {
    let draft = createLegendEditorDraft(
      { pileSizes: [320], pileTipLevels: [] },
      createBuiltInLegend(capacities),
    );
    draft = setLegendColorScheme(setLegendAssignmentScope(
      updateLegendColor(setLegendEncodingMode(draft, "tip-symbol"), "size", 290, "#123456"),
      "all",
    ), "rainbow");

    const reset = resetLegendEditorAppearance(draft, capacities);

    assert.deepEqual(reset.active, draft.active);
    assert.equal(reset.assignmentScope, "all");
    assert.equal(reset.colorScheme, "rainbow");
    assert.deepEqual(reset.legend, createBuiltInLegend(capacities));
  });
});
