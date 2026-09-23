import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../../domain/project/projectState.ts";
import { createProjectViewTransform } from "../../../viewer/viewerGeometry.ts";
import { buildViewerMarkerPresentation, getLoadPointRing, parseLoadPointStatusHalo, sortMarkerGraphics } from "./viewerMarkerPresentation.ts";

function sampleInput() {
  const projectText = readFileSync(resolve(import.meta.dirname, "../../../../../../sample_project/sample_project.ifcpp"), "utf8");
  const project = canonicalProjectForTest(projectText);
  const state = createInitialProjectState(project, { initializeDefaultPiles: true }, projectTipLevelKeysForTest(project));
  const firstId = state.loadPoints[0]!.id;
  return {
    state,
    technicalAssignment: { status: "idle" as const, assessment: null, issuesByLoadPointId: new Map(), error: null },
    projectTransform: createProjectViewTransform(state.bounds, { width: 1000, height: 600 }),
    pileOptionsByLoadPointId: state.pileOptionsByLoadPointId,
    selectedLoadPointIds: new Set([firstId]),
    completeSelectedGroupLoadPointIds: new Set([firstId]),
    relatedLoadPointIds: new Set<number>(),
    lockedLoadPointIds: new Set<number>(),
    contextSelectedCptIds: new Set<number>(),
    governingCptId: null,
    isEditingLoadPointLocks: false,
    isEditingCptSelection: false,
    activeHoverCandidateKey: null,
    translate: (key: string) => key,
  };
}

describe("viewer marker presentation", () => {
  it("uses one shared projected point for selected group graphics and their hit target", () => {
    const input = sampleInput();
    const id = input.state.loadPoints[0]!.id;
    const result = buildViewerMarkerPresentation(input);
    const graphic = result.graphics.find((entry) => entry.key === `load-point:${id}`)!;
    const target = result.hitTargets.find((entry) => entry.key === `load-point:${id}`)!;
    assert.deepEqual({ x: graphic.x, y: graphic.y }, { x: target.x, y: target.y });
    assert.equal(graphic.ring, null);
    assert.equal(target.hitDiameter, 10.5);
  });

  it("gives a standalone selected load point one ring and preserves CPT-first tab order", () => {
    const input = sampleInput();
    input.completeSelectedGroupLoadPointIds.clear();
    const result = buildViewerMarkerPresentation(input);
    const id = input.state.loadPoints[0]!.id;
    assert.deepEqual(result.graphics.find((entry) => entry.key === `load-point:${id}`)?.ring,
      { color: "selection", radius: 7.75 });
    assert.equal(result.hitTargets[0]?.kind, "cpt");
    assert.equal(result.hitTargets.at(-1)?.kind, "load-point");
  });

  it("dims a locked symbol to 45 percent while locks are being edited", () => {
    const input = sampleInput();
    const id = input.state.loadPoints[0]!.id;
    input.lockedLoadPointIds.add(id);
    input.isEditingLoadPointLocks = true;
    assert.equal(buildViewerMarkerPresentation(input).graphics.find((entry) => entry.key === `load-point:${id}`)?.opacity, 0.45);
    input.isEditingLoadPointLocks = false;
    assert.equal(buildViewerMarkerPresentation(input).graphics.find((entry) => entry.key === `load-point:${id}`)?.opacity, 0.28);
  });
  it("uses the group contour instead of an individual ring for a selected group member", () => {
    assert.equal(getLoadPointRing(true, true, false, 100), null);
    assert.deepEqual(getLoadPointRing(true, false, false, 100), { color: "selection", radius: 7.75 });
  });

  it("shows an individual hover ring on a member of a selected group", () => {
    assert.deepEqual(getLoadPointRing(true, true, true, 100), { color: "selection", radius: 7.75 });
  });

  it("uses the same outer radius for hover and selection", () => {
    assert.deepEqual(getLoadPointRing(false, false, true, 100), { color: "selection", radius: 7.75 });
  });

  it("lets the gray group contour provide context without separate rings on other members", () => {
    const input = sampleInput();
    const relatedId = input.state.loadPoints[1]!.id;
    input.completeSelectedGroupLoadPointIds.clear();
    input.relatedLoadPointIds.add(relatedId);
    assert.equal(buildViewerMarkerPresentation(input).graphics.find((entry) => entry.key === `load-point:${relatedId}`)?.ring, null);
    input.activeHoverCandidateKey = `load-point:${relatedId}`;
    assert.deepEqual(buildViewerMarkerPresentation(input).graphics.find((entry) => entry.key === `load-point:${relatedId}`)?.ring,
      { color: "selection", radius: 7.75 });
  });

  it("preserves missing-data and locked halo appearance", () => {
    assert.deepEqual(parseLoadPointStatusHalo(" is-missing", "", true, false), {
      kind: "missing", intensity: 0, opacity: 0.28,
    });
    assert.deepEqual(parseLoadPointStatusHalo(" is-above-range", "--utilization-intensity: 0.5;", true, true), {
      kind: "above", intensity: 0.5, opacity: 0.45,
    });
  });

  it("sorts equal-priority markers predictably by kind and ID", () => {
    assert.deepEqual(sortMarkerGraphics([
      { key: "load-point:3", kind: "load-point", id: 3, drawPriority: 20 },
      { key: "cpt:2", kind: "cpt", id: 2, drawPriority: 20 },
      { key: "cpt:1", kind: "cpt", id: 1, drawPriority: 20 },
    ]).map(({ key }) => key), ["cpt:1", "cpt:2", "load-point:3"]);
  });
});
