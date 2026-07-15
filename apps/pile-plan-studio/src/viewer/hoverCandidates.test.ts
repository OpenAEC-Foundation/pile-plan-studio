import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createHoverMarkerIndex,
  cycleHoverCandidate,
  findHoverCandidates,
  getActiveHoverCandidateKey,
  getHoverMarkerCandidatePool,
  resolveHoverClickCandidateKey,
  updateHoverCandidateState,
  type HoverMarker,
} from "./hoverCandidates.ts";

const markers: HoverMarker[] = [
  { key: "load-point:157", point: { x: 50, y: 50 }, visualRadius: 7 },
  { key: "cpt:66", point: { x: 50.5, y: 50 }, visualRadius: 7.5 },
  { key: "load-point:203", point: { x: 80, y: 80 }, visualRadius: 7 },
];

describe("hover candidates", () => {
  it("returns the single marker under the pointer", () => {
    const candidates = findHoverCandidates(markers, {
      pointer: { x: 800, y: 800 },
      canvas: { width: 1000, height: 1000 },
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    });

    assert.deepEqual(candidates.map((candidate) => candidate.key), ["load-point:203"]);
  });

  it("orders overlapping markers by pointer distance", () => {
    const candidates = findHoverCandidates(markers, {
      pointer: { x: 503, y: 500 },
      canvas: { width: 1000, height: 1000 },
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    });

    assert.deepEqual(candidates.map((candidate) => candidate.key), [
      "cpt:66",
      "load-point:157",
    ]);
  });

  it("limits exact distance checks to nearby spatial cells", () => {
    const index = createHoverMarkerIndex(markers, 10);
    const pool = getHoverMarkerCandidatePool(index, {
      pointer: { x: 503, y: 500 },
      canvas: { width: 1000, height: 1000 },
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    });

    assert.deepEqual(pool.map((marker) => marker.key).sort(), ["cpt:66", "load-point:157"]);
  });

  it("keeps the active candidate when only candidate order changes", () => {
    const previous = {
      keys: ["load-point:157", "cpt:66"],
      activeIndex: 1,
    };

    assert.deepEqual(updateHoverCandidateState(previous, ["cpt:66", "load-point:157"]), previous);
  });

  it("resets to the nearest marker when the candidate set changes", () => {
    const next = updateHoverCandidateState(
      { keys: ["load-point:157", "cpt:66"], activeIndex: 1 },
      ["load-point:203"],
    );

    assert.deepEqual(next, { keys: ["load-point:203"], activeIndex: 0 });
  });

  it("cycles one way through candidates with wraparound", () => {
    const initial = { keys: ["load-point:157", "cpt:66"], activeIndex: 0 };
    const second = cycleHoverCandidate(initial);
    const wrapped = cycleHoverCandidate(second);

    assert.equal(getActiveHoverCandidateKey(second), "cpt:66");
    assert.equal(getActiveHoverCandidateKey(wrapped), "load-point:157");
  });

  it("keeps the cycled candidate for the same set but rejects a stale set on click", () => {
    const current = { keys: ["load-point:157", "cpt:66"], activeIndex: 1 };

    assert.equal(
      resolveHoverClickCandidateKey(current, ["cpt:66", "load-point:157"], "load-point:157"),
      "cpt:66",
    );
    assert.equal(
      resolveHoverClickCandidateKey(current, ["load-point:203"], "load-point:157"),
      "load-point:203",
    );
  });
});
