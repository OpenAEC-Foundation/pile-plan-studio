import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCoordinateGridCanvasFrame } from "./coordinateGridCanvas.ts";

const pattern = {
  spacing: 1_000,
  spacingPixels: 110.4166666667,
  originX: 87.5,
  originY: -32.25,
};

describe("device-pixel coordinate grid", () => {
  for (const devicePixelRatio of [1, 1.25, 1.5, 2]) {
    it(`snaps each visible line independently at DPR ${devicePixelRatio}`, () => {
      const screen = { left: 331.0625, top: 223.40625, width: 800, height: 500 };
      const frame = getCoordinateGridCanvasFrame(pattern, {
        screen, rootScale: 0.8, devicePixelRatio,
      });

      assert.ok(Number.isInteger(frame.bitmapWidth) && frame.bitmapWidth > 0);
      assert.ok(Number.isInteger(frame.bitmapHeight) && frame.bitmapHeight > 0);
      assert.ok(Number.isInteger(frame.strokePx) && frame.strokePx > 0);
      assert.ok(frame.verticalX.every(Number.isInteger));
      assert.ok(frame.horizontalY.every(Number.isInteger));
      assert.ok(frame.verticalX.length < screen.width / (pattern.spacingPixels * 0.8) + 3);
      assert.ok(frame.horizontalY.length < screen.height / (pattern.spacingPixels * 0.8) + 3);
      assert.ok(frame.cssLeft <= 0 && frame.cssTop <= 0);
      assert.ok((frame.cssWidth + frame.cssLeft) * 0.8 >= screen.width - 1e-9);
      assert.ok((frame.cssHeight + frame.cssTop) * 0.8 >= screen.height - 1e-9);
    });
  }

  it("does not round the fractional repeated spacing into a fixed tile", () => {
    const frame = getCoordinateGridCanvasFrame(pattern, {
      screen: { left: 331.0625, top: 223.40625, width: 800, height: 500 },
      rootScale: 0.8,
      devicePixelRatio: 1.5,
    });
    assert.equal(frame.strokePx, 1);
    const gaps = frame.verticalX.slice(1).map((x, index) => x - frame.verticalX[index]);
    assert.ok(gaps.includes(132));
    assert.ok(gaps.includes(133));
  });

  it("preserves the same global physical grid line across fractional screen origins", () => {
    const first = { left: 331.0625, top: 223.40625, width: 800, height: 500 };
    const second = { left: 370.3958435, top: 200.34375, width: 800, height: 500 };
    const globalX = first.left + pattern.originX * 0.8;
    const globalY = first.top + pattern.originY * 0.8;
    const shifted = {
      ...pattern,
      originX: (globalX - second.left) / 0.8,
      originY: (globalY - second.top) / 0.8,
    };
    const firstFrame = getCoordinateGridCanvasFrame(pattern, {
      screen: first, rootScale: 0.8, devicePixelRatio: 1.5,
    });
    const secondFrame = getCoordinateGridCanvasFrame(shifted, {
      screen: second, rootScale: 0.8, devicePixelRatio: 1.5,
    });

    const firstOrigin = Math.floor(first.left * 1.5);
    const secondOrigin = Math.floor(second.left * 1.5);
    assert.ok(firstFrame.verticalX.some((x) => secondFrame.verticalX.includes(x + firstOrigin - secondOrigin)));
    const firstOriginY = Math.floor(first.top * 1.5);
    const secondOriginY = Math.floor(second.top * 1.5);
    assert.ok(firstFrame.horizontalY.some((y) => secondFrame.horizontalY.includes(y + firstOriginY - secondOriginY)));
  });
});
