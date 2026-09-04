# Connected Pile Tip Level Regions — Design

**Status:** Design approved; written spec awaiting final review

**Created:** 2026-08-17

**Last revised:** 2026-08-31

**Target:** Pile Plan Studio 0.3.0

**Primary issue:** [#22 Visualize connected regions for pile tip levels](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/22)

**Related work:** [#21 Spatially coherent optimization](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/21), [#29 Pile tip level precision](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/29)

## Purpose

Add an experimental viewer overlay that shows local and enclosed regions of
load points with the same pile tip level (PPN). The experiment establishes a
Gabriel neighbourhood graph and a conservative planar face model that can
later inform #21, while remaining independent of any optimizer.

Engineering validity remains authoritative. The overlay visualizes the last
accepted valid assignments; it never creates, changes, or validates pile
assignments.

## Goals

- Show coherent PPN patterns without obscuring exact load-point or CPT
  locations.
- Fill elementary planar faces only when their complete boundary has one PPN.
- Preserve gaps around mixed or unavailable PPN data instead of assigning a
  large enclosing cycle to one PPN.
- Preserve selection, hover, pan, zoom, and the documented viewer projection.
- Define a deterministic neighbourhood graph that can later be reused by
  evaluation or optimization research without coupling the viewer to #21.
- Keep graph construction, face extraction, PPN classification, visual
  geometry, and SVG presentation independently replaceable.
- Persist overlay visibility as a project viewer setting.
- Keep the first implementation deliberately direct and easy to evaluate in
  the live viewer.

## Non-goals

The first Gabriel/face experiment does not:

- count connected PPN components;
- prescribe an objective or constraint formulation for #21;
- implement ILP connectivity, flow, cut, or component variables;
- include pile size in region membership;
- use Delaunay triangulation or another acceleration structure;
- merge adjacent faces into explicit outer-boundary polygons;
- clip capsules or circles at ownership boundaries;
- assign every point of the plane exclusively to one PPN;
- expose opacity, margin, or graph-strategy settings in the UI;
- optimize or certify runtime for 1,000-location projects;
- export regions to images, PDF, CAD, or IFC;
- resolve the general PPN precision policy tracked in #29;
- provide a runtime-selectable plugin framework for graph or region strategies.

## Terminology

- A **load-point node** is one load point with a stable `loadPointId`.
- A **geometric site** is one exact project coordinate. Multiple coincident
  load-point nodes may belong to one site.
- A **Gabriel edge** connects two sites whose closed diametral disk contains no
  third site.
- A **half-edge** is one directed orientation of an undirected Gabriel edge.
- An **elementary face** is a bounded face walk in the planar embedding of the
  complete Gabriel Graph.
- A **PPN key** is `round(pile_tip_level_m * 1000)`, matching the existing
  millimetre-normalized configuration identity.
- A **unanimous face** is an elementary face for which every boundary
  load-point node is eligible and has the same PPN key.
- A **PPN layer** is all unanimous faces, same-PPN edges, and eligible nodes for
  one PPN key. One layer may contain multiple disconnected regions.

## Complete Gabriel neighbourhood graph

### Closed diametral-disk rule

For every unordered pair of distinct geometric sites `A` and `B`, scan every
other site `C`. Site `C` blocks edge `A–B` exactly when:

```text
(C - A) · (C - B) <= 0
```

By Thales' theorem this means that `C` lies inside or on the circle with `AB`
as diameter. Edge `A–B` exists only when no blocker is found.

The comparison has no user margin or geometric tolerance. A site on the circle
blocks the edge. This closed rule removes both crossing diagonals in cocircular
four-point cases and keeps the straight-line graph planar. It also makes an
intermediate collinear site block a longer edge.

The first implementation tests all site pairs directly and scans all other
sites, giving `O(n^3)` worst-case construction time. This is intentional: the
goal is to validate Gabriel semantics before introducing Delaunay or spatial
index dependencies. The graph is cached and coordinate changes are expected to
be infrequent.

### Coincident coordinates

Projects are expected to have unique load-point coordinates. For robustness,
coincident load points are grouped into one geometric site for Gabriel tests.
The core preserves all load-point identities at that site.

- Other load points at an endpoint site do not block an outgoing site edge.
- Coincident load points are considered mutually adjacent for downstream
  topology, but their zero-length visual edge is omitted.
- A face is unanimous only when all boundary load-point nodes represented by
  its sites are eligible and share one PPN key.
- Node circles and outgoing site edges are deduplicated per geometric site and
  PPN key, so coincident nodes do not create repeated SVG geometry.

This prevents zero-length geometry from destabilizing angle sorting while
keeping coincident assignments explicit.

### Determinism and graph properties

Sites and load-point nodes are normalized into stable ID order. Each unordered
site pair is tested once. Edges store their lower endpoint identifier first,
and returned collections use stable ordering.

For distinct sites, the closed Gabriel Graph is connected and planar. As a
planar graph it is sparse, with at most approximately `3n - 6` edges. Face
extraction and rendering therefore remain linear in project size after graph
construction.

The implementation must not assume that every face is triangular or convex,
or that every edge bounds a positive-area face. Gabriel graphs may contain
bridges, dangling branches, non-triangular faces, and collinear degeneracies.

## Planar face extraction

Face extraction runs on the complete Gabriel Graph before any PPN filtering.
Using the complete graph is essential: an enclosing ring of one PPN must not
claim a large interior that contains load points with other PPN values.

### Half-edge traversal

1. Create two half-edges, `A→B` and `B→A`, for every Gabriel edge.
2. Sort every site's outgoing half-edges counter-clockwise by exact project
   direction. Use stable site identity as the deterministic final tie-breaker.
3. Start at each not-yet-visited half-edge.
4. After traversing `U→V`, choose at `V` the outgoing half-edge immediately
   clockwise from the reverse direction `V→U`. This keeps the traversed face
   on the left.
5. Continue until the starting half-edge is reached and mark the complete walk
   visited.
6. Retain only positive-area walks as bounded elementary faces.

Each half-edge participates in one face walk. Sorting costs
`O(E log degree)` overall and traversal costs `O(E)`.

### Signed area

Signed area distinguishes bounded, outer, and degenerate walks:

- positive area: bounded elementary face;
- negative area: the outer face;
- zero area: collinear or degenerate walk with no fillable surface.

The shoelace sum is evaluated relative to the first coordinate in the walk to
avoid unnecessary cancellation from large project coordinates. Across all
walks, area evaluation visits exactly `2E` half-edges and is negligible beside
Gabriel construction.

Bridge excursions may repeat an edge in opposite directions within one face
walk. Their zero-area contribution is valid; the face still uses every
boundary node when testing PPN unanimity.

## Eligibility and PPN classification

The complete spatial graph contains every load-point site, regardless of
whether the active plan currently has an eligible assignment there. This
ensures that unassigned or invalid locations still influence neighbourhood and
face topology rather than disappearing geometrically.

A load-point node is eligible for colored region geometry only when its active
pile-plan assignment resolves to a currently calculated pile option whose
`isOption` value is true. The overlay excludes colored node and edge geometry
for:

- unassigned load points;
- assignments with missing bearing-capacity data;
- technically invalid assignments;
- assignments that cannot be resolved against the accepted analysis result.

For every bounded elementary face, Rust collects all boundary load-point nodes:

- if all are eligible and have one PPN key, assign the face to that PPN layer;
- if their PPN keys differ, leave the face uncolored;
- if any boundary node is ineligible or unresolved, leave the face uncolored.

Consequently, mixed transition faces and larger internal gaps remain visible.
An enclosing same-PPN cycle does not fill over internal different-PPN topology.
The rule is deliberately conservative: ambiguous faces may remain unfilled,
but no mixed face receives a misleading dominant color.

Same-PPN edge geometry is selected independently. For ordinary unique-site
data, a Gabriel edge is retained for rendering only when both endpoint load
points are eligible and have the same PPN key. At a coincident site, Rust first
deduplicates eligible PPN keys; a site edge is emitted once in each PPN layer
present at both endpoint sites. Cross-PPN edges remain in the cached graph and
face topology but are never drawn as colored connections.

No connected-component traversal or count is needed for #22. Visual
connectivity emerges from shared faces, edges, and node circles. A later #21
design may formulate connectivity directly in an ILP rather than consuming a
post-hoc component count.

The overlay uses the last accepted complete analysis result. When engineering
inputs start a new asynchronous analysis, existing region data remains visible
until the new result is accepted. Classification and displayed geometry are
then replaced atomically.

## Architecture and data flow

### Rust core: spatial and PPN topology

`pile-plan-core` owns all spatial and domain decisions:

- geometric-site normalization;
- direct closed-disk Gabriel construction;
- stable adjacency ordering;
- half-edge face extraction;
- signed-area face classification;
- canonical millimetre PPN identity;
- assignment-validity resolution;
- unanimous-face classification;
- same-PPN edge and eligible-node selection.

The core exposes serializable DTOs conceptually equivalent to:

```text
SpatialSubdivision
  sites
  load_point_nodes
  gabriel_site_edges
  bounded_face_site_walks

TipLevelRegionLayer
  pile_tip_level_m_key
  legend_value_m
  face_boundary_site_ids
  same_ppn_site_edges
  node_site_ids
```

Exact wire names may follow existing repository conventions, but the contract
must not expose SVG strings, colors, opacity, marker sizes, or viewer pixels.
It also must not expose a component count as required #22 output.
All DTO collections retain deterministic stable-ID and numeric-key ordering;
TypeScript still owns the chosen visual shallow-to-deep layer order.

Browser and desktop use the same core behavior through thin WASM and Tauri
adapters. Adapters deserialize, call `pile-plan-core`, and serialize; they do
not reimplement graph, face, validity, or PPN rules.

### TypeScript: orchestration and visual geometry

TypeScript owns viewer-specific work only:

- cache and request Rust topology at the correct lifecycle boundaries;
- map returned load-point IDs to exact projected viewer coordinates;
- derive the current marker diameter from `symbolScalePercent`;
- build SVG subpaths for face walks, edge strokes, and node circles;
- apply legend colors, fixed opacity, visual dimensions, and draw order;
- integrate the overlay, ribbon toggle, persistence, and bilingual UI;
- preserve selection, hover, pan, zoom, and pointer behavior.

TypeScript must not calculate Gabriel adjacency, extract faces, classify PPN
unanimity, reinterpret validity, or count components.

### Caching and refresh boundaries

- Recompute the Gabriel Graph and bounded faces only when load-point IDs or
  exact coordinates change.
- Recompute Rust PPN-layer classification when the spatial topology, active
  pile plan, selected assignments, or accepted analysis result changes.
- Recompute projected SVG geometry when classified layers, the fixed project
  projection, viewer dimensions, or symbol scale changes.
- Do not rebuild topology or SVG path data during ordinary pan or zoom frames;
  reuse the existing `.viewer-content` transform.
- Replace region layers only after a complete new analysis result is accepted.

These boundaries keep the Gabriel implementation replaceable and avoid
duplicating domain logic in TypeScript.

## SVG geometry and rendering

### Face subpaths: visual union without polygon union

Adjacent unanimous faces are not merged into new outer-boundary polygons.
Instead, all unanimous faces for one PPN key are emitted as closed subpaths in
one compound SVG face path.

Faces share exact projected edge coordinates. One compound path rasterizes
them as one continuous fill while their Rust topology remains elementary and
independently testable. A face omitted because it is mixed or unresolved stays
an unfilled gap. Explicit shared-edge cancellation, outer-ring reconstruction,
and polygon union are deferred until clipping, export, or area calculations
actually require them.

### Butt-capped edge strokes and node circles

Every rendered same-PPN edge remains present in the first experiment,
including an edge shared by two filled faces. Edges for one PPN key are batched
as independent `M … L …` subpaths in one SVG stroke path with:

- `fill="none"`;
- stroke width equal to the region diameter;
- `stroke-linecap="butt"`;
- no rounded edge geometry.

A butt-capped thick stroke is a rectangle from one endpoint center to the
other. Every eligible load point is also rendered as a circle whose diameter
equals the stroke width. The union of an edge rectangle and its endpoint
circles is exactly a capsule. Node circles also close junctions between
multiple edges and preserve isolated one-node regions.

The region diameter is:

```text
current rendered load-point marker diameter + 6 CSS px
```

The six-pixel addition is the total diameter margin, leaving three CSS pixels
of background beyond the symbol on each side at the unzoomed viewer scale. The
normal plan viewport transform scales symbols and overlay together. Do not use
`vector-effect="non-scaling-stroke"`.

Keeping internal edges costs at most linear path data, masks possible
antialiasing seams between face subpaths, and avoids premature edge
classification. Internal-edge removal may be added later only after measured
need.

### Color, opacity, and draw order

Each PPN layer contains solid-color face, edge, and node geometry in this order:

1. unanimous face fill path;
2. butt-capped edge stroke path;
3. node-circle compound path.

A fixed opacity of 25% is applied once to the complete PPN group, not to its
individual subshapes. Same-PPN overlap therefore does not darken internal edges
or junctions. Different PPN groups use normal alpha compositing and may mix
where their buffered edges or circles overlap. No clipping is applied.

PPN layers are drawn from shallow to deep: numerically higher metre values
first and increasingly negative values later. For `-10 m`, `-15 m`, and
`-20 m`, the order is `-10`, `-15`, `-20`. Deeper layers are composed last.

### Viewer integration

`PilePlanViewer` derives all node and face coordinates through the existing
fixed `ProjectViewTransform`. Geometry uses exact unrounded projected pixel
coordinates. The overlay SVG sits inside the existing `.viewer-content` stage,
so the one existing viewport transform controls pan and zoom.

The SVG:

- has `pointer-events: none`;
- sits above the coordinate grid;
- sits below CPT connections, CPT markers, load-point markers, selection
  indicators, and hover UI;
- introduces no nested viewport transform;
- is not recomputed during ordinary pan or zoom frames.

This preserves the projection and rasterization constraints documented in the
viewer README and known limitations.

## UI and persistence

The existing bilingual View-ribbon toggle remains:

- Dutch: **PPN-gebieden tonen**
- English: **Show tip-level regions**

The setting is named `showTipLevelRegions` in TypeScript and
`show_tip_level_regions` in serialized Rust/IFCPP data. It defaults to `false`.

It follows the existing `showGrid` persistence pattern:

- store under project `settings.viewer` in IFCPP;
- normalize a missing field in older projects to `false`;
- include it in browser recovery stored in IndexedDB;
- treat IndexedDB as recovery storage and IFCPP as explicit durable storage;
- treat changing the toggle as a project content change;
- apply one visibility value across pile-plan variants in the project.

Changing the active pile plan keeps the visibility setting and atomically
renders the accepted regions for the newly active plan.

## Error handling

- No eligible assigned nodes produces no colored overlay and no warning.
- A graph with fewer than three distinct sites produces nodes and eligible
  edges but no bounded faces.
- A PPN assignment without a resolvable legend color is skipped rather than
  crashing the viewer.
- Malformed or unresolved assignments remain part of spatial topology but
  produce no colored node, edge, or unanimous-face geometry.
- Degenerate zero-area face walks are ignored.
- The overlay never blocks pointer events.
- A failed background classification keeps the last accepted overlay and
  reports through the existing analysis error path; it does not show partial
  topology.

## Performance model

- Direct Gabriel construction: `O(n^3)`, cached by stable IDs and coordinates.
- Adjacency sorting: `O(E log degree)`.
- Half-edge traversal and signed area: `O(E)`.
- PPN classification and SVG primitive selection: `O(E + F + N)`.
- Gabriel sparsity bounds edges and total face-boundary occurrences linearly;
  all face walks together visit `2E` half-edges.
- SVG DOM cost is approximately three path elements per distinct rendered PPN
  key, not one element per node, edge, or face.

For illustration, a 1,000-site planar graph has fewer than roughly 3,000
edges and 6,000 total face-edge occurrences. No 1,000-location acceptance gate
is required for this experiment; live profiling should precede optimization.

## Verification

### Gabriel Graph unit tests

- Zero, one, and two distinct sites.
- Three collinear sites: the middle site blocks the long edge.
- Four square corners: perimeter edges exist and both diagonals are blocked by
  sites on their closed diametral circles.
- A blocker exactly on the diametral-circle boundary.
- A site just outside the diametral circle does not block.
- Coincident-coordinate grouping and preserved load-point identities.
- Input permutation does not change normalized graph output.
- Representative distinct-site fixtures produce a connected planar graph.

### Face-extraction unit tests

- A triangle produces one positive bounded walk and one negative outer walk.
- A square produces its one bounded elementary face.
- A generic planar fixture with a diagonal produces two elementary faces.
- A tree produces no positive-area face.
- Bridge excursions do not add area or create a false face.
- Collinear walks have zero area.
- Large translated project coordinates preserve the same signed-area result.
- Every half-edge is visited exactly once.

### PPN-classification unit tests

- A face whose complete boundary has one eligible PPN is assigned to that key.
- A mixed-PPN face remains uncolored.
- A face with one unresolved or invalid boundary node remains uncolored.
- A regular same-PPN ring with a different-PPN interior point and Gabriel
  spokes does not become one blanket outer fill.
- Same-PPN edges are retained; cross-PPN edges are not rendered.
- Internal same-PPN edges between filled faces remain in the returned edge
  geometry.
- Equivalent millimetre-normalized PPN values classify identically.
- WASM and Tauri adapters preserve stable nodes, edges, face walks, and keys.

### TypeScript geometry and presentation tests

- One eligible isolated node produces one circle and no face or edge geometry.
- A same-PPN A–B edge produces one butt-capped stroke plus two endpoint
  circles.
- Region diameter equals current marker diameter plus 6 CSS px.
- Face boundaries become closed subpaths in the correct PPN fill path.
- Multiple faces and edges are batched rather than emitted as individual SVG
  elements.
- Opacity is applied once per PPN group at 25%.
- Layer ordering is shallow-to-deep and deterministic.
- Projected coordinates remain exact and unrounded.

### Pipeline contract tests

- Spatial topology does not depend on assignments, colors, or rendering.
- PPN classification consumes Rust spatial topology without changing Gabriel
  adjacency or face walks.
- WASM, Tauri, and `coreClient.ts` contain no alternative graph, face, PPN, or
  validity algorithm.
- TypeScript does not calculate components or reinterpret face unanimity.
- Presentation changes do not alter Rust topology output.
- SVG rendering consumes prepared primitives without inspecting assignments.

### Integration and persistence tests

- The View-ribbon toggle defaults to off and has Dutch and English labels.
- New and old IFCPP data round-trip with the correct default.
- Browser recovery preserves the toggle.
- Accepted assignment, plan, analysis, symbol-size, and legend-color changes
  refresh the overlay atomically.
- Pending analysis leaves the previous accepted overlay visible.
- The overlay uses `pointer-events: none` and the required layer position.
- Selection, hover, pan, zoom, panel resizing, and exact marker positions remain
  unchanged.

### Manual live-viewer checks

Evaluate the sample project plus focused fixtures for:

- a single isolated node;
- an open A–B–C chain;
- a one-PPN square face;
- two adjacent unanimous faces with their internal edge retained;
- a mixed face;
- a same-PPN outer ring containing different-PPN interior topology;
- overlapping buffered circles or edges from different PPN layers.

Verify face filling, preserved gaps, 25% alpha mixing, deterministic draw order,
selection, hover, panel resizing, plan pan, and plan zoom. The overlay must not
introduce noticeable interaction lag. Browser and Tauri should produce
equivalent topology and visual geometry at the same project viewport.

## Acceptance criteria

The Gabriel/face experiment is complete when:

1. The persisted View-ribbon toggle shows deterministic PPN regions for the
   last accepted valid assignments.
2. Closed-disk Gabriel construction and full-graph face extraction match this
   document.
3. Only unanimous bounded faces are filled; mixed and unresolved faces remain
   uncolored.
4. Same-PPN edges use butt-capped strokes, all eligible nodes use equal-width
   circles, and the region diameter is marker diameter plus 6 CSS px.
5. Faces, edges, and circles are batched per PPN layer with opacity applied once
   at 25%; internal same-PPN edges remain present.
6. Assignment, plan, accepted analysis, legend, and symbol-size changes update
   the overlay atomically at the documented lifecycle boundary.
7. Exact locations, selection, hover, pan, zoom, and panel-resize behavior
   remain intact.
8. Automated tests and focused manual cases pass without a new 1,000-location
   performance requirement.
9. Rust remains the sole source of Gabriel, face, PPN, and validity logic;
   TypeScript begins with authoritative topology DTOs and owns only viewer
   geometry and presentation.
10. The implementation has no optimizer dependency and does not implement
    component counting, ILP policy, clipping, polygon union, or Delaunay
    acceleration.

## Follow-up use in #21

The cached Gabriel Graph provides an explicit, optimizer-independent spatial
adjacency model. A later #21 design may consume those edges in an ILP or another
optimization approach and may introduce binary variables, flow constraints,
cut constraints, or evaluation metrics for spatial coherence.

Issue #22 deliberately does not prescribe or compute a connected-component
count.
Cost, configuration variety, connected-region limits, technical validity,
locked load points, reproducibility, and runtime remain requirements for the
separate #21 design.

## Deferred follow-up directions

The following ideas require separate design or issues before implementation:

- accelerate Gabriel construction through Delaunay triangulation after the
  direct graph has been validated;
- reconstruct explicit outer and inner boundary loops when clipping, export,
  or area calculations need real polygons;
- clip buffered geometry at shared ownership boundaries if transparent overlap
  proves visually misleading;
- revisit the six-pixel margin or 25% opacity only after live evaluation;
- reconcile display and core precision under #29;
- integrate later compatible 0.2.x changes before final 0.3.0 integration.
