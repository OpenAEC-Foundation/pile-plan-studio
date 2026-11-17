import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../../core/projectTestSupport.ts";
import type { TensionDemand } from "../../../core/projectTypes.ts";
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
    loadDirection: "compression" as const,
    technicalAssignment: { status: "idle" as const, assessment: null, issuesByLoadPointId: new Map(), error: null },
    projectTransform: createProjectViewTransform(state.bounds, { width: 1000, height: 600 }),
    pileOptionsByLoadPointId: state.pileOptionsByLoadPointId,
    selectedLoadPointIds: new Set([firstId]),
    selectionContextLoadPointIds: new Set<number>(),
    completeSelectedGroupLoadPointIds: new Set([firstId]),
    relatedLoadPointIds: new Set<number>(),
    lockedLoadPointIds: new Set<number>(),
    contextSelectedCptIds: new Set<number>(),
    governingCptId: null,
    isEditingCptSelection: false,
    activeHoverCandidateKey: null,
    translate: (key: string) => key,
  };
}

describe("viewer marker presentation", () => {
  it("dims points without a positive demand in the shown direction and retains their hit targets", () => {
    const input = sampleInput();
    const demands: (TensionDemand | undefined)[] = [
      { state: "known", value_kn: 0 },
      { state: "known", value_kn: 30 },
      { state: "known", value_kn: 30 },
      { state: "missing" },
      undefined,
    ];
    const loadPoints = input.state.loadPoints.slice(0, 5).map((point, index) => ({
      ...point,
      design_load_kn: index === 1 ? 0 : 100,
      tension: demands[index],
    }));
    input.state = { ...input.state, loadPoints };
    const compression = buildViewerMarkerPresentation(input);
    const tension = buildViewerMarkerPresentation({ ...input, loadDirection: "tension" });
    const highlighted = (result: typeof compression) => loadPoints.map(point =>
      result.graphics.find(marker => marker.key === `load-point:${point.id}`)?.demandOpacity === 1);
    assert.deepEqual(highlighted(compression), [true, false, true, true, true]);
    assert.deepEqual(highlighted(tension), [false, true, true, false, false]);
    assert.deepEqual(tension.hitTargets, compression.hitTargets);
  });

  it("marks the retained context in gray without changing active targets, symbols or coordinates", () => {
    const input = sampleInput();
    input.completeSelectedGroupLoadPointIds.clear();
    const [first, second, third] = input.state.loadPoints;
    input.selectionContextLoadPointIds = new Set([first.id, second.id]);
    const before = buildViewerMarkerPresentation({ ...input, selectionContextLoadPointIds: new Set() });
    const result = buildViewerMarkerPresentation(input);
    const point = (id: number) => result.graphics.find(entry => entry.kind === "load-point" && entry.id === id)!;
    assert.deepEqual(point(first.id).ring, { color: "selection", radius: 7.75 });
    assert.deepEqual(point(second.id).ring, { color: "context", radius: 7.75 });
    assert.equal(point(third.id).ring, null);
    const target = result.hitTargets.find(entry => entry.key === `load-point:${second.id}`)!;
    assert.ok(target.className.includes("is-selection-context"));
    assert.ok(!target.className.includes(" is-selected"));
    const original = before.graphics.find(entry => entry.key === `load-point:${second.id}`)!;
    assert.deepEqual(point(second.id).appearance, original.appearance);
    assert.deepEqual({ x: point(second.id).x, y: point(second.id).y }, { x: original.x, y: original.y });
    assert.deepEqual([...input.selectedLoadPointIds], [first.id]);
    input.activeHoverCandidateKey = `load-point:${second.id}`;
    assert.deepEqual(buildViewerMarkerPresentation(input).graphics.find(entry => entry.key === target.key)!.ring,
      { color: "selection", radius: 7.75 });
    input.activeHoverCandidateKey = null;
    input.selectedLoadPointIds = new Set([second.id]);
    const stepped = buildViewerMarkerPresentation(input);
    assert.equal(stepped.graphics.find(entry => entry.id === first.id && entry.kind === "load-point")!.ring?.color, "context");
    assert.equal(stepped.graphics.find(entry => entry.id === second.id && entry.kind === "load-point")!.ring?.color, "selection");
    input.selectedLoadPointIds = new Set([first.id, second.id]);
    assert.ok(buildViewerMarkerPresentation(input).graphics.every(entry => entry.ring?.color !== "context"));
  });

  it("marks the CPT editor's focused member while retaining the group selection", () => {
    const input = sampleInput();
    const id = input.state.loadPoints[0]!.id;
    input.state = { ...input.state, cptSelectionEditLoadPointId: id,
      cptSelectionEditDraft: { loadPointIds: [id], cptIdsByLoadPoint: new Map(), initialCptIdsByLoadPoint: new Map(), automaticLoadPointIds: new Set() } };
    const result = buildViewerMarkerPresentation(input);
    assert.deepEqual(result.graphics.find(entry => entry.key === `load-point:${id}`)?.ring, { color: "selection", radius: 7.75 });
    assert.ok(result.hitTargets.find(entry => entry.key === `load-point:${id}`)?.className.includes("is-cpt-edit-focus"));
    assert.deepEqual([...input.selectedLoadPointIds], [id]);
  });

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

  it("marks locked points without changing directional emphasis or their status", () => {
    const input = sampleInput();
    const id = input.state.loadPoints[0]!.id;
    const before = buildViewerMarkerPresentation(input);
    input.lockedLoadPointIds.add(id);
    const after = buildViewerMarkerPresentation(input);
    const key = `load-point:${id}`;
    assert.deepEqual(after.graphics.find(entry => entry.key === key), {
      ...before.graphics.find(entry => entry.key === key),
      locked: true,
    });
    const target = after.hitTargets.find(entry => entry.key === key)!;
    assert.match(target.ariaLabel, /\. viewer\.locked/);
    assert.match(target.className, /\bis-locked\b/);
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

  it("preserves missing-data and utilization halo appearance", () => {
    assert.deepEqual(parseLoadPointStatusHalo(" is-missing", ""), {
      kind: "missing", intensity: 0,
    });
    assert.deepEqual(parseLoadPointStatusHalo(" is-above-range", "--utilization-intensity: 0.5;"), {
      kind: "above", intensity: 0.5,
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
