import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLegendColorPickerPalette } from "./legendColorPickerPalette.ts";

describe("legend color picker palette", () => {
  it("offers the exact generated colors for the active scheme", () => {
    assert.deepEqual(
      createLegendColorPickerPalette("tableau-extended", 4, "#59A14F"),
      [
        { color: "#4E79A7", selected: false },
        { color: "#F28E2B", selected: false },
        { color: "#59A14F", selected: true },
        { color: "#E15759", selected: false },
      ],
    );
  });

  it("does not mark a custom color as one of the scheme colors", () => {
    assert.deepEqual(
      createLegendColorPickerPalette("tableau-extended", 2, "#123456"),
      [
        { color: "#4E79A7", selected: false },
        { color: "#F28E2B", selected: false },
      ],
    );
  });
});
