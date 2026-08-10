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
        [1, "320|-18"],
        [2, "290|-19"],
        [3, "invalid"],
      ]).values()),
      {
        pileSizes: [290, 320],
        pileTipLevels: [-18, -19],
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
          { value: -18, symbol: { baseShape: "circle", fillPattern: "full" }, color: "#111111" },
          { value: -19, symbol: { baseShape: "square", fillPattern: "full" }, color: "#222222" },
          { value: -20, symbol: { baseShape: "diamond", fillPattern: "full" }, color: "#333333" },
        ],
      },
      enabled: {
        pileSizes: [290, 350],
        pileTipLevels: [-18, -20],
      },
      used: {
        pileSizes: [290, 320],
        pileTipLevels: [-18, -19],
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
        { value: -18, state: "enabled-used" },
        { value: -19, state: "disabled-used" },
        { value: -20, state: "enabled-unused" },
      ],
    );
  });

  it("keeps unknown used configurations representable with fallback styles", () => {
    const result = buildLegendPresentation({
      legend: {
        encodingMode: "size-symbol",
        pileSizes: [{ value: 290, symbol: { baseShape: "circle", fillPattern: "full" }, color: "#AAAAAA" }],
        pileTipLevels: [{ value: -18, symbol: { baseShape: "circle", fillPattern: "full" }, color: "#111111" }],
      },
      enabled: {
        pileSizes: [290],
        pileTipLevels: [-18],
      },
      used: {
        pileSizes: [400],
        pileTipLevels: [-22],
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
    assert.deepEqual(result.pileTipLevels.find(({ value }) => value === -22), {
      value: -22,
      symbol: { baseShape: "circle", fillPattern: "full" },
      color: "#8C989F",
      symbolAutomatic: true,
      colorAutomatic: true,
      state: "disabled-used",
    });
  });
});
