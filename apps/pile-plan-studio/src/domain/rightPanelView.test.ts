import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getRightPanelView } from "./rightPanelView.ts";

describe("right panel view", () => {
  it("uses the selected fixed tab as the panel view", () => {
    assert.equal(getRightPanelView({ rightPanelMode: "cpts" }), "cpts");
  });

  it("keeps load point as a real tab even when nothing is selected", () => {
    assert.equal(getRightPanelView({ rightPanelMode: "load-point" }), "load-point");
  });
});
