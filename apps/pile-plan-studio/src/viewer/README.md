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

## Coordinate-grid rasterization

The grid is a repeating CSS background rather than an SVG path. Its world
spacing and origin are calculated independently of the visible canvas size, so
panel resizing cannot select another grid interval. The final background origin
is aligned once to the global device-pixel lattice using the canvas screen
position, root CSS zoom, and `devicePixelRatio`.

Do not round the local background position or derive it from percentages. Do
not use SVG `shape-rendering: crispEdges` for this grid: browsers may adjust both
the path position and stroke width during rasterization, which caused line
thickness to alternate between physical pixels after layout changes. Preserve
subpixel world geometry until the final global device-pixel alignment step.

### Known residual rasterization issue

Stable computed CSS positions do not guarantee identical painted pixels. With
the compact `0.8` application zoom and a non-integer device-pixel ratio, the
gradient line width and repeated spacing can occupy fractional physical pixels.
Chromium may rasterize that repeating background slightly differently when its
element changes size. This can cause a small visible grid shift or thickness
change even though the measured world projection, background position, and
marker positions are unchanged.

DOM geometry tests cannot prove this visual issue fixed. A future robust fix
should use a device-pixel-aware canvas and snap every projected grid line
independently in global screen space. Verification must compare physical-pixel
screenshots before and after splitter movement, not only computed DOM styles.

### Known initial marker rasterization issue

Directly after a reload, a small subset of markers can shift by a few painted
pixels while a side-panel splitter moves, even though their measured DOM centres
remain unchanged. Which markers exhibit it may vary per reload. After the first
viewer zoom, Chromium keeps the non-identity transformed marker stage in a
different compositing mode and the movement stops.

Forcing `.viewer-content` into a permanent compositing layer with
`will-change: transform` removes the initial movement, but makes vector markers
blurry when zoomed because Chromium enlarges the cached layer bitmap. That
workaround is deliberately not used. Keep vector sharpness and treat the small
pre-zoom movement as a known rendering limitation until it can be verified with
physical-pixel screenshot tests.

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
| Grid lines change thickness after panel resize | Known CSS-gradient rasterization limitation under fractional application zoom and device-pixel ratio |
| A few markers shift during panel drag only before the first zoom | Known Chromium compositing change at the initial identity transform; do not force permanent `will-change` because it blurs zoomed vectors |

For a regression check, zoom into a recognizable load point and CPT, drag both
splitters slowly across a legend wrap, and hide/show both side panels. The same
project coordinate must remain fixed on screen. CPT numbers, selection rings,
and connection lines must remain aligned. Repeat in browser and Tauri at the
same nominal application scale.
