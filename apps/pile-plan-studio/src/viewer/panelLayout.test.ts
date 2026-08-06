import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clampExplorerWidth,
  clampRightPanelWidth,
  DEFAULT_EXPLORER_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  MAX_EXPLORER_WIDTH,
  MIN_EXPLORER_WIDTH,
  MIN_RIGHT_PANEL_WIDTH,
  resizeExplorerWidth,
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

  it("keeps the project explorer within usable bounds", () => {
    assert.equal(DEFAULT_EXPLORER_WIDTH, 240);
    assert.equal(MIN_EXPLORER_WIDTH, 180);
    assert.equal(MAX_EXPLORER_WIDTH, 480);
    assert.equal(clampExplorerWidth(120), 180);
    assert.equal(clampExplorerWidth(320), 320);
    assert.equal(clampExplorerWidth(640), 480);
  });

  it("widens the project explorer when its splitter moves right", () => {
    assert.equal(resizeExplorerWidth({ startWidth: 240, startX: 240, currentX: 300 }), 300);
    assert.equal(resizeExplorerWidth({ startWidth: 240, startX: 240, currentX: 200 }), 200);
  });
});
