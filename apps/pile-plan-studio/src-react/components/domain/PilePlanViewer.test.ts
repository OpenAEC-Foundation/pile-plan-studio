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
    const state = createInitialProjectState(sampleProjectText);

    assert.ok(state.loadPoints.length > 0);
    assert.ok(state.cpts.length > 0);
    assert.ok(state.bounds.maxX > state.bounds.minX);
    assert.ok(state.bounds.maxY > state.bounds.minY);
  });

  it("keeps marker base sizes close to the legacy viewer", () => {
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(css, /--load-point-symbol-base:\s*12px/);
    assert.match(css, /--cpt-marker-width-base:\s*15px/);
    assert.match(css, /--cpt-marker-height-base:\s*13px/);
    assert.match(css, /--cpt-fill:\s*#d4dade/);
    assert.match(css, /--cpt-label-offset-y:\s*-2\.25px/);
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
