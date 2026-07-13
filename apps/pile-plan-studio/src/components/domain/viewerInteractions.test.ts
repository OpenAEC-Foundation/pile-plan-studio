import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearReactViewerSelection,
  getReactViewerSelectedCptIds,
  openReactViewerCpt,
  selectReactViewerLoadPoint,
  shouldClearLegendSelectionFromPointerTarget,
  shouldRaiseCptMarker,
  toggleReactViewerLoadPoint,
} from "./viewerInteractions.ts";

describe("React viewer interactions", () => {
  it("selects one load point and clears the selected CPT", () => {
    const next = selectReactViewerLoadPoint(
      {
        selectedLoadPointId: 1,
        selectedLoadPointIds: [1, 3],
        selectedCptId: 64,
        rightPanelMode: "cpts",
        legendSelectionFilter: { pileSizes: [290], pileTipLevels: [-17.5] },
      },
      2,
    );

    assert.deepEqual(next.selectedLoadPointIds, [2]);
    assert.equal(next.selectedLoadPointId, 2);
    assert.equal(next.selectedCptId, null);
    assert.equal(next.rightPanelMode, "cpts");
    assert.deepEqual(next.legendSelectionFilter, { pileSizes: [], pileTipLevels: [] });
  });

  it("toggles a load point with shift-click", () => {
    const next = toggleReactViewerLoadPoint(
      {
        selectedLoadPointId: 1,
        selectedLoadPointIds: [1, 2],
        selectedCptId: null,
        rightPanelMode: "load-point",
        legendSelectionFilter: { pileSizes: [320], pileTipLevels: [] },
      },
      2,
    );

    assert.deepEqual(next.selectedLoadPointIds, [1]);
    assert.equal(next.selectedLoadPointId, 1);
    assert.deepEqual(next.legendSelectionFilter, { pileSizes: [], pileTipLevels: [] });
  });

  it("clears load point and CPT selection without changing the active panel", () => {
    const next = clearReactViewerSelection({
      selectedLoadPointId: 1,
      selectedLoadPointIds: [1],
      selectedCptId: 64,
      rightPanelMode: "cpts",
      legendSelectionFilter: { pileSizes: [290], pileTipLevels: [-17.5] },
    });

    assert.deepEqual(next.selectedLoadPointIds, []);
    assert.equal(next.selectedLoadPointId, null);
    assert.equal(next.selectedCptId, null);
    assert.equal(next.rightPanelMode, "cpts");
    assert.deepEqual(next.legendSelectionFilter, { pileSizes: [], pileTipLevels: [] });
  });

  it("opens a CPT and clears legend selection", () => {
    const next = openReactViewerCpt(
      {
        selectedLoadPointId: 1,
        selectedLoadPointIds: [1],
        selectedCptId: null,
        rightPanelMode: "load-point",
        legendSelectionFilter: { pileSizes: [290], pileTipLevels: [-17.5] },
      },
      64,
    );

    assert.equal(next.selectedCptId, 64);
    assert.equal(next.rightPanelMode, "cpts");
    assert.deepEqual(next.legendSelectionFilter, { pileSizes: [], pileTipLevels: [] });
  });

  it("clears legend selection when clicking beside legend items", () => {
    const legendItemTarget = {
      closest: (selector: string) => selector === ".legend-item" ? {} : null,
    } as Element;
    const legendBackgroundTarget = {
      closest: () => null,
    } as unknown as Element;

    assert.equal(shouldClearLegendSelectionFromPointerTarget(legendItemTarget), false);
    assert.equal(shouldClearLegendSelectionFromPointerTarget(legendBackgroundTarget), true);
  });

  it("shows the union of CPTs for selected load points plus the open CPT", () => {
    const selectedIds = getReactViewerSelectedCptIds({
      selectedCptId: 63,
      selectedLoadPointIds: [1, 2],
      selectedCptsByLoadPointId: new Map([
        [1, [{ cpt: { id: 61, name: "CPT 61", x_mm: 0, y_mm: 0 }, distance_mm: 1, label: "upper left" }]],
        [2, [
          { cpt: { id: 61, name: "CPT 61", x_mm: 0, y_mm: 0 }, distance_mm: 2, label: "lower left" },
          { cpt: { id: 62, name: "CPT 62", x_mm: 0, y_mm: 0 }, distance_mm: 3, label: "upper right" },
        ]],
      ]),
    });

    assert.deepEqual(selectedIds, [61, 62, 63]);
  });

  it("shows the manual CPT draft while editing a load point", () => {
    const selectedIds = getReactViewerSelectedCptIds({
      cptSelectionEditDraft: { loadPointId: 1, cptIds: new Set([62, 64]) },
      selectedCptId: null,
      selectedLoadPointIds: [1],
      selectedCptsByLoadPointId: new Map([
        [1, [{ cpt: { id: 61, name: "CPT 61", x_mm: 0, y_mm: 0 }, distance_mm: 1, label: "upper left" }]],
      ]),
    });

    assert.deepEqual(selectedIds, [62, 64]);
  });

  it("raises every CPT above ordinary load points while manual selection is active", () => {
    assert.equal(shouldRaiseCptMarker(false, false), false);
    assert.equal(shouldRaiseCptMarker(true, false), true);
    assert.equal(shouldRaiseCptMarker(false, true), true);
  });
});
