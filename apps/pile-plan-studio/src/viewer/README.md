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

Inspection context uses individual dashed gray rings around the remaining
context members. Context-ring and pile-cap-proposal dash lengths/gaps shrink
proportionally below the normal symbol size; their line weight stays fixed.
Normal/larger symbols keep the existing dash rhythm. Symbols, ring radii, and
proposal spacing do not change. Active and hovered points retain orange rings. Both colors
are viewer-owned and fixed across application themes. The context does not
expand the active edit targets; it shares the overview's transient selection
context and the same projected coordinates and ring radius as active selection.

Driving statuses use fixed-color halos centered on their projected load points.
In this map mode they replace utilization and missing-data halos, including
those on pile cap previews. Selection rings and hit target geometry stay in
their existing layers.

With the driving records panel open, clicks and rectangle selection target
individual load points. Ctrl/Cmd-click toggles a point in the current selection.

The compression and tension views dim pile symbols and status halos when the
displayed direction has no known positive demand. Pile-cap proposals use their
per-pile demand. Selection rings and hit targets stay independent of this
emphasis, so dimmed locations remain selectable.

Locked load points show a compact padlock at the upper-right edge of the pile
symbol. The padlock is scaled and positioned relative to the symbol and drawn
above the marker layer. It remains fully visible when the symbol is dimmed,
and follows the current draft during lock editing.

Pan and zoom are applied by the single transform on `.viewer-content`. Marker
positions must not be recalculated during each pan or zoom frame. A whole-window
resize or display-scale change preserves the project coordinate at the viewer
centre. Panel and legend changes instead keep the old screen-position anchor.
Both use transient layout compensation; neither changes the fixed project
transform, stored plan zoom, project history, or dirty state.

Pointer interactions such as clicking, lasso selection, hover candidates, and
cursor-centred zoom use the matching screen-to-local conversion. This includes
the current layout compensation and the root element's CSS zoom.

Manual CPT editing gives CPTs first priority in both hover and click candidate
queries, independently of the stored foreground-layer preference. Changing that
effective priority clears the transient hover cycle. Outside editing, the
stored foreground preference applies again. Space can still explicitly cycle
through all overlapping candidates, including load points.

Active mouse drags continue through window-level movement and release listeners,
so a lasso or pan can finish outside the canvas, even over controls that stop
bubbling events. In-canvas movement is handled once by the viewer. Lasso release
uses the final pointer position and commits selection or the current lock draft
once. Escape, window blur, a missing pressed button, changing editing modes/plans
or replacing project geometry discard an unfinished gesture. Leaving lock editing
must clear the transient rectangle before any later release can touch that draft.

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
theme. The drawing canvas follows the saved application preference for plan
background: Theme (default), Light or Dark. The Blueprint workspace tokens own
the background, and high-contrast themes enforce their own workspace palette.
This preference is outside project content and does not change drawing geometry.

Neutral CPT fills, outlines and number text use workspace-specific contrast
roles. Numbers use Inter AEC and a thin backing stroke to remain legible against
both the triangle and overlapping geometry. Resolve their contrast from the
workspace, not from application text: an explicit light plan may accompany a
dark interface. Palette changes repaint the canvas grid without committing a
viewport or recalculating the project transform.
Selected CPT outlines use the same fixed orange as selected load-point groups,
not the theme's text-accent role (which is brown in Light and gold in Dark).

Use theme variables for viewer controls and surfaces that belong to the
application chrome. Use explicit viewer-owned colors for project annotations
that must retain the same meaning and appearance on either drawing background.
Load-point group contours are such annotations: their gray, orange-selection,
and red-conflict strokes must remain fixed across light and dark themes and must
not use themed text-color variables. The overlay unions marker-radius circles,
internal Gabriel edges, and faces whose complete boundary belongs to the group.
Its SVG mask/filter extracts only the outside edge, preserving concave and
L-shaped groups instead of replacing them with a convex hull. Keep this layer
below load-point markers and above tip-level-region fills.

The **Group conflicts** preference controls conflict contours and warning
symbols on the drawing.

