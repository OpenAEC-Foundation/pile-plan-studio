import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");
const viewer = read("components/domain/PilePlanViewer.tsx");
const ribbon = read("components/template/ribbon/Ribbon.tsx");
const modal = read("components/template/Modal.tsx");
const app = read("App.tsx");

describe("compact browser geometry integration", () => {
  it("normalizes viewer pointer positions and rendered lasso coordinates", () => {
    assert.match(viewer, /elementLayoutScale/);
    assert.match(viewer, /screenToLocal/);
    assert.match(viewer, /getLocalPointer/);
    assert.match(viewer, /getLocalCanvasRect/);
  });

  it("normalizes measured ribbon, modal, and splitter geometry", () => {
    assert.match(ribbon, /elementLayoutScale/);
    assert.match(modal, /elementLayoutScale/);
    assert.match(app, /elementLayoutScale\(appContentRef\.current\)/);
    assert.match(app, /screenToLocal/);
  });
});
