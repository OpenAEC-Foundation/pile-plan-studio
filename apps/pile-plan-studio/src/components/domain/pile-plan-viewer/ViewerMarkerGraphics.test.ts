import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

describe("shared marker SVG graphics", () => {
  it("anchors pile symbols, selection rings, CPT labels, and halos in one SVG fragment", async () => {
    const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
    try {
      const { default: ViewerMarkerGraphics } = await server.ssrLoadModule("/src/components/domain/pile-plan-viewer/ViewerMarkerGraphics.tsx");
      const html = renderToStaticMarkup(createElement("svg", null, createElement(ViewerMarkerGraphics, { graphics: [
        {
          key: "load-point:15", kind: "load-point", id: 15, x: 100.25, y: 200.5, scale: 0.75,
          drawPriority: 40, ring: { color: "selection", radius: 7.75 },
          halo: { kind: "missing", intensity: 0, opacity: 1 }, locked: false, opacity: 1,
          appearance: { type: "pile", symbol: { baseShape: "circle", fillPattern: "top-half" }, color: "#123456", smallDot: false },
        },
        {
          key: "cpt:3", kind: "cpt", id: 3, x: 105.25, y: 205.5, scale: 0.75,
          drawPriority: 50, ring: null, halo: null, locked: false, opacity: 1,
          appearance: { type: "cpt", label: "35", labelScale: 0.34, selectedStyle: false, inspectedOnly: false },
        },
      ] })));

      assert.equal((html.match(/<svg\b/g) ?? []).length, 1);
      assert.match(html, /class="viewer-marker-graphics"/);
      assert.match(html, /translate\(100\.25 200\.5\)/);
      assert.match(html, /<circle[^>]*cx="0"[^>]*cy="0"[^>]*r="7\.75"/);
      assert.match(html, /id="viewer-pile-15"/);
      assert.match(html, /<feGaussianBlur/);
      assert.match(html, /<circle r="5\.25" fill="none" stroke="rgba\(194, 130, 0, 0\.72\)" stroke-width="1\.5"/);
      assert.match(html, /translate\(105\.25 205\.5\)/);
      assert.match(html, />35<\/text>/);
    } finally {
      await server.close();
    }
  });
  it("draws compact context rings with fine dashes while keeping selection rings solid", async () => {
    const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
    try {
      const { default: ViewerMarkerGraphics } = await server.ssrLoadModule("/src/components/domain/pile-plan-viewer/ViewerMarkerGraphics.tsx");
      const common={kind:"load-point",x:100.25,y:200.5,scale:0.075,drawPriority:40,halo:null,locked:false,opacity:1,appearance:{type:"neutral"}};
      const html=renderToStaticMarkup(createElement("svg",null,createElement(ViewerMarkerGraphics,{graphics:[
        {...common,key:"load-point:1",id:1,ring:{color:"context",radius:3.025}},
        {...common,key:"load-point:2",id:2,ring:{color:"selection",radius:3.025}},
      ]})));
      const context=html.match(/<circle[^>]*stroke="#738087"[^>]*>/)![0];
      const selected=html.match(/<circle[^>]*stroke="#ed7100"[^>]*>/)![0];
      assert.match(context,/stroke-width="1"/);
      assert.ok(Number(context.match(/stroke-dasharray="([^ ]+)/)![1])<0.21);
      assert.doesNotMatch(selected,/stroke-dasharray/);
      assert.match(selected,/stroke-width="1"/);
      assert.match(html,/translate\(100\.25 200\.5\)/);
    } finally {await server.close();}
  });

});
