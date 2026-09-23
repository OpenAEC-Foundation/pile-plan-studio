import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hasViewerWindowMetricsChanged,
  nextViewerLayoutSnapshot,
  type ViewerLayoutSnapshot,
  type ViewerWindowMetrics,
} from "./viewerResizePolicy.ts";

const originalMetrics: ViewerWindowMetrics = {
  innerWidth: 1200,
  innerHeight: 800,
  devicePixelRatio: 1,
};

const original: ViewerLayoutSnapshot = {
  rect: { left: 110.25, top: 80.5, width: 800.25, height: 600.5, scale: 0.8 },
  metrics: originalMetrics,
  compensation: { x: 20.25, y: -15.5 },
  anchor: { left: 130.5, top: 65 },
};

describe("viewer resize policy", () => {
  it("keeps the same project point at the center when the whole window changes size", () => {
    const rect = { left: 125.5, top: 95.25, width: 600.5, height: 400.25, scale: 0.8 };
    const next = nextViewerLayoutSnapshot(original, rect, {
      innerWidth: 1000,
      innerHeight: 600,
      devicePixelRatio: 1,
    }, "global");
    const oldWorldX = (original.rect.width / 2 - original.compensation.x - 17) / 3.25;
    const oldWorldY = (original.rect.height / 2 - original.compensation.y + 23) / 3.25;
    const newWorldX = (rect.width / 2 - next.compensation.x - 17) / 3.25;
    const newWorldY = (rect.height / 2 - next.compensation.y + 23) / 3.25;

    assert.ok(Math.abs(newWorldX - oldWorldX) < 1e-9);
    assert.ok(Math.abs(newWorldY - oldWorldY) < 1e-9);
    assert.equal(next.anchor.left, rect.left + next.compensation.x);
    assert.equal(next.anchor.top, rect.top + next.compensation.y);
  });

  it("keeps the screen-position anchor when only a panel changes layout", () => {
    const rect = { left: 140.5, top: 75.25, width: 700.25, height: 600.5, scale: 0.8 };
    const next = nextViewerLayoutSnapshot(original, rect, originalMetrics, "local");

    assert.deepEqual(next.compensation, { x: -10, y: -10.25 });
    assert.deepEqual(next.anchor, original.anchor);
  });

  it("returns to the original compensation after a window resize round trip", () => {
    const smaller = nextViewerLayoutSnapshot(original, {
      ...original.rect,
      width: 650.125,
      height: 450.375,
    }, { ...originalMetrics, innerWidth: 1050, innerHeight: 650 }, "global");
    const restored = nextViewerLayoutSnapshot(smaller, original.rect, originalMetrics, "global");

    assert.ok(Math.abs(restored.compensation.x - original.compensation.x) < 1e-9);
    assert.ok(Math.abs(restored.compensation.y - original.compensation.y) < 1e-9);
  });

  it("does not move the center when only device-pixel ratio changes", () => {
    const next = nextViewerLayoutSnapshot(original, original.rect, {
      ...originalMetrics,
      devicePixelRatio: 2,
    }, "global");

    assert.deepEqual(next.compensation, original.compensation);
    assert.equal(next.metrics.devicePixelRatio, 2);
    assert.equal(hasViewerWindowMetricsChanged(originalMetrics, next.metrics), true);
    assert.equal(hasViewerWindowMetricsChanged(originalMetrics, originalMetrics), false);
  });
});
