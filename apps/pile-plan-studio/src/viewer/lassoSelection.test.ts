import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as lassoSelection from "./lassoSelection.ts";

const { getPointIdsInRectangle } = lassoSelection;

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
    const shouldStart = (lassoSelection as typeof lassoSelection & {
      shouldStartLassoInteraction?: (input: {
        lassoSelectionActive: boolean;
        shiftKey: boolean;
        targetIsInteractive: boolean;
        selectionAllowed: boolean;
        isEditingLoadPointLocks: boolean;
      }) => boolean;
    }).shouldStartLassoInteraction;

    assert.equal(shouldStart?.({
      lassoSelectionActive: true,
      shiftKey: false,
      targetIsInteractive: false,
      selectionAllowed: true,
      isEditingLoadPointLocks: false,
    }), true);
    assert.equal(shouldStart?.({
      lassoSelectionActive: false,
      shiftKey: true,
      targetIsInteractive: false,
      selectionAllowed: true,
      isEditingLoadPointLocks: false,
    }), true);
    assert.equal(shouldStart?.({
      lassoSelectionActive: true,
      shiftKey: false,
      targetIsInteractive: false,
      selectionAllowed: true,
      isEditingLoadPointLocks: true,
    }), false);
    assert.equal(shouldStart?.({
      lassoSelectionActive: false,
      shiftKey: true,
      targetIsInteractive: false,
      selectionAllowed: true,
      isEditingLoadPointLocks: true,
    }), true);
    assert.equal(shouldStart?.({
      lassoSelectionActive: true,
      shiftKey: true,
      targetIsInteractive: false,
      selectionAllowed: false,
      isEditingLoadPointLocks: false,
    }), false);
    assert.equal(shouldStart?.({
      lassoSelectionActive: true,
      shiftKey: true,
      targetIsInteractive: true,
      selectionAllowed: true,
      isEditingLoadPointLocks: false,
    }), false);
  });

  it("keeps the ribbon mode active until it is toggled or dismissed", () => {
    const transition = (lassoSelection as typeof lassoSelection & {
      transitionLassoSelectionMode?: (
        active: boolean,
        event: { type: "toggle" | "dismiss" } | { type: "editing-context"; available: boolean },
      ) => boolean;
    }).transitionLassoSelectionMode;

    assert.equal(transition?.(false, { type: "toggle" }), true);
    assert.equal(transition?.(true, { type: "editing-context", available: true }), true);
    assert.equal(transition?.(true, { type: "toggle" }), false);
    assert.equal(transition?.(true, { type: "dismiss" }), false);
    assert.equal(transition?.(true, { type: "editing-context", available: false }), false);
  });

  it("keeps the current selection when Escape dismisses an active lasso mode", () => {
    const shouldClear = (lassoSelection as typeof lassoSelection & {
      shouldClearViewerSelectionOnEscape?: (input: {
        lassoSelectionActive: boolean;
        isEditingLoadPointLocks: boolean;
        selectionAllowed: boolean;
      }) => boolean;
    }).shouldClearViewerSelectionOnEscape;

    assert.equal(shouldClear?.({
      lassoSelectionActive: true,
      isEditingLoadPointLocks: false,
      selectionAllowed: true,
    }), false);
    assert.equal(shouldClear?.({
      lassoSelectionActive: false,
      isEditingLoadPointLocks: false,
      selectionAllowed: true,
    }), true);
    assert.equal(shouldClear?.({
      lassoSelectionActive: false,
      isEditingLoadPointLocks: true,
      selectionAllowed: true,
    }), false);
    assert.equal(shouldClear?.({
      lassoSelectionActive: false,
      isEditingLoadPointLocks: false,
      selectionAllowed: false,
    }), false);
  });
});
