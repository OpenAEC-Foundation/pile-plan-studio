import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_EXPORT_OPTIONS } from "../../core/exportRevisionContract.ts";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { resolvePilePlanForExport } from "../../domain/pile-plans/pilePlanExport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { prepareCadDrawing } from "./prepareCadDrawing.ts";

test("CAD preparation uses the chosen plan's size, number and symbol without switching plans", async () => {
  const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
  const base = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
  const id = base.loadPoints[0].id;
  const active = { pile_size_mm: 290, pile_tip_level_mm: -12000 };
  const alternate = { pile_size_mm: 400, pile_tip_level_mm: -13000 };
  const state = {
    ...base,
    selectedPileConfigurationsByLoadPoint: new Map([[id, active]]),
    pilePlans: [...base.pilePlans, {
      ...base.pilePlans[0], id: "alternate", name: "Alternative",
      selectedPileConfigurationsByLoadPoint: new Map([[id, alternate]]),
      revitMarksByLoadPoint: new Map([[id, "B-01"]]),
    }],
  };
  const plan = resolvePilePlanForExport(state, "alternate");
  assert.ok(plan);
  const drawing = await prepareCadDrawing(state, plan, {
    piles_label: "Piles", regions_label: "Tip levels", unassigned_label: "Unassigned",
    legend: { title: "Legend", mark: "Mark", size: "Size", count: "Count", cpts: "CPTs" },
  }, "en", DEFAULT_EXPORT_OPTIONS.mark, {
    numbering: "pile_number", include_cpts: true, symbols: "viewer", number_size: "automatic", region_display: "hidden",
  });
  assert.equal(drawing.plan, "Alternative");
  assert.equal(drawing.piles.find(pile => pile.id === id)?.size_mm, 400);
  assert.equal(drawing.piles.find(pile => pile.id === id)?.mark, "B-01");
  assert.deepEqual(drawing.viewer_symbols.map(symbol => symbol.size_mm), [400]);
  assert.equal(state.activePilePlanId, base.activePilePlanId);
  assert.equal(state.selectedPileConfigurationsByLoadPoint.get(id), active);
});
