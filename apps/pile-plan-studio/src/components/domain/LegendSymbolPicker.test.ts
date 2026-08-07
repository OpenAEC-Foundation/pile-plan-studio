import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("LegendSymbolPicker", () => {
  it("offers nine base shapes and six accessible fill choices", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendSymbolPicker.tsx"), "utf8");

    assert.match(source, /PILE_BASE_SHAPES\.map/);
    assert.match(source, /PILE_FILL_PATTERNS\.map/);
    assert.match(source, /role="radiogroup"/);
    assert.match(source, /aria-checked=/);
    assert.match(source, /renderPileSymbol/);
    assert.match(source, /aria-haspopup="dialog"/);
    assert.match(source, /event\.key === "Escape"/);
    assert.match(source, /useRef/);
    assert.match(source, /document\.addEventListener\("pointerdown"/);
    assert.match(source, /rootRef\.current\?\.contains/);
    assert.match(source, /document\.removeEventListener\("pointerdown"/);
  });
});
