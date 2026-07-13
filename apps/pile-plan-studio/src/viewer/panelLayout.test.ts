import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clampRightPanelWidth,
  DEFAULT_RIGHT_PANEL_WIDTH,
  MIN_RIGHT_PANEL_WIDTH,
  resizeRightPanelWidth,
} from "./panelLayout.ts";

describe("panel layout helpers", () => {
  it("opens the right panel just wide enough to show the Cost column first", () => {
    assert.equal(DEFAULT_RIGHT_PANEL_WIDTH, 620);
  });

  it("clamps the right panel width to usable bounds", () => {
    assert.equal(MIN_RIGHT_PANEL_WIDTH, 360);
    assert.equal(clampRightPanelWidth(300), 360);
    assert.equal(clampRightPanelWidth(500), 500);
    assert.equal(clampRightPanelWidth(800), 800);
    assert.equal(clampRightPanelWidth(1200), 980);
  });

  it("resizes the right panel by dragging the splitter", () => {
    assert.equal(resizeRightPanelWidth({ startWidth: 760, startX: 700, currentX: 650 }), 810);
    assert.equal(resizeRightPanelWidth({ startWidth: 760, startX: 700, currentX: 760 }), 700);
  });
});
