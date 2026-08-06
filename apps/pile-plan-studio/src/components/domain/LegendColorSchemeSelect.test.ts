import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("LegendColorSchemeSelect", () => {
  it("renders five named palette previews in a keyboard listbox", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendColorSchemeSelect.tsx"), "utf8");

    assert.match(source, /LEGEND_COLOR_SCHEMES\.map/);
    assert.match(source, /getLegendColorSchemePreview/);
    assert.match(source, /role="listbox"/);
    assert.match(source, /role="option"/);
    assert.match(source, /ArrowDown/);
    assert.match(source, /ArrowUp/);
    assert.match(source, /event\.key === "Enter"/);
    assert.match(source, /event\.key === "Escape"/);
  });
});
