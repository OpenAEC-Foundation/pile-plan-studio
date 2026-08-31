# Gabriel Tip-Level Region Faces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents, so all execution is inline.

**Goal:** Replace the experimental empty-rectangle PPN overlay with a closed-disk Gabriel Graph, conservative unanimous-face filling, and batched butt-capped SVG region geometry.

**Architecture:** `pile-plan-core` builds and caches a site-level planar Gabriel topology, extracts bounded faces with a half-edge walk, and classifies eligible nodes, same-PPN edges, and unanimous faces. TypeScript consumes the authoritative DTO, projects exact coordinates through the existing viewer transform, and renders at most three SVG paths per PPN layer with one group opacity.

**Tech Stack:** Rust 2021, Serde, wasm-bindgen/serde-wasm-bindgen, Tauri 2, React 19, TypeScript 6, SVG, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-08-17-tip-level-regions-design.md`

## Global Constraints

- Work on `feature/0.3.0-tip-level-regions`; never create a branch containing `codex/`.
- Use no subagents.
- Implement only #22's Gabriel/face visualization; do not add #21 optimizer or component-count logic.
- Use the closed Gabriel blocker test `(C - A) · (C - B) <= 0` with no tolerance or margin.
- Treat exact coincident coordinates as one site for geometry while preserving stable load-point IDs.
- Build faces on the complete Gabriel Graph before PPN filtering.
- Fill a bounded face only when every load point represented on its boundary is eligible and has one millimetre-normalized PPN key.
- Keep engineering validity, PPN normalization, Gabriel construction, face extraction, and PPN classification in Rust.
- Keep projection, colors, 25% group opacity, the 6 CSS px diameter margin, and SVG path generation in TypeScript.
- Keep all rendered same-PPN edges, including edges internal to adjacent filled faces.
- Use butt-capped strokes plus equal-diameter node circles; do not generate rounded edge caps.
- Do not merge elementary faces into outer-boundary polygons and do not add clipping.
- Reuse exact unrounded `ProjectViewTransform` coordinates and the single `.viewer-content` pan/zoom transform.
- Keep the persisted bilingual ribbon toggle and accepted-analysis lifecycle from the current implementation.
- Do not add Delaunay, a new dependency, a 1,000-location gate, a schema bump, or configurable graph/render settings.
- Integrate later compatible 0.2.x work before final 0.3.0 integration, not as part of this plan.

## File Structure

### Create

- `crates/pile-plan-core/src/spatial/gabriel.rs` — exact site normalization and direct closed-disk Gabriel edge construction.
- `crates/pile-plan-core/src/spatial/faces.rs` — angle ordering, half-edge traversal, canonical bounded face walks, and translated signed area.

### Modify

- `crates/pile-plan-core/src/spatial.rs` — public spatial/region DTOs, PPN validity resolution, layer classification, and core integration tests.
- `crates/pile-plan-core/src/lib.rs` — replace component-oriented exports with site/face topology exports.
- `crates/pile-plan-wasm/src/lib.rs` — keep the WASM adapter thin while accepting the revised DTO.
- `apps/pile-plan-studio/src-tauri/src/main.rs` — keep the Tauri adapter thin while accepting the revised DTO.
- `apps/pile-plan-studio/src/core/spatialTopologyContract.ts` — mirror site, edge, face, and PPN-layer DTOs exactly.
- `apps/pile-plan-studio/src/core/spatialTopologyContract.test.ts` — transport serialization for the revised DTO.
- `apps/pile-plan-studio/src/components/domain/tipLevelRegionTopologyController.test.ts` — update fixtures while retaining cache and stale-result behavior.
- `apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.ts` — project face, segment, and site-circle primitives with a 6 px margin.
- `apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.test.ts` — face projection, margin, missing-site, and internal-edge tests.
- `apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.ts` — carry faces through existing color and shallow-to-deep presentation.
- `apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.test.ts` — revised layer fixtures.
- `apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.ts` — aggregate face, edge, and circle primitives into three path descriptions per PPN.
- `apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.test.ts` — exact batching, butt-cap, opacity, and order assertions.
- `apps/pile-plan-studio/src/components/domain/TipLevelRegionOverlay.tsx` — render compound paths instead of one DOM node per edge/circle.
- `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/*` — regenerate tracked WASM bindings and binary from the revised Rust exports.

### Preserve unless a failing integration test proves otherwise

- `apps/pile-plan-studio/src/components/domain/useTipLevelRegionTopology.ts` — accepted async lifecycle and enable/disable behavior.
- `apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx` — existing overlay placement and memoization.
- `apps/pile-plan-studio/src/components/domain/viewer.css` — existing pointer-transparent layer position.
- Project persistence, ribbon, translations, and IndexedDB recovery — already implemented and covered by regression tests.

---

### Task 1: Build and test the reusable Gabriel planar embedding

**Files:**
- Create: `crates/pile-plan-core/src/spatial/gabriel.rs`
- Create: `crates/pile-plan-core/src/spatial/faces.rs`
- Modify: `crates/pile-plan-core/src/spatial.rs`

**Interfaces:**
- Consumes: sorted `LoadPoint { id, x_mm, y_mm, .. }` values.
- Produces internally: `GeometricSite`, `SiteEdge`, `SiteFace`, `GabrielGraph`, and `GabrielEmbedding`.
- Produces functions: `build_gabriel_graph(load_points: &[LoadPoint]) -> GabrielGraph`, `extract_bounded_faces(graph: &GabrielGraph) -> Vec<SiteFace>`, and the parent-module composition `build_gabriel_embedding(...) -> GabrielEmbedding`.

- [ ] **Step 1: Add failing Gabriel fixtures**

In `spatial/gabriel.rs`, define tests around stable site IDs, where `site_id` is the lowest load-point ID at an exact coordinate:

```rust
#[test]
fn square_keeps_perimeter_and_blocks_both_closed_disk_diagonals() {
    let graph = build_gabriel_graph(&[
        point(4, 0.0, 1.0), point(2, 1.0, 0.0),
        point(1, 0.0, 0.0), point(3, 1.0, 1.0),
    ]);
    assert_eq!(pairs(&graph), vec![(1, 2), (1, 4), (2, 3), (3, 4)]);
}

#[test]
fn point_on_diametral_circle_blocks_edge() {
    let graph = build_gabriel_graph(&[
        point(1, -1.0, 0.0), point(2, 1.0, 0.0), point(3, 0.0, 1.0),
    ]);
    assert!(!pairs(&graph).contains(&(1, 2)));
}

#[test]
fn point_just_outside_diametral_circle_does_not_block_edge() {
    let graph = build_gabriel_graph(&[
        point(1, -1.0, 0.0), point(2, 1.0, 0.0), point(3, 0.0, 1.001),
    ]);
    assert!(pairs(&graph).contains(&(1, 2)));
}
```

Also add zero/one/two-site, collinear-middle-blocker, coincident-site grouping, and input-permutation fixtures. Assert that coincident site `1` stores sorted `load_point_ids == vec![1, 7]` and produces no zero-length Gabriel edge.

- [ ] **Step 2: Run the Gabriel tests and confirm the red state**

Run: `cargo test -p pile-plan-core spatial::gabriel::tests -- --nocapture`

Expected: compilation fails because `build_gabriel_embedding` and its internal types do not exist.

- [ ] **Step 3: Implement exact site normalization and direct Gabriel edges**

Define these shared internal shapes in `spatial.rs`; `gabriel.rs` and
`faces.rs` access them through their parent module:

```rust
#[derive(Clone, Debug, PartialEq)]
pub(super) struct GeometricSite {
    pub site_id: u32,
    pub load_point_ids: Vec<u32>,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub(super) struct SiteEdge {
    pub from_site_id: u32,
    pub to_site_id: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct GabrielGraph {
    pub sites: Vec<GeometricSite>,
    pub edges: Vec<SiteEdge>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct SiteFace {
    pub boundary_site_ids: Vec<u32>,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct GabrielEmbedding {
    pub graph: GabrielGraph,
    pub faces: Vec<SiteFace>,
}
```

Normalize exact `(x_mm, y_mm)` matches by iterating load points in stable ID
order and appending each point to the first site whose
`site.x_mm == load_point.x_mm` and `site.y_mm == load_point.y_mm`; otherwise
create a site. Sort each site's IDs and assign its
first ID as `site_id`, then sort sites by `site_id`. This direct `O(n^2)`
grouping avoids hash or ordering semantics for floating-point coordinates and
is dominated by Gabriel construction. For every unordered site pair `A, B`,
reject the edge when any third site satisfies:

```rust
let dot = (c.x_mm - a.x_mm) * (c.x_mm - b.x_mm)
    + (c.y_mm - a.y_mm) * (c.y_mm - b.y_mm);
let blocked = dot <= 0.0;
```

Store normalized site pairs in a `BTreeSet<SiteEdge>`. Do not use epsilon comparisons, distance cutoffs, rectangle tests, or external geometry crates.
Declare `mod gabriel; mod faces;` from `spatial.rs`; keep these implementation
modules private behind the public spatial DTO and builder functions.

- [ ] **Step 4: Add failing half-edge and signed-area fixtures**

In `spatial/faces.rs`, add tests for:

```rust
#[test]
fn triangle_has_one_canonical_bounded_face() {
    let graph = build_gabriel_graph(&[
        point(1, 0.0, 0.0), point(2, 2.0, 0.0), point(3, 1.0, 2.0),
    ]);
    assert_eq!(extract_bounded_faces(&graph), vec![SiteFace { boundary_site_ids: vec![1, 2, 3] }]);
}

#[test]
fn translated_coordinates_keep_the_same_positive_area() {
    assert_eq!(
        signed_twice_area(&[(0.0, 0.0), (2.0, 0.0), (1.0, 2.0)]),
        signed_twice_area(&[(120_000.0, 480_000.0), (120_002.0, 480_000.0), (120_001.0, 480_002.0)]),
    );
}
```

Also cover a square, a generic planar graph with one diagonal producing two faces, a tree producing no bounded face, a bridge excursion, collinear zero area, and exactly-once half-edge visitation.

- [ ] **Step 5: Run face tests and confirm the red state**

Run: `cargo test -p pile-plan-core spatial::faces::tests -- --nocapture`

Expected: compilation fails because face extraction and signed area do not exist.

- [ ] **Step 6: Implement deterministic half-edge traversal**

For each site, sort outgoing neighbors by:

```rust
let angle = (neighbor.y_mm - site.y_mm).atan2(neighbor.x_mm - site.x_mm);
angle.total_cmp(&other_angle).then_with(|| neighbor.site_id.cmp(&other.site_id))
```

For directed half-edge `U→V`, find `U` in `V`'s counter-clockwise neighbor list and select the previous entry modulo degree. Walk until the starting half-edge repeats, marking each directed pair in a `BTreeSet<(u32, u32)>`.

Calculate twice-signed area after translating every point by the first point:

```rust
sum += (x_i - x_0) * (y_next - y_0) - (y_i - y_0) * (x_next - x_0);
```

Retain only positive walks. Remove the repeated closing node, rotate each retained face so its smallest site ID is first, preserve its positive orientation, and sort faces lexicographically by `boundary_site_ids`.

- [ ] **Step 7: Run focused Rust checks and commit**

Run: `cargo fmt --all`

Run: `cargo fmt --all -- --check`

Run: `cargo test -p pile-plan-core spatial::gabriel::tests -- --nocapture`

Run: `cargo test -p pile-plan-core spatial::faces::tests -- --nocapture`

Expected: formatting succeeds and all Gabriel/face tests pass.

Commit:

```powershell
git add crates/pile-plan-core/src/spatial.rs crates/pile-plan-core/src/spatial/gabriel.rs crates/pile-plan-core/src/spatial/faces.rs
git commit -m "feat: build Gabriel spatial faces"
```

---

### Task 2: Replace component grouping with Rust-owned unanimous PPN layers

**Files:**
- Modify: `crates/pile-plan-core/src/spatial.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`
- Modify: `crates/pile-plan-wasm/src/lib.rs`
- Modify: `apps/pile-plan-studio/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `SpatialNeighborhood`, `HashMap<u32, SpatialPileAssignment>`, and accepted options by load point.
- Produces: `TipLevelRegionTopology { groups: Vec<TipLevelRegionGroup> }` with sites, site edges, and unanimous faces but no components.

- [ ] **Step 1: Add failing public topology and PPN-classification tests**

Replace the component-oriented fixture expectations with these public DTOs:

```rust
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialSite {
    pub site_id: u32,
    pub load_point_ids: Vec<u32>,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SpatialEdge {
    pub from_site_id: u32,
    pub to_site_id: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SpatialFace {
    pub boundary_site_ids: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialNeighborhood {
    pub sites: Vec<SpatialSite>,
    pub edges: Vec<SpatialEdge>,
    pub faces: Vec<SpatialFace>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TipLevelRegionGroup {
    pub pile_tip_level_m_key: i64,
    pub legend_value_m: f64,
    pub site_ids: Vec<u32>,
    pub edges: Vec<SpatialEdge>,
    pub faces: Vec<SpatialFace>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TipLevelRegionTopology {
    pub groups: Vec<TipLevelRegionGroup>,
}
```

Add tests proving:

- a unanimous triangle returns one face, three sites, and three retained edges;
- one different-PPN triangle vertex leaves `faces` empty while retaining the equal-PPN edge and both relevant node layers;
- an unresolved or `is_option == false` boundary node prevents face fill;
- a regular five-site A ring plus central B and Gabriel spokes does not create one blanket A face;
- two adjacent unanimous faces retain their shared internal edge;
- same-key raw values normalize to one group while `legend_value_m` remains the raw matched value belonging to that key's lowest eligible load-point ID;
- coincident nodes are deduplicated into one rendered site per PPN and differing coincident PPNs create one circle in each layer;
- input map permutation does not change output;
- no `components` field or connected-component traversal remains.

- [ ] **Step 2: Run classification tests and confirm failure**

Run: `cargo test -p pile-plan-core spatial::tests::tip_level -- --nocapture`

Expected: compilation or assertion failure against the old component-oriented DTO.

- [ ] **Step 3: Replace the public spatial and region builders**

Have `build_spatial_neighborhood` expose the internal Gabriel embedding as stable public sites, site edges, and faces. Delete the axis-aligned rectangle blocker and the public load-point Cartesian-product edge expansion.

Resolve every load-point assignment through the existing canonical PPN key and a matching option with `is_option == true`. Build a per-site map of eligible PPN keys:

```rust
BTreeMap<u32, BTreeMap<i64, Vec<u32>>> // site_id -> key -> eligible load_point_ids
```

Then classify:

1. Add a site once to every PPN key present among its eligible nodes.
2. Add a Gabriel site edge once to each PPN key present at both endpoint sites.
3. Add a face only if every load-point ID represented at every boundary site resolves successfully and all resolved keys are identical.
4. Sort `site_ids`, `edges`, and `faces`; sort groups by descending key.
5. Set `legend_value_m` to the matched raw option value for the group's lowest eligible load-point ID. This preserves exact lookup in the existing legend while #29 owns the wider precision policy.

Delete `TipLevelRegionComponent` and `connected_components`. Keep coincident load points mutually represented by their `SpatialSite.load_point_ids`; emit no zero-length visual edge.

- [ ] **Step 4: Update Rust exports and thin adapters**

Export only the revised DTOs from `pile-plan-core/src/lib.rs`. Keep adapter entry-point names unchanged:

```rust
build_spatial_neighborhood(request) -> SpatialNeighborhood
build_tip_level_region_topology(request) -> TipLevelRegionTopology
```

Update the empty adapter fixtures to construct:

```rust
SpatialNeighborhood { sites: vec![], edges: vec![], faces: vec![] }
```

Do not put graph, face, PPN, or eligibility logic in WASM or Tauri.

- [ ] **Step 5: Run Rust, WASM, and Tauri verification**

Run: `cargo fmt --all`

Run: `cargo fmt --all -- --check`

Run: `cargo test --workspace`

Run: `cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml`

Expected: all commands exit 0, including native core, WASM adapter, and Tauri adapter tests.

- [ ] **Step 6: Commit the authoritative Rust topology**

```powershell
git add crates/pile-plan-core/src/spatial.rs crates/pile-plan-core/src/spatial/gabriel.rs crates/pile-plan-core/src/spatial/faces.rs crates/pile-plan-core/src/lib.rs crates/pile-plan-wasm/src/lib.rs apps/pile-plan-studio/src-tauri/src/main.rs
git commit -m "feat: classify unanimous tip-level faces"
```

---

### Task 3: Consume the revised topology and batch SVG subshapes

**Files:**
- Modify: `apps/pile-plan-studio/src/core/spatialTopologyContract.ts`
- Modify: `apps/pile-plan-studio/src/core/spatialTopologyContract.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/tipLevelRegionTopologyController.test.ts`
- Modify: `apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.ts`
- Modify: `apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.test.ts`
- Modify: `apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.ts`
- Modify: `apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/TipLevelRegionOverlay.tsx`
- Regenerate: `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/*`

**Interfaces:**
- Consumes: authoritative Rust `SpatialNeighborhood` and `TipLevelRegionTopology` DTOs.
- Produces: projected face/segment/circle layers and one face path, one edge path, and one node path per rendered PPN group.

- [ ] **Step 1: Update DTO fixtures and write failing geometry tests**

Mirror the Rust DTO exactly in `spatialTopologyContract.ts`:

```ts
export type SpatialSite = {
  site_id: number;
  load_point_ids: number[];
  x_mm: number;
  y_mm: number;
};

export type SpatialEdge = { from_site_id: number; to_site_id: number };
export type SpatialFace = { boundary_site_ids: number[] };
export type SpatialNeighborhood = {
  sites: SpatialSite[];
  edges: SpatialEdge[];
  faces: SpatialFace[];
};

export type TipLevelRegionTopology = {
  groups: Array<{
    pile_tip_level_m_key: number;
    legend_value_m: number;
    site_ids: number[];
    edges: SpatialEdge[];
    faces: SpatialFace[];
  }>;
};
```

Update transport and controller fixtures without changing cache semantics. In `tipLevelRegionGeometry.test.ts`, write failing assertions that standard 100% symbol scale produces `diameterPx == 16.5`, a unanimous face projects all boundary points without rounding, a missing boundary site drops the complete face, and a shared internal edge remains in `segments`.

- [ ] **Step 2: Run focused frontend tests and confirm failure**

From `apps/pile-plan-studio`, run:

```powershell
node --test src/core/spatialTopologyContract.test.ts src/components/domain/tipLevelRegionTopologyController.test.ts src/viewer/tipLevelRegionGeometry.test.ts
```

Expected: geometry and DTO assertions fail against `components` and the old 8 px margin.

- [ ] **Step 3: Implement projected site, face, edge, and circle geometry**

Change `REGION_MARGIN_PX` to `6`. Use `site_id` as the representative load-point ID for coordinate lookup; its exact coordinate equals every load point at that site.

Extend `TipLevelRegionGeometryLayer` with:

```ts
faces: Array<{
  siteIds: number[];
  points: ViewPoint[];
}>;
segments: Array<{
  fromSiteId: number;
  toSiteId: number;
  x1: number; y1: number; x2: number; y2: number;
}>;
circles: Array<{ siteId: number; x: number; y: number; radius: number }>;
```

Skip a complete face when any boundary point is unavailable. Skip an edge when either endpoint is unavailable. Preserve Rust collection order and do not calculate adjacency, PPN equality, or components in TypeScript.

- [ ] **Step 4: Write failing compound-path model tests**

In `tipLevelRegionSvgModel.test.ts`, assert one group with this observable shape:

```ts
assert.deepEqual(model.groups[0], {
  key: "tip-level:-18000",
  color: "#4E79A7",
  opacity: 0.25,
  facePath: { key: "faces:-18000", d: "M 10 10 L 30 10 L 20 30 Z" },
  edgePath: {
    key: "edges:-18000",
    d: "M 10 10 L 30 10",
    strokeWidth: 16.5,
    strokeLinecap: "butt",
  },
  nodePath: {
    key: "nodes:-18000",
    d: "M 1.75 10 A 8.25 8.25 0 1 0 18.25 10 A 8.25 8.25 0 1 0 1.75 10 Z M 21.75 10 A 8.25 8.25 0 1 0 38.25 10 A 8.25 8.25 0 1 0 21.75 10 Z",
  },
});
```

Also assert that two faces and multiple edges remain subpaths of those same three path objects, that empty paths are represented as `null`, and that no per-line or per-circle element arrays remain.

- [ ] **Step 5: Run SVG tests and confirm failure**

Run from `apps/pile-plan-studio`:

```powershell
node --test src/components/domain/tipLevelRegionSvgModel.test.ts src/viewer/tipLevelRegionPresentation.test.ts
```

Expected: assertions fail against the current per-line/per-circle SVG model and round caps.

- [ ] **Step 6: Implement deterministic SVG path batching**

Build path data with small pure helpers:

```ts
function faceSubpath(points: ViewPoint[]): string {
  return points.length < 3
    ? ""
    : `M ${points.map(({ x, y }) => `${x} ${y}`).join(" L ")} Z`;
}

function edgeSubpath(segment: TipLevelRegionSegment): string {
  return `M ${segment.x1} ${segment.y1} L ${segment.x2} ${segment.y2}`;
}

function circleSubpath(circle: TipLevelRegionCircle): string {
  const { x, y, radius } = circle;
  return `M ${x - radius} ${y} A ${radius} ${radius} 0 1 0 ${x + radius} ${y} A ${radius} ${radius} 0 1 0 ${x - radius} ${y} Z`;
}
```

Join non-empty subpaths with one space. `TipLevelRegionOverlay.tsx` renders paths in this exact order inside one `<g opacity={0.25}>`:

1. face path with `fill={color}` and no stroke;
2. edge path with `fill="none"`, `stroke={color}`, `strokeWidth={diameterPx}`, and `strokeLinecap="butt"`;
3. node path with `fill={color}` and no stroke.

Keep `pointer-events: none` through the existing overlay CSS. Do not use `vector-effect`, masks, clipping, polygon union, or per-subshape opacity.

- [ ] **Step 7: Regenerate WASM and run full frontend verification**

From `apps/pile-plan-studio`, run:

```powershell
npm run build:wasm
npm test
npm run build
```

Expected: WASM regeneration, all Node tests, TypeScript compilation, and Vite production build succeed.

- [ ] **Step 8: Commit the frontend topology and SVG migration**

```powershell
git add apps/pile-plan-studio/src/core/spatialTopologyContract.ts apps/pile-plan-studio/src/core/spatialTopologyContract.test.ts apps/pile-plan-studio/src/components/domain/tipLevelRegionTopologyController.test.ts apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.ts apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.test.ts apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.ts apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.test.ts apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.ts apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.test.ts apps/pile-plan-studio/src/components/domain/TipLevelRegionOverlay.tsx apps/pile-plan-studio/src/core/wasm/pile-plan-wasm
git commit -m "feat: render unanimous Gabriel faces"
```

---

### Task 4: Verify the complete experiment in automated and live viewers

**Files:**
- Modify only files implicated by a reproduced verification failure.
- Do not change the approved algorithm or add deferred scope during cleanup.

**Interfaces:**
- Consumes: the completed Rust topology and TypeScript SVG pipeline.
- Produces: verified browser/Tauri-compatible #22 behavior and a clean feature branch.

- [ ] **Step 1: Run repository-wide static and automated checks from a clean state**

Run from the repository root:

```powershell
cargo fmt --all -- --check
cargo test --workspace
cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml
```

Run from `apps/pile-plan-studio`:

```powershell
npm test
npm run build
```

Expected: every command exits 0 with no failing test, Rust formatting error, TypeScript error, or Vite build error.

- [ ] **Step 2: Start or refresh the dedicated 0.3.0 live viewer**

Run from `apps/pile-plan-studio` on the existing feature-viewer port:

```powershell
npm run dev -- --port 4303
```

Use the in-app browser to open `http://127.0.0.1:4303/`. Do not restart or modify any separate 0.2.x viewer.

- [ ] **Step 3: Perform focused visual checks**

With the sample project and the overlay toggle enabled, verify:

- long empty-rectangle-only connections are gone;
- displayed connections match the closed Gabriel Graph;
- single nodes remain circles;
- open chains use butt-capped rectangles joined by node circles;
- bounded unanimous faces are filled;
- adjacent unanimous faces appear continuous while their internal edge remains harmless;
- mixed faces and internal different-PPN topology remain unfilled;
- PPN layers retain 25% opacity and shallow-to-deep ordering;
- marker centers remain exact and marker symbols stay above the overlay;
- selection, hover, pan, zoom, and panel resizing behave unchanged;
- interaction remains responsive on the sample project.

Capture a screenshot for comparison only when it helps diagnose a discrepancy; do not add generated screenshots to the repository.

- [ ] **Step 4: Fix only reproduced regressions with a red-green test**

For each observed defect:

1. add the smallest failing Rust or TypeScript test that reproduces it;
2. run that focused test and confirm failure;
3. implement the minimal correction without changing approved scope;
4. rerun the focused test and the relevant full suite;
5. commit the fix with a defect-specific message.

If no defect is observed, create no cleanup commit.

- [ ] **Step 5: Perform final evidence checks**

Run:

```powershell
git diff --check
git status --short --branch
git log -5 --oneline --decorate
```

Expected: no unstaged or staged implementation changes, no diff-format errors, and the feature branch contains the spec, plan, and implementation commits. Report exact command results and any deliberately deferred observations before offering branch integration or push actions.
