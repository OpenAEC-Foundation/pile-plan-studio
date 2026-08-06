import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("LegendColorPicker", () => {
  it("combines a native color input with a validated hexadecimal draft", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendColorPicker.tsx"), "utf8");

    assert.match(source, /type="color"/);
    assert.match(source, /normalizeLegendHexColor/);
    assert.match(source, /setHexDraft\(value\)/);
    assert.match(source, /onBlur=/);
    assert.match(source, /aria-haspopup="dialog"/);
  });
});
