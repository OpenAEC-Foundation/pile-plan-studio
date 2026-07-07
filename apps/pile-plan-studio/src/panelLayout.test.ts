import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { clampRightPanelWidth, resizeRightPanelWidth } from "./panelLayout.ts";

describe("panel layout helpers", () => {
  it("clamps the right panel width to usable bounds", () => {
    assert.equal(clampRightPanelWidth(500), 620);
    assert.equal(clampRightPanelWidth(800), 800);
    assert.equal(clampRightPanelWidth(1200), 980);
  });

  it("resizes the right panel by dragging the splitter", () => {
    assert.equal(resizeRightPanelWidth({ startWidth: 760, startX: 700, currentX: 650 }), 810);
    assert.equal(resizeRightPanelWidth({ startWidth: 760, startX: 700, currentX: 760 }), 700);
  });
});
