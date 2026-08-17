# Connected Pile Tip Level Regions — Design

**Status:** Approved for implementation planning

**Date:** 2026-08-17

**Target:** Pile Plan Studio 0.3.0

**Primary issue:** [#22 Visualize connected regions for pile tip levels](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/22)

**Related work:** [#21 Spatially coherent optimization](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/21), [#29 Pile tip level precision](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/29)

## Purpose

Add an experimental viewer overlay that reveals spatially connected groups of
load points with the same pile tip level (PPN). The experiment establishes a
concrete neighbourhood graph and region model that can later inform #21, while
remaining independent of any optimizer.

Engineering validity remains authoritative. The overlay visualizes existing
valid assignments; it never creates, changes, or validates pile assignments.

## Goals

- Show coherent PPN patterns without obscuring exact load-point or CPT
  locations.
- Preserve selection, hover, pan, zoom, and viewer projection behavior.
- Define one deterministic neighbourhood graph that can later be reused for
  evaluation and optimization research.
- Update the overlay immediately and atomically when accepted project state
  changes.
- Persist overlay visibility as a project viewer setting.
- Keep the first experiment small enough to revise after live evaluation.

## Non-goals

The first experiment does not:

- fill bounded faces enclosed by same-PPN graph edges;
- prevent or resolve overlap between different PPN regions;
- include pile size in region membership;
- expose opacity, diameter, or neighbourhood-rule settings;
- optimize the graph builder for large projects;
- export regions to images, PDF, CAD, or IFC;
- couple the overlay to #21 or any particular optimizer;
- define final UX for measuring or limiting region counts;
- resolve the general PPN precision policy tracked in #29.

## Terminology

- A **node** is one load point.
- An **edge** connects two direct neighbours in the neighbourhood graph.
- A **PPN key** is `round(pile_tip_level_m * 1000)`, matching the existing
  millimetre-normalized configuration identity.
- A **PPN component** is a connected component after excluding ineligible
  nodes and retaining only edges whose endpoints have the same PPN key.
- A **PPN layer** is all render geometry for one PPN key. A layer may contain
  multiple disconnected PPN components.

## Neighbourhood graph

### Exact rule

For two geometric sites A and B, define their smallest closed, axis-aligned
rectangle:

```text
[min(A.x, B.x), max(A.x, B.x)]
×
[min(A.y, B.y), max(A.y, B.y)]
```

A and B are direct neighbours exactly when no third geometric site lies inside
or on the boundary of this rectangle. There is no distance threshold, margin,
or tolerance. When A and B have the same X or Y coordinate, the rectangle
degenerates to the closed line segment between them.

The closed boundary intentionally makes aligned intermediate points block
longer edges and prevents diagonals across a four-corner rectangular grid.
Under unique coordinates, the resulting graph is connected.

### Coincident coordinates

Projects are expected to have unique load-point coordinates. For robustness,
coincident locations are treated as one geometric site while building the
empty-rectangle graph:

- all load-point nodes at one site are pairwise neighbours;
- colocated nodes at either endpoint site do not block an outgoing site edge;
- a site edge expands to edges between the nodes at its two endpoint sites.

This preserves individual load-point identity and keeps the graph connected.

### Determinism

Input nodes are normalized into stable `loadPointId` order. Each unordered
site pair is tested once. Returned node, edge, PPN, and component collections
use stable ordering; an edge is represented with its lower endpoint ID first.

## Eligibility and PPN components

A load point participates only when its active pile-plan assignment resolves
to a currently calculated pile option whose `isOption` value is true. The
overlay excludes:

- unassigned load points;
- assignments with missing bearing-capacity data;
- technically invalid assignments;
- assignments that cannot be resolved against the accepted analysis result.

Component construction uses only the PPN key. Pile size is deliberately
ignored. The cached neighbourhood graph is filtered to eligible endpoints with
equal PPN keys, then traversed to produce the connected PPN components.

The overlay uses the last accepted, complete analysis result. If engineering
inputs trigger a new asynchronous analysis, existing regions remain unchanged
until the new result is accepted; the overlay is then replaced atomically.

## Architecture and data flow

### `spatialNeighborhood`

A pure TypeScript viewer/domain module receives load-point IDs and coordinates
and returns the deterministic undirected neighbourhood graph. It knows nothing
about PPN values, pile plans, legends, React, SVG, or optimization.

The initial graph builder uses the direct pairwise algorithm:

1. Enumerate each unordered geometric-site pair.
2. Scan other sites for a blocker in the closed rectangle.
3. Stop at the first blocker.
4. Add an edge when no blocker exists.

This has `O(n^3)` worst-case time. It is accepted for the experiment because
the graph is cached and coordinate changes are infrequent. No 1,000-location
performance gate is part of this phase. The module boundary allows a spatial
index or specialized algorithm to replace the implementation later without
changing consumers.

### `tipLevelRegions`

A second pure module receives:

- the cached neighbourhood graph;
- the active plan's accepted valid assignments;
- PPN legend colors;
- the current symbol scale.

It returns stable render data grouped by PPN key: nodes, same-PPN edges,
components, color, circle diameter, and layer order. It does not contain React
or SVG markup and does not depend on an optimizer.

### Viewer integration

`PilePlanViewer` derives projected pixel coordinates using the existing fixed
`ProjectViewTransform`. The overlay is an SVG inside the existing
`.viewer-content` stage, so the one existing viewport transform controls pan
and zoom. Marker positions and region geometry use the same unrounded projected
pixel coordinates.

The SVG:

- has `pointer-events: none`;
- sits above the coordinate grid;
- sits below CPT connection lines, CPT markers, load-point markers, selection
  indicators, and hover UI;
- is not recomputed during ordinary pan or zoom frames.

The neighbourhood graph is recomputed only when load-point IDs or coordinates
change. PPN filtering and render data are recomputed when accepted assignments,
the active pile plan, accepted validity results, legend colors, or symbol scale
change.

## Rendering rules

### Base geometry

Every eligible node receives one circle in its PPN legend color. Its diameter
is:

```text
current rendered load-point marker diameter + 8 CSS px
```

The current symbol-size setting therefore changes the base diameter while the
additional margin stays fixed at 8 CSS px in the unzoomed viewer stage. The
normal plan viewport transform scales the entire overlay during plan zoom.

Every neighbourhood edge whose eligible endpoints have the same PPN key is
drawn as a straight line with:

- stroke width equal to the region-circle diameter;
- round line caps;
- round joins.

Circles and thick lines form round-ended capsule geometry. An isolated
eligible node remains one circle. An open A–B–C chain becomes one continuous
capsule-like region.

### Color and compositing

All opaque circles and lines for one PPN key are placed in one isolated SVG
group. A fixed opacity of 25% is applied once to that group, not separately to
its primitives. Internal overlap therefore does not create darker seams.

PPN layers are drawn from shallow to deep: numerically higher metre values
first and increasingly negative values later. For `-10 m`, `-15 m`, and
`-20 m`, the exact order is `-10`, `-15`, `-20`. Different PPN layers use
normal alpha compositing, so overlap produces a visible mixed color and deeper
layers are composed last.

Within one PPN key, components use the smallest contained `loadPointId` as a
stable secondary order. This does not normally change the image because all
components share one color and one group opacity.

### Deferred enclosed-face filling

A four-node rectangular cycle initially renders as four capsule connections
around an unfilled center. Filling bounded faces is intentionally deferred.
The likely future rule is to planarize same-PPN segments at visual
intersections, extract bounded faces, and fill every face whose complete
boundary consists of same-PPN edges. This rule is documented but must not be
implemented in this experiment.

## UI and persistence

The bilingual View ribbon gains a project-wide toggle:

- Dutch: **PPN-gebieden tonen**
- English: **Show tip-level regions**

The setting is named `showTipLevelRegions` in TypeScript and
`show_tip_level_regions` in serialized Rust/IFCPP data. It defaults to `false`.

It follows the existing `showGrid` persistence pattern:

- it is stored under project `settings.viewer` in IFCPP;
- missing fields in older projects normalize to `false`;
- it is included in browser recovery stored in IndexedDB;
- IndexedDB remains recovery storage, while IFCPP is explicit durable storage;
- changing the toggle is a project content change;
- the value applies across pile-plan variants in the same project.

Changing the active pile plan keeps the visibility setting and atomically
renders regions for the newly active plan.

## Error handling

- No valid assigned nodes produces no overlay and no warning.
- A PPN assignment without a resolvable legend color is skipped rather than
  crashing the viewer.
- Malformed or unresolvable assignments are ineligible and produce no geometry.
- The overlay never blocks pointer events, even if geometry generation yields
  overlapping or degenerate shapes.
- An accepted analysis update replaces region data atomically; the viewer does
  not present partially recalculated components.

## Verification

### Neighbourhood graph unit tests

- One node and two nodes.
- Three collinear nodes: the middle node blocks the long edge.
- Four rectangular-grid nodes: four perimeter edges and no diagonals.
- Four plus-shape nodes: verify the expected graph and the two crossing
  same-PPN connections after PPN filtering.
- A blocker exactly on a rectangle boundary.
- Coincident-coordinate sites and their outgoing connectivity.
- Input permutation does not change normalized output.
- The complete neighbourhood graph has one connected component for fixtures.

### PPN component and render-data tests

- One eligible isolated node produces one circle.
- A same-PPN A–B–C chain produces one component and two connections.
- Assignment changes split and merge components.
- Values with the same millimetre-normalized key group together.
- Unassigned, missing, invalid, and unresolved assignments are excluded.
- Circle diameter follows current marker diameter plus 8 px.
- Connection width equals circle diameter.
- Opacity is applied once per PPN layer at 25%.
- Layer ordering is shallow-to-deep and deterministic.
- No bounded-face fill geometry is generated.

### Integration and persistence tests

- The View-ribbon toggle defaults to off and has Dutch and English labels.
- New and old IFCPP data round-trip with the correct default.
- Browser recovery preserves the toggle.
- Changing assignments, active pile plan, accepted analysis, symbol size, or
  legend colors refreshes the overlay.
- The overlay uses `pointer-events: none` and the required layer position.
- Viewer projection continues to use exact unrounded pixel positions.

### Manual live-viewer checks

Evaluate the sample project (328 load points) plus focused fixtures for:

- a single isolated node;
- an A–B–C line;
- a four-node rectangle;
- the two-PPN plus shape.

Verify visibility, alpha mixing, immediate updates, selection, hover, panel
resizing, plan pan, and plan zoom. The overlay must not introduce noticeable
pan or zoom lag. Browser and Tauri should produce equivalent geometry at the
same project viewport.

## Acceptance criteria

The experiment is complete when:

1. The persisted View-ribbon toggle shows deterministic PPN regions for valid
   assignments only.
2. Graph construction, PPN filtering, color ordering, and geometry match the
   rules in this document.
3. Assignment, plan, validity, legend, and symbol-size changes update the
   overlay atomically.
4. Exact marker locations, selection, hover, pan, zoom, and panel-resize
   behavior remain intact.
5. Automated tests and the four focused manual cases pass.
6. The implementation has no optimizer dependency and does not implement any
   explicitly deferred feature.

## Follow-up use in #21

After live evaluation, the graph and PPN components can provide objective
measurements for #21, such as component count and same-configuration adjacency.
That later design must decide separately how component count, configuration
variety, and cost interact. This experiment does not make that policy choice.
