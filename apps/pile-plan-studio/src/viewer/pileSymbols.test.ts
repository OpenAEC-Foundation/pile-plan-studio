import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PILE_SYMBOL_CATALOG } from "./legendSymbols.ts";
import { renderPileSymbol } from "./pileSymbols.ts";

describe("pile symbol rendering", () => {
  it("renders every catalog symbol as an opaque outlined SVG", () => {
    for (const symbol of PILE_SYMBOL_CATALOG) {
      const svg = renderPileSymbol(symbol, "#0072B2");
      assert.match(svg, /<svg\b/);
      assert.match(svg, /fill="#F3F5F6"/);
      assert.match(svg, /fill="#0072B2"/);
      assert.match(svg, /stroke="#172026"/);
      assert.doesNotMatch(svg, /fill="transparent"/);
      assert.doesNotMatch(svg, /vector-effect="non-scaling-stroke"/);
    }
  });

  it("uses the documented clipping regions for partial fills", () => {
    assert.match(renderPileSymbol({ baseShape: "circle", fillPattern: "top-half" }, "#112233"),
      /<rect x="0" y="0" width="24" height="12"/);
    assert.match(renderPileSymbol({ baseShape: "circle", fillPattern: "bottom-half" }, "#112233"),
      /<rect x="0" y="12" width="24" height="12"/);
    assert.match(renderPileSymbol({ baseShape: "circle", fillPattern: "left-half" }, "#112233"),
      /<rect x="0" y="0" width="12" height="24"/);
    assert.match(renderPileSymbol({ baseShape: "circle", fillPattern: "right-half" }, "#112233"),
      /<rect x="12" y="0" width="12" height="24"/);
    assert.match(renderPileSymbol({ baseShape: "circle", fillPattern: "diagonal-half" }, "#112233"),
      /<polygon points="0,0 24,0 0,24"/);
  });

  it("escapes custom color text before placing it in SVG", () => {
    const svg = renderPileSymbol({ baseShape: "square", fillPattern: "full" }, `" onload="bad`);
    assert.doesNotMatch(svg, /fill="" onload=/);
    assert.match(svg, /&quot;/);
  });
});
