import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Cpt, ProjectBounds, SelectedCpt } from "../core/projectTypes.ts";
import { getCptConnectionSegments } from "./cptConnectionLines.ts";

const bounds: ProjectBounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
const cpts: Cpt[] = [
  { id: 1, name: "CPT 1", x_mm: 0, y_mm: 0 },
  { id: 2, name: "CPT 2", x_mm: 100, y_mm: 0 },
  { id: 3, name: "CPT 3", x_mm: 100, y_mm: 100 },
  { id: 4, name: "CPT 4", x_mm: 0, y_mm: 100 },
];

function selection(cptId: number): SelectedCpt {
  const cpt = cpts.find((candidate) => candidate.id === cptId)!;
  return { label: cpt.name, cpt, distance_mm: 0 };
}

function getSegments(options: {
  selectedLoadPointIds?: number[];
  analyzed?: Map<number, SelectedCpt[]>;
  draft?: Map<number, Set<number>>;
} = {}) {
  return getCptConnectionSegments({
    bounds,
    cpts,
    selectedLoadPointIds: options.selectedLoadPointIds ?? [101, 102],
    selectedCptsByLoadPointId: options.analyzed ?? new Map([
      [101, [selection(1), selection(2)]],
      [102, [selection(1), selection(2)]],
    ]),
    cptSelectionEditDraft: options.draft
      ? { loadPointIds: options.selectedLoadPointIds ?? [101, 102], cptIdsByLoadPoint: options.draft }
      : null,
  });
}

describe("getCptConnectionSegments", () => {
  it("returns no segments when selected load points have different CPT sets", () => {
    const segments = getSegments({
      analyzed: new Map([
        [101, [selection(1), selection(2)]],
        [102, [selection(1), selection(3)]],
      ]),
    });

    assert.deepEqual(segments, []);
  });

  it("treats matching CPT sets as equal regardless of their selection order", () => {
    const segments = getSegments({
      analyzed: new Map([
        [101, [selection(2), selection(1)]],
        [102, [selection(1), selection(2)]],
      ]),
    });

    assert.equal(segments.length, 1);
    assert.deepEqual(new Set([segments[0]?.from.id, segments[0]?.to.id]), new Set([1, 2]));
  });

  it("does not draw a connection for zero or one shared CPT", () => {
    assert.deepEqual(getSegments({ analyzed: new Map([[101, []], [102, []]]) }), []);
    assert.deepEqual(getSegments({ analyzed: new Map([[101, [selection(1)]], [102, [selection(1)]]]) }), []);
  });

  it("returns one segment for two shared CPTs", () => {
    const segments = getSegments();

    assert.equal(segments.length, 1);
    assert.deepEqual(new Set([segments[0]?.from.id, segments[0]?.to.id]), new Set([1, 2]));
  });

  it("creates a closed radially sorted polygon for three or more shared CPTs", () => {
    const segments = getSegments({
      analyzed: new Map([
        [101, [selection(1), selection(2), selection(3), selection(4)]],
        [102, [selection(4), selection(3), selection(2), selection(1)]],
      ]),
    });

    assert.deepEqual(segments.map(({ from, to }) => [from.id, to.id]), [
      [4, 3],
      [3, 2],
      [2, 1],
      [1, 4],
    ]);
  });

  it("uses captured draft sets instead of analyzed selections while editing", () => {
    const segments = getSegments({
      analyzed: new Map([
        [101, [selection(1), selection(2)]],
        [102, [selection(1), selection(3)]],
      ]),
      draft: new Map([
        [101, new Set([2, 3])],
        [102, new Set([3, 2])],
      ]),
    });

    assert.deepEqual(new Set([segments[0]?.from.id, segments[0]?.to.id]), new Set([2, 3]));
  });

  it("breaks equal radial angles by CPT ID", () => {
    const collinearCpts: Cpt[] = [
      { id: 30, name: "CPT 30", x_mm: 0, y_mm: 50 },
      { id: 10, name: "CPT 10", x_mm: 50, y_mm: 50 },
      { id: 20, name: "CPT 20", x_mm: 100, y_mm: 50 },
    ];
    const segments = getCptConnectionSegments({
      bounds,
      cpts: collinearCpts,
      selectedLoadPointIds: [101, 102],
      selectedCptsByLoadPointId: new Map([
        [101, collinearCpts.map((cpt) => ({ label: cpt.name, cpt, distance_mm: 0 }))],
        [102, collinearCpts.map((cpt) => ({ label: cpt.name, cpt, distance_mm: 0 }))],
      ]),
      cptSelectionEditDraft: null,
    });

    assert.deepEqual(segments.map(({ from, to }) => [from.id, to.id]), [
      [10, 20],
      [20, 30],
      [30, 10],
    ]);
  });
});
