import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInitialProjectState } from "../../domain/projectState.ts";

describe("PilePlanViewer inputs", () => {
  it("renders viewer, hover, and normal legend styles from the project legend", () => {
    const viewer = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const legend = readFileSync(resolve(import.meta.dirname, "Legend.tsx"), "utf8");

    assert.match(viewer, /const legend = state\.pileLegend/);
    assert.match(viewer, /renderPileSymbol\(style\.symbol, style\.color\)/);
    assert.match(viewer, /renderPileSymbol\(symbolStyle\.symbol, symbolStyle\.color\)/);
    assert.doesNotMatch(viewer, /getLegendItems/);
    assert.match(legend, /const legend = state\.pileLegend/);
    assert.match(legend, /buildLegendPresentation\(\{\s*legend,/);
    assert.doesNotMatch(legend, /getLegendItems/);
  });

  it("dims and excludes locked load points outside lock editing", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(source, /getActiveLockedLoadPointIds/);
    assert.match(source, /is-lock-editing/);
    assert.match(source, /is-locked/);
    assert.match(source, /!lockedLoadPointIds\.has\(loadPoint\.id\)/);
    assert.match(css, /\.load-point-marker\.is-locked/);
  });

  it("routes clicks and lasso to the lock draft while lock editing", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");

    assert.match(source, /toggleLoadPointLock/);
    assert.match(source, /setLassoLoadPointLocks/);
    assert.match(source, /state\.loadPointLockDraft/);
  });
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

  it("shows Shift-click as an explicit shortcut when a selection already exists", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");

    assert.doesNotMatch(source, /title=\{t\("viewer\.selectionHelp"\)\}/);
    assert.match(source, /loadPoint && selectedLoadPointIds\.size > 0/);
    assert.match(source, /viewer-hover-shortcut-combination/);
    assert.match(source, /viewer\.hover\.clickKey/);
    assert.match(source, /viewer-hover-shortcut-plus/);
    assert.match(source, /viewer\.hover\.addToSelection/);
    assert.doesNotMatch(source, /viewer\.hover\.shiftHint/);
  });

  it("keeps full-resolution marker boxes before applying the user scale", () => {
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(css, /--load-point-symbol-base:\s*12px;/);
    assert.match(css, /--cpt-marker-width-base:\s*15px;/);
    assert.match(css, /--cpt-marker-height-base:\s*13px;/);
    assert.doesNotMatch(css, /--load-point-symbol-base:\s*calc\(/);
    assert.match(css, /--cpt-default-fill:\s*#d4dade/);
    assert.match(css, /\.cpt-marker\s*{[\s\S]*?--cpt-fill:\s*var\(--cpt-default-fill\)/);
    assert.match(css, /\.cpt-label\s*{[\s\S]*?dominant-baseline:\s*middle;/);
  });

  it("keeps scaled pile symbols centered on their project coordinates", () => {
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(
      css,
      /\.load-point-marker,\s*\.cpt-marker\s*{[\s\S]*?width:\s*0;[\s\S]*?height:\s*0;[\s\S]*?overflow:\s*visible;[\s\S]*?transform:\s*none;/,
    );
    assert.match(
      css,
      /\.load-point-symbol,\s*\.load-point-empty,\s*\.load-point-pending,\s*\.cpt-triangle\s*{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*0;[\s\S]*?left:\s*0;[\s\S]*?transform:\s*translate\(-50%,\s*-50%\) scale\(var\(--viewer-symbol-scale\)\);/,
    );
    assert.match(
      css,
      /\.load-point-marker\.is-above-range \.load-point-symbol,[\s\S]*?\.viewer-hover-marker\.is-load-point\.is-above-range/,
    );
    assert.doesNotMatch(css, /\.load-point-marker\.is-above-range,\s*\.viewer-hover-marker/);
    assert.match(css, /box-shadow:[\s\S]*?0 0 0 2px/);
    assert.doesNotMatch(css, /box-shadow:[\s\S]*?calc\(2px \* var\(--viewer-symbol-scale\)\)/);
  });

  it("replaces the marker fan with a compact hover inspector", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.doesNotMatch(source, /markerFan|MarkerFan|marker-fan/);
    assert.doesNotMatch(css, /marker-fan/);
    assert.match(source, /viewer-hover-inspector/);
    assert.match(source, /viewer\.hover\.addToSelection/);
    assert.match(css, /\.viewer-hover-inspector\s*{[\s\S]*?right:\s*12px;[\s\S]*?bottom:\s*12px;[\s\S]*?pointer-events:\s*none;/);
  });

  it("raises the current hover candidate and selects it on click", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(source, /is-hover-candidate/);
    assert.match(source, /getActiveHoverCandidateKey/);
    assert.match(css, /\.is-hover-candidate\s*{[\s\S]*?z-index:\s*50;/);
    assert.match(css, /\.viewer-content \.is-hover-candidate\s*{[\s\S]*?z-index:\s*50;/);
  });

  it("does not use viewer marker selection to close surrounding task panels", () => {
    const viewer = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const workspace = readFileSync(resolve(import.meta.dirname, "PilePlanWorkspace.tsx"), "utf8");

    assert.doesNotMatch(viewer, /onMapMarkerSelect/);
    assert.doesNotMatch(workspace, /onMapMarkerSelect/);
  });

  it("cycles overlapping candidates with Space and hides hover while navigating", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    assert.match(source, /event\.code === "Space" && isNonTextEntryTarget\(event\.target\)[\s\S]*?event\.preventDefault\(\);\s*return;/);
    assert.match(source, /event\.code === "Space" && !isTextEntryTarget\(event\.target\)/);
    assert.match(source, /event\.preventDefault\(\);\s*blurActiveNonTextControl\(\);\s*if \(hoverCandidates && hoverCandidates\.keys\.length > 1\)/);
    assert.match(source, /cycleHoverCandidate/);
    assert.match(source, /clearHoverCandidates\(\)/);
    assert.match(source, /const TEXT_ENTRY_SELECTOR = \[/);
    assert.match(source, /input\[type='text'\]/);
    assert.match(source, /const NON_TEXT_ENTRY_SELECTOR = \[/);
    assert.match(source, /input\[type='number'\]/);
    assert.match(source, /"select"/);
    assert.doesNotMatch(source, /target\.closest\("input, textarea, select/);
    assert.match(source, /function blurActiveNonTextControl\(\)[\s\S]*?activeElement\.blur\(\)/);
  });

  it("shares one orange selection ring style between previews, load points, and inspected CPTs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(source, /state\.selectedCptId === cpt\.id/);
    assert.match(source, /is-inspected-cpt/);
    assert.match(css, /--selection-ring-width:\s*2px;/);
    assert.match(css, /\.load-point-marker\.is-selected::before,[\s\S]*?\.cpt-marker\.is-inspected-cpt::before/);
    assert.match(css, /\.load-point-marker\.is-selected::before,[\s\S]*?transform:\s*translate\(-50%,\s*-50%\) scale\(var\(--viewer-symbol-scale\)\);/);
    assert.match(css, /\.is-hover-candidate::after\s*{[\s\S]*?border:\s*var\(--selection-ring-width\) solid var\(--theme-accent\)/);
    assert.doesNotMatch(css, /\.is-hover-candidate::after\s*{[\s\S]*?box-shadow:\s*0 0 0 2px #fff/);
  });

  it("preserves load-point CPT styling during inspection and marks the governing CPT", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");
    const selectedRule = css.match(
      /\.is-layer-selected-cpt,\s*\.viewer-hover-marker\.is-cpt\.is-selected-cpt,\s*\.cpt-marker\.is-governing-cpt\s*\{(?<body>[^}]*)\}/s,
    )?.groups?.body ?? "";

    assert.match(source, /getReactViewerContextCptIds/);
    assert.match(source, /isInspectedOnly/);
    assert.match(source, /is-governing-cpt/);
    assert.match(css, /\.cpt-marker\.is-inspected-only/);
    assert.match(css, /\.cpt-marker\.is-governing-cpt/);
    assert.match(css, /--cpt-default-fill:\s*#d4dade/);
    assert.match(css, /--cpt-default-stroke:\s*#a2adb3/);
    assert.match(
      selectedRule,
      /--cpt-fill:\s*color-mix\(in srgb,\s*var\(--theme-accent\) 8%,\s*#fff\)/,
    );
    assert.doesNotMatch(selectedRule, /--theme-surface/);
    assert.doesNotMatch(selectedRule, /--theme-accent-soft/);
    assert.match(selectedRule, /--cpt-stroke:\s*var\(--theme-accent\)/);
    assert.doesNotMatch(css, /#fff7c2/);
  });

  it("lets pile-size legend symbols inherit the active theme text color", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Legend.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(source, /outlineColor:\s*"currentColor"/);
    assert.match(source, /neutralFill:\s*"var\(--theme-bg\)"/);
    assert.doesNotMatch(css, /\.legend-symbol \.pile-symbol-svg :is\(circle, rect, polygon\)/);
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

    assert.match(source, /left:\s*`\$\{point\.x\}px`/);
    assert.match(source, /top:\s*`\$\{point\.y\}px`/);
    assert.doesNotMatch(source, /left:\s*`\$\{(?:Math\.round|[^}]*toFixed)/);
    assert.match(source, /<svg className="cpt-triangle"[\s\S]*?<text[\s\S]*?className="cpt-label"[\s\S]*?x="12"[\s\S]*?y="9.5"/);
    assert.doesNotMatch(source, /<span className="cpt-label"/);
    assert.match(css, /\.cpt-label\s*{[\s\S]*?text-anchor:\s*middle;[\s\S]*?dominant-baseline:\s*middle;[\s\S]*?text-rendering:\s*geometricPrecision;/);
    assert.match(css, /\.load-point-marker\.is-selected::before,[\s\S]*?\.cpt-marker\.is-inspected-cpt::before\s*{[\s\S]*?top:\s*0;[\s\S]*?left:\s*0;[\s\S]*?transform:\s*translate\(-50%,\s*-50%\) scale\(var\(--viewer-symbol-scale\)\);/);
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
    assert.match(source, /style=\{getStageStyle\([\s\S]*?projectTransform\.canvasSize,[\s\S]*?\)\}/);
    assert.match(source, /style=\{getProjectMarkerStyle\(point\)\}/);
    assert.doesNotMatch(source, /style=\{getMarkerStyle\(point,\s*canvasSize,\s*renderViewport\)\}/);
    assert.match(css, /--viewer-symbol-scale:\s*1/);
    assert.match(source, /effectiveSymbolScale\(symbolScalePercent\)/);
  });

  it("keeps load-point selection locked while manually editing CPTs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");

    assert.match(source, /isViewerSelectionActionAllowed\(isEditingCptSelection, "background"\)/);
    assert.match(source, /isViewerSelectionActionAllowed\(isEditingCptSelection, "load-point"\)/);
    assert.match(source, /isViewerSelectionActionAllowed\(isEditingCptSelection, "lasso"\)/);
    assert.match(source, /!isEditingCptSelection \|\| key\.startsWith\("cpt:"\)/);
  });

  it("renders pointer-inert CPT connection lines inside the transformed stage before map markers", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");
    const stageIndex = source.indexOf('className={`viewer-content');
    const cptIndex = source.indexOf("{state.cpts.map", stageIndex);
    const stageContent = source.slice(stageIndex, cptIndex);

    assert.match(source, /getCptConnectionSegments/);
    assert.match(stageContent, /<svg className="cpt-connection-lines"[\s\S]*?<line/);
    assert.match(css, /\.cpt-connection-lines\s*\{[\s\S]*?pointer-events:\s*none;/);
    assert.match(css, /\.viewer-content\s*\{[\s\S]*?--viewer-cpt-connection-line:\s*#8f999e/);
    assert.match(css, /\.cpt-connection-line\s*\{[\s\S]*?stroke:\s*var\(--viewer-cpt-connection-line\)/);
    assert.doesNotMatch(css, /\.cpt-connection-line\s*\{[\s\S]*?stroke:\s*var\(--theme-text\)/);
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

  it("renders compact optimizer outcomes at the load-point anchor at every zoom level", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");

    assert.match(source, /OptimizerUnresolvedMarker/);
    assert.doesNotMatch(source, /state\.viewport\.scale >= 1\.8/);
    assert.doesNotMatch(source, /<OptimizerUnresolvedMarker[^>]*detailed=/);
    assert.match(source, /optimizationUnassignedByLoadPoint/);
    assert.match(source, /unselectedState === "optimizer-unassigned"/);
  });

  it("anchors the stage at the same top-left origin used by lasso projection", () => {
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(css, /\.viewer-content\s*{[\s\S]*?transform-origin:\s*0 0;/);
  });

  it("shares one responsive equal-axis transform across all viewer geometry", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");

    assert.match(source, /createProjectViewTransform/);
    assert.match(source, /const \[projectTransform, setProjectTransform\]/);
    assert.match(source, /const projectTransformRef = useRef/);
    assert.match(source, /useLayoutEffect\(\(\) => \{[\s\S]*?new ResizeObserver/);
    assert.match(source, /getCoordinateGridPattern\((?:projectTransform|transform),/);
    assert.match(source, /getCptConnectionSegments\(\{[\s\S]*?transform: projectTransform/);
    assert.match(source, /projectPoint\(cpt, projectTransform\)/);
    assert.match(source, /projectPoint\(loadPoint, projectTransform\)/);
  });

  it("keeps one project transform and compensates layout movement without rerendering markers", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.doesNotMatch(source, /import \{ flushSync \} from "react-dom"/);
    assert.doesNotMatch(source, /resizeProjectViewTransform/);
    assert.match(source, /getCanvasLayoutCompensation/);
    assert.match(source, /className="viewer-layout-anchor"/);
    assert.match(source, /const resizeObserver = new ResizeObserver\(updateCanvasRect\)/);
    assert.match(source, /window\.addEventListener\(VIEWER_LAYOUT_CHANGE_EVENT, updateCanvasRect\)/);
    assert.match(source, /useLayoutEffect\(updateCanvasRect\);/);
    assert.match(source, /anchor\.style\.left = `\$\{compensation\.x\}px`/);
    assert.match(source, /anchor\.style\.top = `\$\{compensation\.y\}px`/);
    const anchorCss = css.match(/\.viewer-layout-anchor\s*\{([^}]*)\}/)?.[1] ?? "";
    assert.doesNotMatch(anchorCss, /transform:/);
    assert.match(source, /elementLayoutScale\(document\.documentElement\)/);
    assert.match(
      source,
      /getStageStyle\(\s*state\.viewport,\s*state\.symbolScalePercent,\s*projectTransform\.canvasSize,?\s*\)/,
    );
    assert.match(source, /width: `\$\{canvasSize\.width\}px`/);
    assert.match(source, /height: `\$\{canvasSize\.height\}px`/);
    assert.match(source, /projectPointPixels\(cpt, projectTransform\)/);
    assert.match(source, /projectPointPixels\(loadPoint, projectTransform\)/);
    assert.match(source, /left: `\$\{point\.x\}px`/);
    assert.match(source, /top: `\$\{point\.y\}px`/);
  });

  it("renders a viewport-filling coordinate grid outside the finite project stage", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const gridIndex = source.indexOf('className="viewer-coordinate-grid"');
    const stageIndex = source.indexOf('className={`viewer-content');

    assert.ok(gridIndex >= 0 && gridIndex < stageIndex);
    assert.match(source, /getCoordinateGridPattern/);
    assert.match(source, /alignCoordinateGridPatternToDevicePixels/);
    assert.match(source, /backgroundSize/);
    assert.match(source, /backgroundPosition/);
  });

  it("keeps coordinate-grid geometry under one imperative owner during layout changes", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanViewer.tsx"), "utf8");
    const gridMarkup = source.match(/className="viewer-coordinate-grid"[\s\S]*?\/>/)?.[0] ?? "";
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.doesNotMatch(gridMarkup, /style=/);
    assert.match(source, /<div[\s\S]*?className="viewer-coordinate-grid"/);
    assert.doesNotMatch(source, /className="viewer-coordinate-grid-lines"/);
    assert.match(css, /\.viewer-coordinate-grid\s*\{[\s\S]*?background-image:/);
    assert.doesNotMatch(css, /shape-rendering:\s*crispEdges/);
  });

  it("uses an opaque surface behind sticky table headers", () => {
    const css = readFileSync(resolve(import.meta.dirname, "rightPanel.css"), "utf8");

    assert.match(css, /\.pile-options-table th\s*{[\s\S]*?background:\s*var\(--theme-surface\);/);
    assert.match(css, /\.cpt-table th\s*{[\s\S]*?background:\s*var\(--theme-surface\);/);
  });

  it("highlights the selected pile option with a subtle accent background", () => {
    const css = readFileSync(resolve(import.meta.dirname, "rightPanel.css"), "utf8");
    const hoverRule = css.match(/\.pile-option-row:hover\s*\{(?<body>[^}]*)\}/s)?.groups?.body ?? "";
    const chosenRule = css.match(/\.pile-option-row\.is-chosen\s*\{(?<body>[^}]*)\}/s)?.groups?.body ?? "";

    assert.match(
      hoverRule,
      /background:\s*color-mix\(in srgb,\s*var\(--theme-text\) 6%,\s*var\(--theme-surface\)\)/,
    );
    assert.doesNotMatch(hoverRule, /--theme-bg-lighter/);
    assert.match(chosenRule, /background:\s*var\(--theme-accent-soft\)/);
    assert.match(chosenRule, /box-shadow:\s*inset 3px 0 0 var\(--theme-accent\)/);
  });

  it("keeps the hover candidate section on the themed inspector surface", () => {
    const css = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");
    const candidateRule = css.match(/\.viewer-hover-candidates\s*\{(?<body>[^}]*)\}/s)?.groups?.body ?? "";

    assert.match(candidateRule, /background:\s*var\(--theme-surface\)/);
    assert.doesNotMatch(candidateRule, /--theme-content-bg/);
  });
});
