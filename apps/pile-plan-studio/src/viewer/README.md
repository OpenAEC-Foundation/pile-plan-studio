# Viewer Geometry and Scale

The plan viewer separates application presentation, project projection, layout
compensation, and interactive viewport zoom. Mixing these layers causes marker
drift, pointer mismatch, or different behavior in browser and Tauri.

## Scale layers

1. `html.compact-application-baseline` applies the shared compact design
   baseline in browser and desktop. Its CSS zoom is currently `0.8`, presented
   to users as the nominal application scale of 100%.
2. Tauri WebView zoom is only the persisted desktop user factor. A logical
   application scale of 100% maps to WebView factor `1.0`; 50% maps to `0.5`
   and 150% to `1.5`.
3. `ProjectViewTransform` maps project coordinates to the initial plan canvas
   with one uniform X/Y scale.
4. `projectState.viewport` owns plan pan and zoom. Only this zoom is displayed
   in the application status bar.

The browser keeps native browser zoom shortcuts. Desktop keyboard shortcuts
change the Tauri factor. Neither operation changes the stored plan viewport.

## Coordinate pipeline

Project bounds include load points and CPTs. `viewerGeometry.ts` maps them to a
fixed initial canvas using one uniform scale, so geometry is never stretched.
Load points, CPTs, selection rings, CPT labels, connection lines, and the grid
all use that transform and exact pixel positions. Do not round marker positions
or convert them to integer CSS percentages.

Pan and zoom are applied by the single transform on `.viewer-content`. Marker
positions must not be recalculated during each pan or zoom frame. A resize
changes the visible canvas, not the project transform; layout compensation
keeps the same project coordinate at the same screen position while newly
available space appears around it.

Pointer interactions such as clicking, lasso selection, hover candidates, and
cursor-centred zoom use the matching screen-to-local conversion. This includes
the current layout compensation and the root element's CSS zoom.

## Panel and legend resizing

Panel dragging dispatches `VIEWER_LAYOUT_CHANGE_EVENT` synchronously so the
viewer can compensate in the same frame. `ResizeObserver` remains the fallback
for other layout changes, while `useLayoutEffect` handles React-driven panel
visibility changes before paint.

The compensation element `.viewer-layout-anchor` uses absolute `left` and `top`
positions. It must not add another CSS transform. A nested transform below
`.viewer-content` creates a separate compositing layer and can cause visible
subpixel rasterization shifts when the legend wraps, even when calculated
geometry is unchanged.

## Invariants

- Preserve a fixed world-to-view transform during ordinary layout changes.
- Use one X/Y scale so geometry is not stretched.
- Keep marker coordinates as unrounded pixels.
- Apply plan pan and zoom through `.viewer-content` only.
- Apply layout compensation through `.viewer-layout-anchor` `left` and `top`.
- Derive auxiliary geometry from the same transform and compensation.
- Account for root CSS zoom in every pointer-coordinate conversion.
- Let the coordinate grid fill the viewer using real project coordinates.
- Apply stored desktop application scale before mounting the workspace.
- Never multiply Tauri WebView scale by the compact CSS baseline.

## Diagnosing regressions

| Symptom | Likely cause |
| --- | --- |
| Different markers move by different amounts | Rounded percentages or a transform recomputed from the resized canvas |
| All markers move after hiding a panel | Missing or stale layout compensation |
| Markers oscillate while dragging a splitter | Compensation updates only through asynchronous `ResizeObserver` |
| Movement occurs when the legend wraps | A nested CSS transform or changed canvas top offset |
| CPT triangle is stable but its number moves | Label and triangle do not share the same projected centre |
| Browser and desktop pointer positions differ | Root CSS zoom is missing from screen-to-local conversion |
| Desktop symbols are larger at the same logical scale | The compact baseline is being applied twice or included in Tauri zoom |
| Status bar percentages differ while the same plan extent is visible | Plan viewport initialization differs; do not substitute application scale |
| Grid and markers drift apart | They use different transforms, bounds, or compensation |

For a regression check, zoom into a recognizable load point and CPT, drag both
splitters slowly across a legend wrap, and hide/show both side panels. The same
project coordinate must remain fixed on screen. CPT numbers, selection rings,
and connection lines must remain aligned. Repeat in browser and Tauri at the
same nominal application scale.
