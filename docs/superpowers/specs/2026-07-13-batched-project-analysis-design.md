# Batched Project Analysis Design

## Goal

Ensure every newly opened or imported project starts pile-option analysis, and reduce large-project startup time by replacing hundreds of repeated WASM calls with one batched Rust analysis request.

## Observed Problem

The LIS project contains 636 load points, 180 CPTs, 16,943 imported bearing-capacity rows, and 102 pile configurations.

Measured through the browser-equivalent WASM interface:

- project import: approximately 0.75 seconds;
- pile options: approximately 3.76 seconds;
- 636 separate CPT-selection calls: approximately 0.30 seconds;
- 180 separate FRD-table calls: approximately 6.42 seconds.

The indefinite loading state has a separate lifecycle cause: every newly created project starts with analysis revision `0`, while the React effect depends only on that numeric revision. Replacing one revision-0 project with another therefore does not trigger analysis.

## Analysis Contract

Rust exposes one project-analysis operation returning:

- pile options grouped by load-point ID;
- selected CPTs grouped by load-point ID;
- bearing-capacity rows grouped by CPT ID.

The request contains the current subset of load points to analyse plus the complete CPT, bearing-capacity, settings, and manual-selection data. Full project initialization requests all load points. A local CPT-setting change may continue to request only affected load points.

FRD rows are returned for all CPTs only when requested. Initial project analysis requests them once; later load-point-only recalculations reuse the existing FRD map.

## Rust Implementation

The Rust core builds reusable data once per request:

- unique pile configurations;
- bearing-capacity index keyed by CPT, pile size, and tip level;
- bearing-capacity rows grouped by CPT.

Each load point then reuses the shared configuration list and capacity index. CPT selection and pile-option calculation happen in the same loop, so selected CPTs are not calculated twice.

The result is a serializable `ProjectAnalysisResult`. WASM and Tauri expose the same request and result contract.

## React Lifecycle

React depends on the `analysisRequest` object identity rather than only `analysisRequest.revision`. Creating a new project produces a new request object and always starts analysis, even when its revision is `0`. Ordinary state updates preserve the same request object and do not retrigger analysis.

The effect performs one `calculateProjectAnalysisCore` call. On completion it merges partial load-point maps and replaces the FRD map only when the response contains it. Errors are stored in project state and shown in the right panel instead of leaving an unexplained permanent loading message.

## Compatibility

Existing single-purpose Rust functions remain available for focused interactions and tests, but startup and analysis refreshes use the batched operation. No domain calculation is moved into TypeScript.

## Testing

Tests cover:

- the Rust batched result matches existing pile-option, CPT-selection, and FRD-row behavior;
- shared indices are built once per request through the new API structure;
- full analysis returns all three grouped maps;
- partial analysis returns only requested load points and can omit FRD rows;
- replacing a revision-0 project with another revision-0 project triggers React analysis;
- unrelated state changes do not retrigger analysis;
- analysis failures leave a visible error rather than perpetual loading;
- LIS performance is measured through a non-committed diagnostic benchmark before and after the change.

All Rust, WASM, TypeScript, React, and production-build checks must pass.
