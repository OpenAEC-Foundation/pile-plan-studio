import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getLassoSelectionOperation,
  getPointIdsInRectangle,
  shouldClearViewerSelectionOnEscape,
  shouldStartLassoInteraction,
  transitionLassoSelectionMode,
} from "./lassoSelection.ts";

describe("lasso selection", () => {
  it("selects points inside a screen-space rectangle", () => {
    const selected = getPointIdsInRectangle(
      [
        { id: 1, x: 10, y: 10 },
        { id: 2, x: 30, y: 30 },
        { id: 3, x: 60, y: 60 },
      ],
      { startX: 40, startY: 40, endX: 0, endY: 0 },
    );

    assert.deepEqual(selected, [1, 2]);
  });

  it("starts from the ribbon mode or Shift without changing lock-editing semantics", () => {
    assert.equal(shouldStartLassoInteraction({
      lassoSelectionActive: true,
      shiftKey: false,
      targetIsInteractive: false,
      selectionAllowed: true,
      isEditingLoadPointLocks: false,
    }), true);
    assert.equal(shouldStartLassoInteraction({
      lassoSelectionActive: false,
      shiftKey: true,
      targetIsInteractive: false,
      selectionAllowed: true,
      isEditingLoadPointLocks: false,
    }), true);
    assert.equal(shouldStartLassoInteraction({
      lassoSelectionActive: true,
      shiftKey: false,
      targetIsInteractive: false,
      selectionAllowed: true,
      isEditingLoadPointLocks: true,
    }), false);
    assert.equal(shouldStartLassoInteraction({
      lassoSelectionActive: false,
      shiftKey: true,
      targetIsInteractive: false,
      selectionAllowed: true,
      isEditingLoadPointLocks: true,
    }), true);
    assert.equal(shouldStartLassoInteraction({
      lassoSelectionActive: true,
      shiftKey: true,
      targetIsInteractive: false,
      selectionAllowed: false,
      isEditingLoadPointLocks: false,
    }), false);
    assert.equal(shouldStartLassoInteraction({
      lassoSelectionActive: true,
      shiftKey: true,
      targetIsInteractive: true,
      selectionAllowed: true,
      isEditingLoadPointLocks: false,
    }), false);
  });

  it("replaces only for an unmodified ribbon-mode lasso", () => {
    assert.equal(getLassoSelectionOperation({
      lassoSelectionActive: true,
      shiftKey: false,
      isEditingLoadPointLocks: false,
    }), "replace");
    assert.equal(getLassoSelectionOperation({
      lassoSelectionActive: true,
      shiftKey: true,
      isEditingLoadPointLocks: false,
    }), "add");
    assert.equal(getLassoSelectionOperation({
      lassoSelectionActive: false,
      shiftKey: true,
      isEditingLoadPointLocks: false,
    }), "add");
    assert.equal(getLassoSelectionOperation({
      lassoSelectionActive: false,
      shiftKey: true,
      isEditingLoadPointLocks: true,
    }), "lock");
  });

  it("keeps the ribbon mode active until it is toggled or dismissed", () => {
    assert.equal(transitionLassoSelectionMode(false, { type: "toggle" }), true);
    assert.equal(transitionLassoSelectionMode(true, { type: "editing-context", available: true }), true);
    assert.equal(transitionLassoSelectionMode(true, { type: "toggle" }), false);
    assert.equal(transitionLassoSelectionMode(true, { type: "dismiss" }), false);
    assert.equal(transitionLassoSelectionMode(true, { type: "editing-context", available: false }), false);
  });

  it("keeps the current selection when Escape dismisses an active lasso mode", () => {
    assert.equal(shouldClearViewerSelectionOnEscape({
      lassoSelectionActive: true,
      isEditingLoadPointLocks: false,
      selectionAllowed: true,
    }), false);
    assert.equal(shouldClearViewerSelectionOnEscape({
      lassoSelectionActive: false,
      isEditingLoadPointLocks: false,
      selectionAllowed: true,
    }), true);
    assert.equal(shouldClearViewerSelectionOnEscape({
      lassoSelectionActive: false,
      isEditingLoadPointLocks: true,
      selectionAllowed: true,
    }), false);
    assert.equal(shouldClearViewerSelectionOnEscape({
      lassoSelectionActive: false,
      isEditingLoadPointLocks: false,
      selectionAllowed: false,
    }), false);
  });
});
