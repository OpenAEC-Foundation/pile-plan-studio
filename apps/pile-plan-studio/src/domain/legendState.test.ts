import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildLegendPresentation,
  deriveUsedPileConfigurations,
} from "./legendState.ts";

describe("legend state", () => {
  it("derives used sizes and tips from the active pile plan choices", () => {
    assert.deepEqual(
      deriveUsedPileConfigurations(new Map([
        [1, { pile_size_mm: 320, pile_tip_level_mm: -18_000 }],
        [2, { pile_size_mm: 290, pile_tip_level_mm: -19_000 }],
      ]).values()),
      {
        pileSizes: [290, 320],
        pileTipLevelMms: [-18_000, -19_000],
      },
    );
  });

  it("resolves all enabled and used presentation states", () => {
    const result = buildLegendPresentation({
      legend: {
        encodingMode: "size-symbol",
        pileSizes: [
          { value: 290, symbol: { baseShape: "circle", fillPattern: "full" }, color: "#AAAAAA" },
          { value: 320, symbol: { baseShape: "square", fillPattern: "full" }, color: "#BBBBBB" },
          { value: 350, symbol: { baseShape: "diamond", fillPattern: "full" }, color: "#CCCCCC" },
        ],
        pileTipLevels: [
          { value: -18_000, symbol: { baseShape: "circle", fillPattern: "full" }, color: "#111111" },
          { value: -19_000, symbol: { baseShape: "square", fillPattern: "full" }, color: "#222222" },
          { value: -20_000, symbol: { baseShape: "diamond", fillPattern: "full" }, color: "#333333" },
        ],
      },
      enabled: {
        pileSizes: [290, 350],
        pileTipLevelMms: [-18_000, -20_000],
      },
      used: {
        pileSizes: [290, 320],
        pileTipLevelMms: [-18_000, -19_000],
      },
    });

    assert.deepEqual(
      result.pileSizes.map(({ value, state }) => ({ value, state })),
      [
        { value: 290, state: "enabled-used" },
        { value: 320, state: "disabled-used" },
        { value: 350, state: "enabled-unused" },
      ],
    );
    assert.deepEqual(
      result.pileTipLevels.map(({ value, state }) => ({ value, state })),
      [
        { value: -18_000, state: "enabled-used" },
        { value: -19_000, state: "disabled-used" },
        { value: -20_000, state: "enabled-unused" },
      ],
    );
  });

  it("keeps unknown used configurations representable with fallback styles", () => {
    const result = buildLegendPresentation({
      legend: {
        encodingMode: "size-symbol",
        pileSizes: [{ value: 290, symbol: { baseShape: "circle", fillPattern: "full" }, color: "#AAAAAA" }],
        pileTipLevels: [{ value: -18_000, symbol: { baseShape: "circle", fillPattern: "full" }, color: "#111111" }],
      },
      enabled: {
        pileSizes: [290],
        pileTipLevelMms: [-18_000],
      },
      used: {
        pileSizes: [400],
        pileTipLevelMms: [-22_000],
      },
    });

    assert.deepEqual(result.pileSizes.find(({ value }) => value === 400), {
      value: 400,
      symbol: { baseShape: "circle", fillPattern: "full" },
      color: "#8C989F",
      symbolAutomatic: true,
      colorAutomatic: true,
      state: "disabled-used",
    });
    assert.deepEqual(result.pileTipLevels.find(({ value }) => value === -22_000), {
      value: -22_000,
      symbol: { baseShape: "circle", fillPattern: "full" },
      color: "#8C989F",
      symbolAutomatic: true,
      colorAutomatic: true,
      state: "disabled-used",
    });
  });
});
