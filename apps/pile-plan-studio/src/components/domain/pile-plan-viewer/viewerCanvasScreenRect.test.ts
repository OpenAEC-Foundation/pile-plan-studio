import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getViewerContentScreenRect } from "./viewerCanvasScreenRect.ts";

describe("viewer content screen rectangle", () => {
  it("retains fractional borders and dimensions without rounded client metrics", () => {
    assert.deepEqual(getViewerContentScreenRect(
      { left: 202.390625, top: 286.03125, width: 218.21875, height: 602.984375 },
      { left: 1.25, top: 1.25, right: 1.25, bottom: 1.25 },
      0.8,
    ), {
      left: 203.390625,
      top: 287.03125,
      width: 216.21875,
      height: 600.984375,
    });
  });
});
