# Architecture

Pile Plan Studio follows the OpenAEC application model:

- Rust contains the domain core: CPT selection, bearing-capacity checks, pile
  option calculation, cost calculation, and project data operations.
- Tauri exposes the Rust core to the desktop application through native
  commands.
- TypeScript is kept as the viewer layer: UI state, map interaction, rendering,
  formatting, symbols, and browser-specific presentation behavior.
- The frontend calls the Rust core through `@tauri-apps/api/core` commands when
  it runs inside Tauri.
- The browser build uses `crates/pile-plan-wasm`, a thin WebAssembly wrapper
  around the same Rust core. This keeps the Vite preview aligned with the
  desktop calculation model.

The guiding rule is that engineering decisions must be implemented and tested in
`crates/pile-plan-core` first. Frontend code may present results, but should not
be the source of truth for calculations.

## Runtime Matrix

| Runtime | Core route | Best use |
| --- | --- | --- |
| Browser / Vite | Rust core compiled to WASM | Fast UI checks and web behavior |
| Desktop / Tauri | Native Rust commands | Final desktop behavior, file access, native integration |

Use the browser preview for most visual and interaction work. Use the desktop app
when testing anything that depends on Tauri, local file access, window behavior,
or native integrations.

## Viewer Coordinates and Resize Stability

The plan viewer deliberately separates project coordinates, viewport layout,
and interactive pan/zoom. Keeping these layers separate prevents markers from
moving when the explorer, properties panel, or legend changes size.

### Coordinate pipeline

1. Project bounds include both load points and CPTs.
2. A `ProjectViewTransform` maps project coordinates to a fixed initial canvas
   using one uniform scale for the X and Y axes.
3. Load points, CPTs, selection rings, CPT labels, connection lines, and the
   grid all use that same transform and exact pixel positions. Do not round
   positions or convert them to integer CSS percentages.
4. User pan and zoom are applied by the single transform on `.viewer-content`.
   Marker positions must not be recalculated during every pan or zoom frame.
5. A resize changes the visible canvas, not the project transform. Layout
   compensation keeps the same project coordinate at the same screen position
   while newly available space appears around it.

`viewerGeometry.ts` owns the coordinate conversions. Pointer interactions such
as clicking, lasso selection, hover candidates, and cursor-centred zoom must use
the matching screen-to-local conversion, including the current layout
compensation and the root element's CSS zoom.

### Panel and legend resizing

Panel dragging dispatches `VIEWER_LAYOUT_CHANGE_EVENT` synchronously so the
viewer can compensate in the same frame. `ResizeObserver` remains the fallback
for other layout changes, while `useLayoutEffect` handles React-driven panel
visibility changes before paint.

The compensation element `.viewer-layout-anchor` is positioned with absolute
`left` and `top` values. It must not introduce another CSS `transform`. A nested
transform below `.viewer-content` creates a separate compositing layer and can
cause visible subpixel rasterization shifts when the legend wraps to a different
height, even when the calculated geometry is unchanged.

### Invariants

- Preserve a fixed world-to-view transform during ordinary layout changes.
- Use one X/Y scale so geometry is not stretched.
- Keep marker coordinates as unrounded pixels.
- Apply pan and zoom through `.viewer-content` only.
- Apply layout compensation through `.viewer-layout-anchor` `left` and `top`.
- Derive all auxiliary geometry from the same transform and compensation.
- Account for application CSS zoom in every pointer-coordinate conversion.
- Let the coordinate grid fill the viewer and derive its spacing from real
  project coordinates.

### Diagnosing regressions

| Symptom | Likely cause |
| --- | --- |
| Different markers move by different amounts | Rounded percentages or a project transform recomputed from the new canvas size |
| All markers move together after hiding a panel | Missing or stale layout compensation |
| Markers oscillate while dragging a splitter | Compensation updates only through the asynchronous `ResizeObserver` |
| Movement occurs exactly when the legend wraps | A nested CSS transform or a changed canvas top offset |
| CPT triangle is stable but its number moves | Label and triangle do not share the same projected centre |
| Browser and desktop pointer positions differ | Root CSS zoom is missing from screen-to-local conversion |
| Grid and markers drift apart | They use different transforms, bounds, or compensation |

For a regression check, zoom into a recognizable load point and CPT, then drag
both splitters slowly across a legend wrap and hide/show both side panels. The
same project coordinate must remain fixed on screen, CPT numbers must remain
centred, and selection rings and connection lines must stay aligned. Repeat the
check in the browser's compact UI zoom and in Tauri.
