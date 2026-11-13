import assert from "node:assert/strict";
import { it } from "node:test";
import type { LegendItems, LegendValueStyle } from "../../core/projectTypes.ts";
import { mergeLegendDefault } from "./legendDefault.ts";
import { setLegendColorScheme } from "./legendEditorModel.ts";

function style(value: number, color: string): LegendValueStyle {
  return { value, color, symbol: { baseShape: "circle", fillPattern: "full" },
    symbolAutomatic: true, colorAutomatic: true };
}

const target: LegendItems = {
  encodingMode: "size-symbol",
  pileSizeColorScheme: "even-hue",
  pileTipLevelColorScheme: "rainbow",
  pileSizes: [style(300, "#AAAAAA"), style(450, "#BBBBBB")],
  pileTipLevels: [style(-10000, "#CCCCCC"), style(-10001, "#DDDDDD")],
};
const appearance: LegendItems = {
  encodingMode: "tip-symbol",
  pileSizeColorScheme: "cool-warm",
  pileTipLevelColorScheme: "light-dark",
  pileSizes: [{
    ...style(300, "#101010"), symbol: { baseShape: "square", fillPattern: "top-half" },
    symbolAutomatic: false, colorAutomatic: false,
  }, style(400, "#202020")],
  pileTipLevels: [style(-10001, "#303030"), style(-12000, "#404040")],
};

it("merges matching millimetre values and preserves project-specific styles", () => {
  const before = structuredClone(target);
  const { legend, matched, skipped, retained } = mergeLegendDefault(target, appearance);

  assert.equal(legend.encodingMode, "tip-symbol");
  assert.equal(legend.pileSizeColorScheme, "cool-warm");
  assert.equal(legend.pileTipLevelColorScheme, "light-dark");
  assert.deepEqual(legend.pileSizes, [appearance.pileSizes[0], target.pileSizes[1]]);
  assert.deepEqual(legend.pileTipLevels, [target.pileTipLevels[0], appearance.pileTipLevels[0]]);
  assert.deepEqual({ matched, skipped, retained }, { matched: 2, skipped: 2, retained: 2 });
  assert.deepEqual(target, before);
  assert.notStrictEqual(legend.pileSizes[0].symbol, appearance.pileSizes[0].symbol);
});

it("loads the mode and palettes even when no project values match", () => {
  const result = mergeLegendDefault(target, { ...appearance, pileSizes: [style(500, "#EEEEEE")], pileTipLevels: [] });
  assert.equal(result.legend.encodingMode, "tip-symbol");
  assert.deepEqual(result.legend.pileSizes, target.pileSizes);
  assert.deepEqual(result.legend.pileTipLevels, target.pileTipLevels);
  assert.equal(result.matched, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.retained, 4);
});

it("leaves loaded manual colors alone when assigning a different color scheme", () => {
  const { legend } = mergeLegendDefault(target, appearance);
  const draft = setLegendColorScheme({
    legend,
    active: { pileSizes: [300, 450], pileTipLevelMms: [-10000, -10001] },
  }, "size", "tableau-extended", [300, 450]);

  assert.equal(draft.legend.pileSizes[0].color, "#101010");
  assert.equal(draft.legend.pileSizes[0].colorAutomatic, false);
  assert.notEqual(draft.legend.pileSizes[1].color, "#BBBBBB");
  assert.equal(draft.legend.pileSizes[1].colorAutomatic, true);
});
