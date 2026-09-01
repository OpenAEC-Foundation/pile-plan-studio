import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type CoordinateReadoutProps = {
  points: ReadonlyArray<{ x_mm: number; y_mm: number }>;
  locale: string;
};

async function loadCoordinateReadout(): Promise<ComponentType<CoordinateReadoutProps> | undefined> {
  const module = await import("./CoordinateReadout.ts").catch(() => null);
  return module?.CoordinateReadout as ComponentType<CoordinateReadoutProps> | undefined;
}

describe("CoordinateReadout", () => {
  it("renders X and Y as two coordinate facts for one object", async () => {
    const CoordinateReadout = await loadCoordinateReadout();
    assert.ok(CoordinateReadout, "CoordinateReadout should be available");

    const html = renderToStaticMarkup(createElement(CoordinateReadout, {
      points: [{ x_mm: 122_600, y_mm: 4_150.5 }],
      locale: "nl-NL",
    }));

    assert.equal(
      html,
      '<dl class="coordinate-readout"><div><dt>X</dt><dd>122.600 mm</dd></div><div><dt>Y</dt><dd>4.150,5 mm</dd></div></dl>',
    );
  });

  it("renders nothing for a multi-selection", async () => {
    const CoordinateReadout = await loadCoordinateReadout();
    assert.ok(CoordinateReadout, "CoordinateReadout should be available");

    const html = renderToStaticMarkup(createElement(CoordinateReadout, {
      points: [
        { x_mm: 100, y_mm: 200 },
        { x_mm: 300, y_mm: 400 },
      ],
      locale: "en-US",
    }));

    assert.equal(html, "");
  });
});
