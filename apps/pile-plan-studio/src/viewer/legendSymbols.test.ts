import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PILE_BASE_SHAPES,
  PILE_FILL_PATTERNS,
  PILE_SYMBOL_CATALOG,
  isPileBaseShape,
  isPileFillPattern,
  pileSymbolKey,
} from "./legendSymbols.ts";

describe("legend symbol catalog", () => {
  it("contains the approved nine technical base shapes", () => {
    assert.deepEqual(PILE_BASE_SHAPES, [
      "circle",
      "square",
      "diamond",
      "triangle-up",
      "triangle-down",
      "triangle-left",
      "triangle-right",
      "rectangle-horizontal",
      "rectangle-vertical",
    ]);
  });

  it("orders 54 unique symbols by fill pattern and then base shape", () => {
    assert.deepEqual(PILE_FILL_PATTERNS, [
      "full",
      "top-half",
      "bottom-half",
      "left-half",
      "right-half",
      "diagonal-half",
    ]);
    assert.equal(PILE_SYMBOL_CATALOG.length, 54);
    assert.deepEqual(
      PILE_SYMBOL_CATALOG.slice(0, PILE_BASE_SHAPES.length),
      PILE_BASE_SHAPES.map((baseShape) => ({ baseShape, fillPattern: "full" })),
    );
    assert.equal(new Set(PILE_SYMBOL_CATALOG.map(pileSymbolKey)).size, 54);
  });

  it("validates base shapes and fill patterns independently", () => {
    assert.equal(isPileBaseShape("rectangle-horizontal"), true);
    assert.equal(isPileBaseShape("star"), false);
    assert.equal(isPileFillPattern("diagonal-half"), true);
    assert.equal(isPileFillPattern("transparent"), false);
  });
});
