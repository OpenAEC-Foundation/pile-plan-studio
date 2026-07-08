import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addLoadPointsToSelection,
  clearSelection,
  openCpt,
  switchRightPanelMode,
  selectLoadPoint,
  type SelectionState,
} from "./selectionState.ts";

describe("selection state transitions", () => {
  const cptOpenState: SelectionState = {
    selectedLoadPointId: 15,
    selectedLoadPointIds: [15],
    selectedCptId: 64,
    rightPanelMode: "cpts",
  };

  it("clears the open CPT highlight when switching away from CPTs", () => {
    assert.deepEqual(switchRightPanelMode(cptOpenState, "load-point"), {
      selectedLoadPointId: 15,
      selectedLoadPointIds: [15],
      selectedCptId: null,
      rightPanelMode: "load-point",
    });
  });

  it("shows another load point and keeps the current right panel tab", () => {
    assert.deepEqual(selectLoadPoint(cptOpenState, 18), {
      selectedLoadPointId: 18,
      selectedLoadPointIds: [18],
      selectedCptId: null,
      rightPanelMode: "cpts",
    });
  });

  it("adds load points to the current selection with Shift interaction", () => {
    assert.deepEqual(addLoadPointsToSelection(cptOpenState, [18, 22, 15]), {
      selectedLoadPointId: 15,
      selectedLoadPointIds: [15, 18, 22],
      selectedCptId: null,
      rightPanelMode: "cpts",
    });
  });

  it("removes a selected load point when Shift-clicking it again", () => {
    assert.deepEqual(
      addLoadPointsToSelection({ ...cptOpenState, selectedLoadPointIds: [15, 18] }, [15], { toggle: true }),
      {
        selectedLoadPointId: 18,
        selectedLoadPointIds: [18],
        selectedCptId: null,
        rightPanelMode: "cpts",
      },
    );
  });

  it("clears the selected load point and open CPT while keeping the active tab", () => {
    assert.deepEqual(clearSelection(cptOpenState), {
      selectedLoadPointId: null,
      selectedLoadPointIds: [],
      selectedCptId: null,
      rightPanelMode: "cpts",
    });
  });

  it("opens a CPT table without changing the selected load point", () => {
    assert.deepEqual(openCpt({ ...cptOpenState, selectedCptId: null, rightPanelMode: "load-point" }, 61), {
      selectedLoadPointId: 15,
      selectedLoadPointIds: [15],
      selectedCptId: 61,
      rightPanelMode: "cpts",
    });
  });
});
