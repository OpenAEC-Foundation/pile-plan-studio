import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

describe("shared viewer drawing SVG", () => {
  it("keeps fractional project geometry in one pointer-inert root", async () => {
    const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
    try {
    const { default: ViewerDrawingSvg } = await server.ssrLoadModule("/src/components/domain/pile-plan-viewer/ViewerDrawingSvg.tsx");
    const html = renderToStaticMarkup(createElement(ViewerDrawingSvg, {
      width: 1000.5,
      height: 500.25,
      tipLevelRegionPresentation: [],
      loadPointGroupGeometry: [],
      cptConnectionSegments: [{
        from: { id: 1, x: 30, y: 90 },
        to: { id: 2, x: 70, y: 90 },
      }],
    }));

    assert.equal((html.match(/<svg\b/g) ?? []).length, 1);
    assert.match(html, /viewBox="0 0 1000\.5 500\.25"/);
    assert.match(html, /class="viewer-drawing-svg"/);
    assert.match(html, /x1="300\.15"/);
    assert.match(html, /y1="450\.225"/);
    } finally {
      await server.close();
    }
  });
});
