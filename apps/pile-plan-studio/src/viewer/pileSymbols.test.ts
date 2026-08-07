import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PILE_SYMBOL_CATALOG } from "./legendSymbols.ts";
import { renderPileSymbol } from "./pileSymbols.ts";

const TRIANGLES = {
  "triangle-up": { points: [[12, 3], [21, 20], [3, 20]], halfArea: 76.5 },
  "triangle-down": { points: [[3, 4], [21, 4], [12, 21]], halfArea: 76.5 },
  "triangle-left": { points: [[4, 12], [20, 3], [20, 21]], halfArea: 72 },
  "triangle-right": { points: [[4, 3], [20, 12], [4, 21]], halfArea: 72 },
} as const;

const PARTIAL_FILLS = [
  "top-half",
  "bottom-half",
  "left-half",
  "right-half",
  "diagonal-half",
] as const;

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

  it("colors half the visible area of every partially filled triangle", () => {
    for (const [baseShape, triangle] of Object.entries(TRIANGLES)) {
      for (const fillPattern of PARTIAL_FILLS) {
        const svg = renderPileSymbol({
          baseShape: baseShape as keyof typeof TRIANGLES,
          fillPattern,
        }, "#112233");
        const clipPoints = extractClipPolygon(svg);

        assert.ok(
          Math.abs(polygonArea(clipPoints) - triangle.halfArea) < 0.02,
          `${baseShape}:${fillPattern} should color half the triangle area`,
        );
        assert.ok(
          clipPoints.some((point) => isDirectionalExtreme(point, triangle.points, fillPattern)),
          `${baseShape}:${fillPattern} should retain the requested fill direction`,
        );
      }
    }
  });

  it("uses distinct clip identifiers for different base shapes", () => {
    const upward = renderPileSymbol({ baseShape: "triangle-up", fillPattern: "top-half" }, "#112233");
    const downward = renderPileSymbol({ baseShape: "triangle-down", fillPattern: "top-half" }, "#112233");

    assert.match(upward, /clipPath id="pile-symbol-triangle-up-top-half"/);
    assert.match(downward, /clipPath id="pile-symbol-triangle-down-top-half"/);
  });

  it("escapes custom color text before placing it in SVG", () => {
    const svg = renderPileSymbol({ baseShape: "square", fillPattern: "full" }, `" onload="bad`);
    assert.doesNotMatch(svg, /fill="" onload=/);
    assert.match(svg, /&quot;/);
  });

  it("supports separate outline and neutral-fill colors for themed consumers", () => {
    const svg = renderPileSymbol(
      { baseShape: "diamond", fillPattern: "top-half" },
      "currentColor",
      { outlineColor: "currentColor", neutralFill: "var(--theme-bg)" },
    );

    assert.match(svg, /fill="currentColor"/);
    assert.match(svg, /fill="var\(--theme-bg\)"/);
    assert.match(svg, /stroke="currentColor"/);
  });
});

function extractClipPolygon(svg: string): Array<readonly [number, number]> {
  const match = svg.match(/<clipPath[^>]*><polygon points="([^"]+)"/);
  assert.ok(match, "triangle partial fills should use a shape-aware clip polygon");
  return match[1].trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return [x, y] as const;
  });
}

function polygonArea(points: readonly (readonly [number, number])[]): number {
  return Math.abs(points.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    return sum + x * nextY - nextX * y;
  }, 0)) / 2;
}

function isDirectionalExtreme(
  point: readonly [number, number],
  source: readonly (readonly [number, number])[],
  fillPattern: typeof PARTIAL_FILLS[number],
): boolean {
  const score = ([x, y]: readonly [number, number]) => fillPattern === "top-half"
    ? y
    : fillPattern === "bottom-half"
      ? -y
      : fillPattern === "left-half"
        ? x
        : fillPattern === "right-half"
          ? -x
          : x + y;
  const extreme = Math.min(...source.map(score));
  return Math.abs(score(point) - extreme) < 0.001;
}
