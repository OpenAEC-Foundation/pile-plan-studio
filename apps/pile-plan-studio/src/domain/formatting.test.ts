import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as formatting from "./formatting.ts";

const { formatNumber, formatOptionalNumber } = formatting;

describe("formatting", () => {
  it("formats numbers with at most one decimal", () => {
    assert.equal(formatNumber(1234.56), "1,234.6");
    assert.equal(formatNumber(18), "18");
  });

  it("formats missing and non-finite optional numbers as dashes", () => {
    assert.equal(formatOptionalNumber(null), "-");
    assert.equal(formatOptionalNumber(undefined), "-");
    assert.equal(formatOptionalNumber(Number.NaN), "-");
    assert.equal(formatOptionalNumber(Number.POSITIVE_INFINITY), "-");
  });

  it("formats finite optional numbers with a suffix", () => {
    assert.equal(formatOptionalNumber(693, " kN"), "693 kN");
    assert.equal(formatOptionalNumber(0.114, "%", 100), "11.4%");
  });

  it("formats one selected object's coordinates using the active locale", () => {
    const formatCoordinateReadout = (formatting as typeof formatting & {
      formatCoordinateReadout?: (
        points: ReadonlyArray<{ x_mm: number; y_mm: number }>,
        locale: string,
      ) => { x: string; y: string } | null;
    }).formatCoordinateReadout;

    assert.deepEqual(
      formatCoordinateReadout?.([{ x_mm: 122_600, y_mm: 4_150.5 }], "nl-NL"),
      { x: "122.600 mm", y: "4.150,5 mm" },
    );
  });

  it("omits coordinates when the selection does not identify one object", () => {
    const formatCoordinateReadout = (formatting as typeof formatting & {
      formatCoordinateReadout?: (
        points: ReadonlyArray<{ x_mm: number; y_mm: number }>,
        locale: string,
      ) => { x: string; y: string } | null;
    }).formatCoordinateReadout;

    assert.equal(formatCoordinateReadout?.([], "en-US"), null);
    assert.equal(formatCoordinateReadout?.([
      { x_mm: 100, y_mm: 200 },
      { x_mm: 300, y_mm: 400 },
    ], "en-US"), null);
  });
});
