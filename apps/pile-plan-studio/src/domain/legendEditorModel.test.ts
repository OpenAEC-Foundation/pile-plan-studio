import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyAutomaticColors,
  applyAutomaticSymbols,
  createLegendEditorDraft,
  hasManualLegendOverrides,
  resetLegendEditorAppearance,
  setLegendAssignmentScope,
  setLegendColorScheme,
  setLegendEncodingMode,
  updateLegendColor,
  updateLegendSymbol,
} from "./legendEditorModel.ts";
import { createBuiltInLegend } from "../viewer/legend.ts";

const capacities = [
  { cpt_id: 1, pile_tip_level_m: -18, pile_size_mm: 290, frd_kn: 700 },
  { cpt_id: 1, pile_tip_level_m: -19, pile_size_mm: 320, frd_kn: 800 },
];

function draft() {
  return createLegendEditorDraft(
    { pileSizes: [290, 320], pileTipLevels: [-18, -19] },
    createBuiltInLegend(capacities),
  );
}

describe("legend editor model", () => {
  it("marks only the manually edited item property as manual", () => {
    const recolored = updateLegendColor(draft(), "tip", -18, "#123456");
    const reshaped = updateLegendSymbol(recolored, "size", 290, {
      baseShape: "diamond",
      fillPattern: "top-half",
    });

    assert.equal(reshaped.legend.pileTipLevels[0].colorAutomatic, false);
    assert.equal(reshaped.legend.pileTipLevels[0].symbolAutomatic, true);
    assert.equal(reshaped.legend.pileTipLevels[1].colorAutomatic, true);
    assert.equal(reshaped.legend.pileSizes[0].symbolAutomatic, false);
    assert.equal(reshaped.legend.pileSizes[0].colorAutomatic, true);
  });

  it("applies a changed scheme immediately only to automatic colors", () => {
    const manual = updateLegendColor(draft(), "tip", -18, "#123456");
    const changed = setLegendColorScheme(manual, "colorblind-friendly");

    assert.equal(changed.legend.colorScheme, "colorblind-friendly");
    assert.equal(changed.legend.pileTipLevels[0].color, "#123456");
    assert.equal(changed.legend.pileTipLevels[1].color, "#E69F00");
  });

  it("keeps manual size colors while refreshing automatic size colors after encoding reversal", () => {
    let current = updateLegendColor(draft(), "size", 290, "#123456");
    current = setLegendColorScheme(current, "colorblind-friendly");
    const result = setLegendEncodingMode(current, "tip-symbol");

    assert.equal(result.ok, true);
    assert.equal(result.draft.legend.pileSizes[0].color, "#123456");
    assert.equal(result.draft.legend.pileSizes[1].color, "#E69F00");
    assert.equal(result.draft.legend.pileSizes[0].colorAutomatic, false);
  });

  it("explicit color assignment clears only scoped color overrides", () => {
    let current = updateLegendColor(draft(), "size", 290, "#123456");
    current = updateLegendColor(current, "size", 320, "#654321");
    current = setLegendAssignmentScope(current, "enabled").draft;
    current.active.pileSizes = [290];

    const assigned = applyAutomaticColors(current, "size");

    assert.equal(assigned.legend.pileSizes[0].colorAutomatic, true);
    assert.equal(assigned.legend.pileSizes[1].colorAutomatic, false);
  });

  it("explicit symbol assignment clears only symbol overrides", () => {
    const manual = updateLegendSymbol(draft(), "size", 290, {
      baseShape: "diamond",
      fillPattern: "top-half",
    });
    const result = applyAutomaticSymbols(manual, "size");

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.draft.legend.pileSizes[0].symbolAutomatic, true);
    assert.equal(result.draft.legend.pileSizes[0].colorAutomatic, true);
  });

  it("reports catalog exhaustion without discarding a mode or scope transition", () => {
    const legend = createBuiltInLegend(Array.from({ length: 55 }, (_, index) => ({
      cpt_id: 1,
      pile_tip_level_m: -18,
      pile_size_mm: 200 + index,
      frd_kn: 700,
    })));
    const current = createLegendEditorDraft({
      pileSizes: legend.pileSizes.map(({ value }) => value),
      pileTipLevels: [-18],
    }, legend);

    const result = setLegendAssignmentScope(current, "all");

    assert.equal(result.ok, false);
    assert.equal(result.draft.assignmentScope, "all");
  });

  it("resets the scheme and all item properties to automatic", () => {
    let current = updateLegendColor(draft(), "tip", -18, "#123456");
    current = updateLegendSymbol(current, "size", 290, {
      baseShape: "diamond",
      fillPattern: "top-half",
    });
    current = setLegendColorScheme(current, "rainbow");

    const reset = resetLegendEditorAppearance(current, capacities);

    assert.equal(reset.legend.colorScheme, "tableau-extended");
    assert.ok(reset.legend.pileSizes.every((item) => item.symbolAutomatic && item.colorAutomatic));
    assert.ok(reset.legend.pileTipLevels.every((item) => item.symbolAutomatic && item.colorAutomatic));
  });

  it("detects manual overrides only in the requested group and scope", () => {
    let current = updateLegendColor(draft(), "tip", -18, "#123456");
    current.active.pileTipLevels = [-19];

    assert.equal(hasManualLegendOverrides(current, "tip", "color"), false);
    current = setLegendAssignmentScope(current, "all").draft;
    assert.equal(hasManualLegendOverrides(current, "tip", "color"), true);
    assert.equal(hasManualLegendOverrides(current, "tip", "symbol"), false);
  });
});
