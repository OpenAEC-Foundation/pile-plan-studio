import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderPileSymbol } from "./pileSymbols.ts";

describe("pile symbol rendering", () => {
  it("renders triangle symbols with a real SVG stroke", () => {
    const symbol = renderPileSymbol("triangle-up", "#b07aa1");

    assert.match(symbol, /<svg\b/);
    assert.match(symbol, /<polygon\b/);
    assert.match(symbol, /fill="#b07aa1"/);
    assert.match(symbol, /stroke="#172026"/);
    assert.doesNotMatch(symbol, /shape-triangle-up/);
    assert.doesNotMatch(symbol, /clip-path/);
  });
});
