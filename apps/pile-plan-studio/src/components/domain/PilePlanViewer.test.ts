import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInitialProjectState } from "../../domain/projectState.ts";

describe("PilePlanViewer inputs", () => {
  it("has load points, CPTs, and bounds available for rendering", () => {
    const sampleProjectText = readFileSync(
      resolve(import.meta.dirname, "../../../../../sample_project/sample_project.ifcpp"),
      "utf8",
    );
    const state = createInitialProjectState(sampleProjectText, { initializeDefaultPiles: true });

    assert.ok(state.loadPoints.length > 0);
    assert.ok(state.cpts.length > 0);
    assert.ok(state.bounds.maxX > state.bounds.minX);
    assert.ok(state.bounds.maxY > state.bounds.minY);
  });

  it("removes the legacy Shift tooltip and only shows the inline hint for an existing selection", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");

    assert.doesNotMatch(source, /title=\{t\("viewer\.selectionHelp"\)\}/);
    assert.match(source, /loadPoint && selectedLoadPointIds\.size > 0/);
  });

  it("keeps marker base sizes close to the legacy viewer", () => {
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(css, /--load-point-symbol-base:\s*12px/);
    assert.match(css, /--cpt-marker-width-base:\s*15px/);
    assert.match(css, /--cpt-marker-height-base:\s*13px/);
    assert.match(css, /--cpt-fill:\s*#d4dade/);
    assert.match(css, /\.cpt-label\s*{[\s\S]*?top:\s*43%;/);
  });

  it("replaces the marker fan with a compact hover inspector", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.doesNotMatch(source, /markerFan|MarkerFan|marker-fan/);
    assert.doesNotMatch(css, /marker-fan/);
    assert.match(source, /viewer-hover-inspector/);
    assert.match(source, /viewer\.hover\.shiftHint/);
    assert.match(css, /\.viewer-hover-inspector\s*{[\s\S]*?right:\s*12px;[\s\S]*?bottom:\s*12px;[\s\S]*?pointer-events:\s*none;/);
  });

  it("raises the current hover candidate and selects it on click", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(source, /is-hover-candidate/);
    assert.match(source, /getActiveHoverCandidateKey/);
    assert.match(css, /\.is-hover-candidate\s*{[\s\S]*?z-index:\s*50;/);
  });

  it("cycles overlapping candidates with Space and hides hover while navigating", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    assert.match(source, /event\.code === "Space" && hoverCandidates && !isTextEntryTarget\(event\.target\)/);
    assert.match(source, /event\.preventDefault\(\);\s*if \(hoverCandidates\.keys\.length > 1\)/);
    assert.match(source, /cycleHoverCandidate/);
    assert.match(source, /clearHoverCandidates\(\)/);
  });

  it("shares one orange selection ring style between previews, load points, and inspected CPTs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(source, /state\.selectedCptId === cpt\.id/);
    assert.match(source, /is-inspected-cpt/);
    assert.match(css, /--selection-ring-width:\s*2px/);
    assert.match(css, /\.load-point-marker\.is-selected::before,[\s\S]*?\.cpt-marker\.is-inspected-cpt::before/);
    assert.match(css, /\.is-hover-candidate::after\s*{[\s\S]*?border:\s*var\(--selection-ring-width\) solid var\(--theme-accent\)/);
    assert.doesNotMatch(css, /\.is-hover-candidate::after\s*{[\s\S]*?box-shadow:\s*0 0 0 2px #fff/);
  });

  it("preserves load-point CPT styling during inspection and marks the governing CPT", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(source, /getReactViewerContextCptIds/);
    assert.match(source, /isInspectedOnly/);
    assert.match(source, /is-governing-cpt/);
    assert.match(css, /\.cpt-marker\.is-inspected-only/);
    assert.match(css, /\.cpt-marker\.is-governing-cpt/);
  });

  it("does not scan all markers while the pointer moves over empty map space", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");

    assert.match(source, /event\.target as HTMLElement/);
    assert.match(source, /closest\("\[data-map-marker-key\]"\)/);
    assert.match(source, /if \(!markerTarget\) \{\s*clearHoverCandidates\(\);\s*return;/);
    assert.match(source, /createHoverMarkerIndex/);
    assert.match(source, /canvasRectRef/);
  });

  it("resolves the current pointer candidate synchronously before clicking", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");

    assert.match(source, /resolveHoverClickCandidateKey/);
    assert.match(source, /getClickCandidateKey\(event,/);
  });

  it("uses unrounded centering for CPT labels and selection rings", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(source, /left:\s*`\$\{point\.x\}%`/);
    assert.match(source, /top:\s*`\$\{point\.y\}%`/);
    assert.doesNotMatch(source, /left:\s*`\$\{(?:Math\.round|[^}]*toFixed)/);
    assert.match(css, /\.cpt-label\s*{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*43%;[\s\S]*?left:\s*50%;[\s\S]*?transform:\s*translate\(-50%,\s*-50%\);/);
    assert.match(css, /\.load-point-marker\.is-selected::before,[\s\S]*?\.cpt-marker\.is-inspected-cpt::before\s*{[\s\S]*?top:\s*50%;[\s\S]*?left:\s*50%;[\s\S]*?transform:\s*translate\(-50%,\s*-50%\);/);
  });

  it("uses responsive font scaling for CPT numbers", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(source, /getCptLabelStyle\(cptLabel\)/);
    assert.match(css, /\.cpt-label\s*{[\s\S]*?var\(--cpt-label-scale\)/);
  });

  it("does not show focus rectangles on map markers or legend items", () => {
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(css, /\.load-point-marker:focus,\s*\.cpt-marker:focus\s*{\s*outline:\s*none;/);
    assert.match(css, /\.load-point-marker:focus-visible,\s*\.cpt-marker:focus-visible\s*{\s*outline:\s*none;/);
    assert.match(css, /\.legend-item:focus,\s*\.legend-item:focus-visible\s*{\s*outline:\s*none;/);
  });

  it("uses a single transformed stage instead of recalculating marker pixels while panning", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(source, /ref=\{stageRef\}/);
    assert.match(source, /style=\{getStageStyle\(state\.viewport\)\}/);
    assert.match(source, /style=\{getProjectMarkerStyle\(point\)\}/);
    assert.doesNotMatch(source, /style=\{getMarkerStyle\(point,\s*canvasSize,\s*renderViewport\)\}/);
    assert.doesNotMatch(css, /--viewer-marker-scale/);
  });

  it("does not restore a stale React viewport while a wheel zoom is waiting to commit", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");

    assert.match(
      source,
      /if \(!interactionRef\.current && !zoomCommitTimerRef\.current\) \{\s*viewportRef\.current = state\.viewport;\s*applyViewportDisplay\(state\.viewport\);\s*\}/,
    );
  });

  it("applies the calculated selected option status to each load point marker", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");

    assert.match(source, /getLoadPointMarkerInvalidVisual/);
    assert.match(source, /pileOptionsByLoadPointId\.get\(loadPointId\)/);
    assert.match(source, /invalidVisual\.className/);
    assert.match(source, /invalidVisual\.style/);
  });

  it("renders neutral pending markers and colour-coded no-pile crosses", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(source, /getUnselectedLoadPointMarkerState/);
    assert.match(source, /load-point-pending/);
    assert.match(source, /has-missing-options/);
    assert.match(source, /has-invalid-options/);
    assert.match(css, /\.load-point-marker\.is-pending/);
    assert.match(css, /\.load-point-marker\.has-missing-options \.load-point-empty/);
    assert.match(css, /\.load-point-marker\.has-invalid-options \.load-point-empty/);
  });

  it("anchors the stage at the same top-left origin used by lasso projection", () => {
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(css, /\.viewer-content\s*{[\s\S]*?transform-origin:\s*0 0;/);
  });

  it("uses an opaque surface behind sticky table headers", () => {
    const css = readFileSync(resolve(import.meta.dirname, "rightPanel.css"), "utf8");

    assert.match(css, /\.pile-options-table th\s*{[\s\S]*?background:\s*var\(--theme-surface\);/);
    assert.match(css, /\.cpt-table th\s*{[\s\S]*?background:\s*var\(--theme-surface\);/);
  });
});
