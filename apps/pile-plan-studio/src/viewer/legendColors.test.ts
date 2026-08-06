import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  LEGEND_COLOR_SCHEMES,
  generateLegendColors,
  getLegendColorSchemePreview,
  normalizeLegendHexColor,
} from "./legendColors.ts";

describe("legend color schemes", () => {
  for (const scheme of LEGEND_COLOR_SCHEMES) {
    it(`${scheme} is deterministic and returns uppercase hex colors`, () => {
      const first = generateLegendColors(scheme, 18);
      const second = generateLegendColors(scheme, 18);

      assert.deepEqual(first, second);
      assert.equal(first.length, 18);
      assert.ok(first.every((color) => /^#[0-9A-F]{6}$/.test(color)));
    });
  }

  it("keeps the existing distinct palette first", () => {
    assert.deepEqual(generateLegendColors("distinct", 3), [
      "#4E79A7",
      "#F28E2B",
      "#59A14F",
    ]);
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
