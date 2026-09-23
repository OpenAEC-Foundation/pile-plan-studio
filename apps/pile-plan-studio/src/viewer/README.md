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
Load points, CPTs, selection rings, group contours, CPT labels, connection lines,
and the grid all use that transform and exact pixel positions. Do not round
marker positions or convert them to integer CSS percentages.

## Shared SVG drawing surface

`ViewerDrawingSvg` owns one SVG with a viewBox equal to the fixed project canvas
size. Tip-level regions, load-point group contours, CPT connections, status
halos, pile/CPT symbols, labels, and selection/hover rings are children of this
root. Each point-anchored graphic starts with the same unrounded `translate(x y)`;
its local shapes and rings are centred on `(0, 0)`. This avoids independent
CSS-border and nested-SVG rasterization centres. The drawing SVG is pointer-
inert. Transparent HTML buttons at the same projected points keep click,
hover, lasso, keyboard, and accessibility behavior without drawing duplicate
markers. Their centred hit areas may be larger than the graphic but must not
move its visible position.

Marker graphics are sorted by the existing foreground/selected/hover priority;
the HTML hit targets retain CPT-first then load-point tab order. The pile symbol
child markup is shared with legend and table symbols, but clip-path IDs are
unique per map load point because all map symbols now inhabit one SVG. Group
topology and morphological outside-edge extraction are unchanged. Keep static
region/group geometry stable across hover and pan updates; do not add a second
stage transform or device-pixel-specific offsets.

Pan and zoom are applied by the single transform on `.viewer-content`. Marker
positions must not be recalculated during each pan or zoom frame. A whole-window
resize or display-scale change preserves the project coordinate at the viewer
centre. Panel and legend changes instead keep the old screen-position anchor.
Both use transient layout compensation; neither changes the fixed project
transform, stored plan zoom, project history, or dirty state.

Pointer interactions such as clicking, lasso selection, hover candidates, and
cursor-centred zoom use the matching screen-to-local conversion. This includes
the current layout compensation and the root element's CSS zoom.

## Panel and legend resizing

Panel dragging dispatches `VIEWER_LAYOUT_CHANGE_EVENT` synchronously so the
viewer can compensate in the same frame. `ResizeObserver` remains the fallback
for other layout changes, while `useLayoutEffect` handles React-driven panel
visibility changes before paint. Whole-window changes are identified by the
window dimensions or device-pixel ratio and coalesced into a single frame so
that event ordering cannot misclassify them as panel changes. A resolution
media query also catches DPR-only display moves.

The compensation element `.viewer-layout-anchor` uses absolute `left` and `top`
positions. It must not add another CSS transform. A nested transform below
`.viewer-content` creates a separate compositing layer and can cause visible
subpixel rasterization shifts when the legend wraps, even when calculated
geometry is unchanged.

## Coordinate-grid rasterization

The grid is a pointer-inert canvas outside the transformed marker stage. Its
world spacing and origin are calculated independently of the visible canvas
size, so panel resizing cannot select another grid interval. Each visible line
is projected separately and snapped to the global physical-pixel lattice using
the canvas screen position, root CSS zoom, and `devicePixelRatio`. The backing
bitmap also starts on that lattice. Fractional viewer borders and dimensions
must be preserved; integer `clientWidth` and `clientLeft` are not precise enough.
Pan, zoom, layout, and DPR changes schedule at most one grid draw per frame.

Do not round world coordinates, use repeated CSS-gradient tiles, or use SVG
`shape-rendering: crispEdges` for this grid. Those approaches can make line
positions or thickness alternate between physical pixels after layout changes.

## Theme boundary

The plan viewer distinguishes application chrome from the engineering drawing.
Panels, controls, and text outside the canvas follow the selected application
theme. The drawing canvas remains white in every theme.

Use theme variables for viewer controls and surfaces that belong to the
application chrome. Use explicit viewer-owned colors for project annotations
that must retain the same meaning and appearance on the drawing canvas.
Load-point group contours are such annotations: their gray, orange-selection,
and red-conflict strokes must remain fixed across light and dark themes and must
not use themed text-color variables. The overlay unions marker-radius circles,
internal Gabriel edges, and faces whose complete boundary belongs to the group.
Its SVG mask/filter extracts only the outside edge, preserving concave and
L-shaped groups instead of replacing them with a convex hull. Keep this layer
below load-point markers and above tip-level-region fills.

### Physical-pixel verification boundary

The shared SVG makes the symbol, ring, halo, and region node use one coordinate
system. A DPR 1 browser check found equal X/Y SVG screen scales and less than
0.1 CSS pixel between a CPT ring's DOM centre and its transparent hit target.
This does not prove identical painted centroids on every display. Repeat the
physical-pixel screenshot check at DPR 1.25, 1.5, and 2 on actual displays
before removing display-specific rasterization from the regression checklist.
Do not use permanent `will-change: transform`: it can cache the vector layer as
a blurry bitmap at high plan zoom.

## Invariants

- Preserve a fixed world-to-view transform during ordinary layout changes.
- Use one X/Y scale so geometry is not stretched.
- Keep marker coordinates as unrounded pixels.
- Apply plan pan and zoom through `.viewer-content` only.
- Apply layout compensation through `.viewer-layout-anchor` `left` and `top`.
- Derive auxiliary geometry from the same transform and compensation.
- Account for root CSS zoom in every pointer-coordinate conversion.
- Let the coordinate grid fill the viewer using real project coordinates.
- Keep theme-independent project annotations visually identical across light
  and dark application themes.
- Reuse the core-produced Gabriel topology for group contours; do not calculate
  a second topology in the viewer.
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
| Grid lines change thickness after panel resize | A line was not snapped independently to the global device-pixel lattice, or the canvas bitmap origin is not aligned |
| A symbol and its ring paint apart while their DOM centres agree | Compare physical-pixel screenshots and check for a graphic rendered outside the shared SVG; do not compensate with a DPR-specific nudge |

For a regression check, zoom into a recognizable load point and CPT, drag both
splitters slowly across a legend wrap, and hide/show both side panels. The same
project coordinate must remain fixed on screen. CPT numbers, selection rings,
and connection lines must remain aligned. Repeat in browser and Tauri at the
same nominal application scale. Then resize the whole window and move it between
displays with different scale: the centre project point and plan zoom should
remain unchanged. Compare physical-pixel screenshots of grid lines at DPR 1,
1.25, 1.5, and 2 where available; also check pan, zoom, grid toggling, and
fractional canvas edges for blank strips.
