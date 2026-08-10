import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  LEGEND_COLOR_SCHEMES,
  generateLegendColors,
  getLegendColorSchemePreview,
  normalizeLegendHexColor,
} from "./legendColors.ts";

describe("legend color schemes", () => {
  it("offers the six approved color schemes", () => {
    assert.deepEqual(LEGEND_COLOR_SCHEMES, [
      "tableau-extended",
      "even-hue",
      "colorblind-friendly",
      "rainbow",
      "light-dark",
      "cool-warm",
    ]);
  });

  for (const scheme of LEGEND_COLOR_SCHEMES) {
    it(`${scheme} is deterministic and returns uppercase hex colors`, () => {
      const first = generateLegendColors(scheme, 18);
      const second = generateLegendColors(scheme, 18);

      assert.deepEqual(first, second);
      assert.equal(first.length, 18);
      assert.ok(first.every((color) => /^#[0-9A-F]{6}$/.test(color)));
    });
  }

  it("keeps the exact Tableau 10 palette at the start of Tableau Extended", () => {
    assert.deepEqual(generateLegendColors("tableau-extended", 10), [
      "#4E79A7",
      "#F28E2B",
      "#59A14F",
      "#E15759",
      "#76B7B2",
      "#EDC948",
      "#B07AA1",
      "#FF9DA7",
      "#9C755F",
      "#BAB0AC",
    ]);
  });

  it("extends Tableau without repeating or immediately recycling similar colors", () => {
    const colors = generateLegendColors("tableau-extended", 24);

    assert.equal(new Set(colors).size, colors.length);
    for (let index = 10; index < colors.length; index += 1) {
      const nearest = Math.min(...colors.slice(0, index).map((color) => rgbDistance(color, colors[index])));
      assert.ok(nearest >= 35, `${colors[index]} is too close to an earlier Tableau color`);
    }
  });

  it("spreads categorical hues over the complete requested count", () => {
    const colors = generateLegendColors("even-hue", 18);

    assert.equal(colors.length, 18);
    assert.equal(new Set(colors).size, 18);
    assert.notDeepEqual(colors.slice(0, 10), generateLegendColors("tableau-extended", 10));
    assert.ok(colors.slice(1).every((color, index) => rgbDistance(color, colors[index]) >= 70));
  });

  it("starts colorblind-friendly with the approved discrete sequence", () => {
    assert.deepEqual(generateLegendColors("colorblind-friendly", 8), [
      "#0072B2",
      "#E69F00",
      "#009E73",
      "#CC79A7",
      "#56B4E9",
      "#D55E00",
      "#B79F00",
      "#6A3D9A",
    ]);
  });

  it("handles empty, single-color, and preview requests", () => {
    assert.deepEqual(generateLegendColors("rainbow", 0), []);
    assert.equal(generateLegendColors("light-dark", 1).length, 1);
    assert.equal(getLegendColorSchemePreview("cool-warm").length, 7);
  });

  it("normalizes only complete six-digit hexadecimal colors", () => {
    assert.equal(normalizeLegendHexColor("#12abEF"), "#12ABEF");
    assert.equal(normalizeLegendHexColor("12ABEF"), null);
    assert.equal(normalizeLegendHexColor("#123"), null);
    assert.equal(normalizeLegendHexColor("#GGGGGG"), null);
  });
});

function rgbDistance(left: string, right: string): number {
  const channels = (value: string) => [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
  const a = channels(left);
  const b = channels(right);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