Filled mode uses the complete Gabriel topology for its outline. The SVG
mask fills each bounded face and includes all edges and load points with a
rounded 1.5 m margin in project coordinates. Assigned locations use their
tip-level area even when capacity is insufficient or assessment data is missing.
Unassigned locations form transparent Gabriel components. They can use smaller
centered reservations in tight gaps, based on the space between locations.
The mesh is reused while the locations requiring compact reservations stay the
same. A transparent component contributes no fill. Components of the same tip
level keep their own connections and share one drawing without internal strokes.

The rectangular mesh follows the project axes fitted to Gabriel edges.
Cuts follow gaps in the projected locations, with additional cuts along
recognized rows, around sites with clearance, and between sites still sharing
a tile. Each Gabriel component reserves paths between its sites. Every
assigned site, including those inside a component with multiple sites, can
reserve a compact footprint using the distance to the nearest site of another
component. The layout fills a component's whole bounding rectangle if no
other component occupies it. It then combines empty tiles into rectangular
blocks and assigns each block along a shared edge, with a preference for
keeping single-location areas compact. Boundary cleanup respects protected
tiles and checks the connections of neighboring areas before transferring space.
If a site lies almost on a grid cut and has nearby neighbors, the existing
compact-grid budget can add space around it. Unassigned sites have first
claim on that budget.
The fill is drawn from the perimeter and holes of each tip level so mesh
edges inside a filled area cannot produce visible seams when rotated.

The ribbon switches between Filled and Connection strips. Connection strips
use circles, Gabriel edges and matching faces. The project's region visibility
flag controls both displays. Filled mode reserves aligned bays based on
repeated rows and columns when each bay
can belong to one Gabriel component. The usual block assignment fills the
remaining space. If the ordinary mesh cannot represent the
component paths, the viewer tries a finer mesh. Connection strips remain
visible when neither mesh can represent the paths within its resolution budget.

Filled mode searches the Gabriel connections for candidate dividers before
assigning leftover tiles. It places smaller components
in compact bays when there is room. A proposed division replaces only its local
area and only if it joins the reference layout, simplifies the visible borders,
keeps the Gabriel connections, and preserves clearance around nearby sites.
Small empty offsets can also align with a continuing edge when their removal
preserves the local connections and clearance.
An edge can be aligned across changing neighbors when a tip level continues
along one side. The neighboring areas retain their own locations and connections.
When both ends of a short offset meet the same line, the boundary can also
continue across a change of tip level on both sides. For a very small enclosed
single-location area, the layout tries to reserve a larger rectangle based on
local point spacing. This uses the same checks for point clearance and the
neighboring area's Gabriel connections. For a small enclosed area with one site
and a stepped side, it also tries to center that side on an existing cut.
Both tile transfers must preserve clearance and Gabriel connections.
Short steps between parallel borders can become an aligned segment, a diagonal
transition, and another aligned segment, with the original endpoints fixed.
Each replacement checks the direction of its joins with the surrounding lines.
A short offset of up to 300 mm can be replaced by a single line when it is
at most one tenth of the span. This is the only contour simplification
allowed along compact one- or two-site components.
When a row or bay would reserve tiles within 500 mm of a site with another assigned
tip level, the viewer repeats the reservation and gives that site priority.
The target is 1 m or half the gap to the nearest site at a different tip
level, whichever is smaller, rounded to available cuts. Shared boundary
edits preserve up to 750 mm of the resulting clearance. A short offset that
returns to the same cut at both ends may use a 700 mm clearance limit.
The viewer shortens narrow, unsupported ends and assigns the recovered space
to the adjoining areas. A change must simplify the visible boundaries and
preserve clearance, location assignments, and Gabriel connections. A strip
can stop at the first protected part of a location's area.
If a straight side passes within 500 mm of an assigned site, the viewer can
shift the full side to give the site more room without adding corners. The
shift checks site ownership, the donor's connectivity, and the original
Gabriel segments. Shared boundaries also use the original segments when
aligning small remaining steps. Tiny offsets in the display margin can be
straightened when the move stays clear of the Gabriel face outline.
Filled regions are clipped to the rounded Gabriel outline.

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
