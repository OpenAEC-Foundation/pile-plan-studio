import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("LegendColorPicker", () => {
  it("combines a clearly labelled native color input with scheme colors", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendColorPicker.tsx"), "utf8");

    assert.match(source, /type="color"/);
    assert.match(source, /openColorPickerLabel/);
    assert.match(source, /createLegendColorPickerPalette/);
    assert.match(source, /legend-color-scheme-grid/);
    assert.match(source, /aria-selected=\{selected\}/);
    assert.doesNotMatch(source, /legend-hex-color/);
    assert.match(source, /aria-haspopup="dialog"/);
    assert.match(source, /useRef/);
    assert.match(source, /document\.addEventListener\("pointerdown"/);
    assert.match(source, /rootRef\.current\?\.contains/);
    assert.match(source, /document\.removeEventListener\("pointerdown"/);
  });
});
