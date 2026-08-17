# Connected Tip-Level Regions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. The user explicitly prohibited subagents, so do not use subagent-driven development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted View-ribbon toggle that renders deterministic, translucent connected PPN regions from Rust-owned spatial topology without affecting viewer interaction.

**Architecture:** `pile-plan-core` builds the empty-rectangle neighbourhood graph, resolves valid assigned PPN keys, and returns connected components through thin WASM/Tauri DTOs. TypeScript starts at that authoritative topology, projects it with the existing viewer transform, generates capsule primitives, applies legend presentation, and renders a pointer-transparent SVG layer.

**Tech Stack:** Rust 2021, Serde, Tauri 2 commands, wasm-bindgen/serde-wasm-bindgen, React 19, TypeScript 6, SVG, Node test runner.

## Global Constraints

- Target branch is `feature/0.3.0-tip-level-regions`; never create a `codex/` branch.
- Use no subagents.
- Keep engineering validity, canonical PPN identity, neighbourhood construction, and connected-component grouping in `pile-plan-core`.
- Keep project-coordinate projection, render geometry, legend presentation, alpha compositing, and SVG in TypeScript.
- Browser and Tauri must call the same Rust implementation through thin adapters.
- The neighbourhood rule is the strict closed smallest axis-aligned rectangle with no margin or tolerance; a point on the boundary blocks the edge.
- Treat coincident load points as one geometric site for blocker checks, connect colocated nodes to each other, and expand site edges deterministically.
- Include only assigned configurations whose matching calculated option has `is_option == true`.
- Use the Rust millimetre key `round(pile_tip_level_m * 1000)` for PPN equality; TypeScript must not implement that equality rule.
- Ignore pile size when grouping #22 regions.
- Render circles and same-PPN edge capsules only; do not fill enclosed faces.
- Region diameter is the rendered load-point marker diameter plus exactly 8 CSS px.
- Apply legend color at exactly 25% opacity once per PPN layer; draw shallow PPN values before deeper values and allow normal alpha mixing.
- Place the overlay above the coordinate grid and below CPT lines, all markers, selection rings, and hover UI; set `pointer-events: none`.
- The project-wide toggle defaults to `false`, uses bilingual UI copy, and persists through IFCPP and IndexedDB browser recovery.
- Do not add opacity, margin, graph-rule, export, optimizer, spatial-index, 1,000-point performance, or bounded-face-fill scope.
- Preserve exact unrounded viewer coordinates and the existing single `.viewer-content` pan/zoom transform.
- Do not perform the wider domain-boundary refactor from issue #30 in this feature.
- Do not bump package or IFCPP schema versions solely for this backward-compatible optional viewer setting.

## File Structure

### Create

- `crates/pile-plan-core/src/spatial.rs` — Rust spatial DTOs, graph builder, eligibility resolution, PPN grouping, and core tests.
- `apps/pile-plan-studio/src/core/spatialTopologyContract.ts` — TypeScript mirrors of Rust DTOs and transport-only parsing of existing selected-option strings.
- `apps/pile-plan-studio/src/core/spatialTopologyContract.test.ts` — DTO conversion tests that prove TypeScript does not normalize PPN identity.
- `apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.ts` — projected circle/segment primitive generation.
- `apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.test.ts` — geometry tests.
- `apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.ts` — legend lookup, opacity, and deterministic layer ordering.
- `apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.test.ts` — presentation tests.
- `apps/pile-plan-studio/src/components/domain/useTipLevelRegionTopology.ts` — asynchronous Rust-call orchestration and stage-specific caching.
- `apps/pile-plan-studio/src/components/domain/tipLevelRegionTopologyController.ts` — framework-independent async orchestration used by the React hook.
- `apps/pile-plan-studio/src/components/domain/tipLevelRegionTopologyController.test.ts` — observable stale-result, caching, and disable-behavior tests with controlled async core dependencies.
- `apps/pile-plan-studio/src/components/domain/TipLevelRegionOverlay.tsx` — SVG-only renderer for presented primitives.
- `apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.ts` — pure SVG element model consumed directly by the renderer.
- `apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.test.ts` — group-opacity, primitive-attribute, order, and stable-key behavior tests.
- `apps/pile-plan-studio/src/components/template/ribbon/tipLevelRegionToggle.ts` — pure label-key and next-value behavior for the ribbon control.
- `apps/pile-plan-studio/src/components/template/ribbon/tipLevelRegionToggle.test.ts` — observable show/hide behavior tests without reading component source.

### Modify

- `crates/pile-plan-core/src/analysis.rs` — expose one crate-internal canonical PPN-key helper to the spatial module.
- `crates/pile-plan-core/src/lib.rs` — register `spatial` and export public spatial DTOs/functions.
- `crates/pile-plan-core/src/project.rs` — persist `show_tip_level_regions` with a `false` default.
- `crates/pile-plan-core/src/ifcpp.rs` — verify legacy/default viewer settings.
- `crates/pile-plan-wasm/src/lib.rs` — add thin spatial graph/topology requests and exports.
- `apps/pile-plan-studio/src-tauri/src/main.rs` — add equivalent thin Tauri commands and register them.
- `apps/pile-plan-studio/src/core/coreClient.ts` — provide runtime-neutral async spatial calls.
- `apps/pile-plan-studio/src/core/projectTypes.ts` — add the viewer setting where the existing viewer-settings type is mirrored.
- `apps/pile-plan-studio/src/core/projectFile.ts` — load/save the optional IFCPP viewer field.
- `apps/pile-plan-studio/src/core/projectFile.test.ts` — legacy default and round-trip tests.
- `apps/pile-plan-studio/src/domain/projectState.ts` — add `showTipLevelRegions` to live project state.
- `apps/pile-plan-studio/src/domain/projectState.test.ts` — load/default tests.
- `apps/pile-plan-studio/src/domain/projectContent.ts` — make the toggle undoable, dirty-trackable project content.
- `apps/pile-plan-studio/src/domain/projectContent.test.ts` — equality/content tests.
- `apps/pile-plan-studio/src/domain/browserRecoveryStartup.test.ts` — explicit IndexedDB recovery round-trip assertion for the new viewer setting.
- `apps/pile-plan-studio/src/viewer/hoverCandidates.ts` — export the existing marker-base size through a shared visual-size helper if required by geometry.
- `apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx` — orchestrate topology, project points once, and insert the overlay at the required layer.
- `apps/pile-plan-studio/src/components/domain/viewer.css` — SVG overlay positioning and non-interaction styles.
- `apps/pile-plan-studio/src/components/template/ribbon/icons.ts` — add a small regions icon.
- `apps/pile-plan-studio/src/components/template/ribbon/Ribbon.tsx` — add toggle props and View-ribbon button.
- `apps/pile-plan-studio/src/App.tsx` — wire state and the project-content change handler to the ribbon.
- `apps/pile-plan-studio/src/i18n/locales/en/ribbon.json` — English show/hide labels.
- `apps/pile-plan-studio/src/i18n/locales/nl/ribbon.json` — Dutch show/hide labels.
- `apps/pile-plan-studio/src/components/domain/WorkspaceTranslations.test.ts` — bilingual copy assertions.

---

### Task 1: Build the deterministic Rust neighbourhood graph

**Files:**
- Create: `crates/pile-plan-core/src/spatial.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**
- Consumes: `analysis::LoadPoint { id, x_mm, y_mm, .. }`
- Produces: `SpatialNode`, `SpatialEdge`, `SpatialNeighborhood`, and `build_spatial_neighborhood(load_points: &[LoadPoint]) -> SpatialNeighborhood`

- [ ] **Step 1: Write failing graph fixtures in `spatial.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn point(id: u32, x_mm: f64, y_mm: f64) -> LoadPoint {
        LoadPoint { id, name: format!("LP {id}"), x_mm, y_mm, design_load_kn: 100.0 }
    }

    fn pairs(graph: &SpatialNeighborhood) -> Vec<(u32, u32)> {
        graph.edges.iter().map(|edge| (edge.from_load_point_id, edge.to_load_point_id)).collect()
    }

    #[test]
    fn middle_collinear_point_blocks_the_long_edge() {
        let graph = build_spatial_neighborhood(&[
            point(3, 2.0, 0.0), point(1, 0.0, 0.0), point(2, 1.0, 0.0),
        ]);
        assert_eq!(pairs(&graph), vec![(1, 2), (2, 3)]);
    }

    #[test]
    fn closed_rectangle_grid_has_perimeter_edges_without_diagonals() {
        let graph = build_spatial_neighborhood(&[
            point(1, 0.0, 0.0), point(2, 1.0, 0.0),
            point(3, 1.0, 1.0), point(4, 0.0, 1.0),
        ]);
        assert_eq!(pairs(&graph), vec![(1, 2), (1, 4), (2, 3), (3, 4)]);
    }

    #[test]
    fn boundary_point_blocks_an_edge() {
        let graph = build_spatial_neighborhood(&[
            point(1, 0.0, 0.0), point(2, 2.0, 1.0), point(3, 1.0, 0.0),
        ]);
        assert!(!pairs(&graph).contains(&(1, 2)));
    }

    #[test]
    fn coincident_sites_stay_connected_to_each_other_and_other_sites() {
        let graph = build_spatial_neighborhood(&[
            point(1, 0.0, 0.0), point(2, 0.0, 0.0), point(3, 1.0, 0.0),
        ]);
        assert_eq!(pairs(&graph), vec![(1, 2), (1, 3), (2, 3)]);
    }
}
```

- [ ] **Step 2: Run the focused core test and confirm the red state**

Run: `cargo test -p pile-plan-core spatial::tests -- --nocapture`

Expected: compilation fails because `SpatialNeighborhood` and `build_spatial_neighborhood` do not exist.

- [ ] **Step 3: Implement stable DTOs and the direct pairwise builder**

```rust
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialNode {
    pub load_point_id: u32,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SpatialEdge {
    pub from_load_point_id: u32,
    pub to_load_point_id: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialNeighborhood {
    pub nodes: Vec<SpatialNode>,
    pub edges: Vec<SpatialEdge>,
}

pub fn build_spatial_neighborhood(load_points: &[LoadPoint]) -> SpatialNeighborhood;
```

Implement it with this exact direct algorithm:

1. Copy nodes and sort them by `load_point_id`.
2. Partition nodes into geometric sites by exact `(x_mm, y_mm)` equality and sort each site's IDs.
3. Insert every unordered ID pair within one site into a `BTreeSet<(u32, u32)>`.
4. For every unordered pair of distinct sites, compute inclusive `min_x..=max_x` and `min_y..=max_y`. Reject that site pair if any third site lies inside or on that rectangle.
5. For every accepted site pair, insert the Cartesian product of their node-ID lists as normalized `(min_id, max_id)` edges.
6. Return the sorted nodes and the already sorted, deduplicated edges from the `BTreeSet`.

Do not introduce a spatial index, tolerance, or distance rule. Add a local BFS/DFS assertion helper only inside tests and verify the one-node, two-node, plus-shape, input-permutation, and connected-graph fixtures from the design spec.

- [ ] **Step 4: Register the module and public exports**

Add to `crates/pile-plan-core/src/lib.rs`:

```rust
pub mod spatial;
pub use spatial::{
    build_spatial_neighborhood, SpatialEdge, SpatialNeighborhood, SpatialNode,
};
```

- [ ] **Step 5: Run focused and workspace Rust tests**

Run: `cargo test -p pile-plan-core spatial::tests -- --nocapture`

Expected: all spatial graph fixtures pass.

Run: `cargo test --workspace`

Expected: all workspace tests pass.

- [ ] **Step 6: Commit the graph builder**

```powershell
git add crates/pile-plan-core/src/spatial.rs crates/pile-plan-core/src/lib.rs
git commit -m "feat: add spatial neighbourhood graph"
```

---

### Task 2: Resolve valid PPN assignments and connected components in Rust

**Files:**
- Modify: `crates/pile-plan-core/src/spatial.rs`
- Modify: `crates/pile-plan-core/src/analysis.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**
- Consumes: `SpatialNeighborhood`, `HashMap<u32, SpatialPileAssignment>`, and `HashMap<u32, Vec<PileConfigurationOption>>`
- Produces: `TipLevelRegionTopology` and `build_tip_level_region_topology(...) -> TipLevelRegionTopology`

- [ ] **Step 1: Add failing topology tests**

Define fixtures using these public DTOs:

```rust
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialPileAssignment {
    pub pile_size_mm: u32,
    pub pile_tip_level_m: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TipLevelRegionComponent {
    pub load_point_ids: Vec<u32>,
    pub edges: Vec<SpatialEdge>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TipLevelRegionGroup {
    pub pile_tip_level_m_key: i64,
    pub legend_value_m: f64,
    pub components: Vec<TipLevelRegionComponent>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TipLevelRegionTopology {
    pub groups: Vec<TipLevelRegionGroup>,
}
```

Put these tests in a nested `mod tip_level` so the focused test filter below is stable. Write tests that assert:

```rust
assert_eq!(topology.groups[0].pile_tip_level_m_key, -18_000);
assert_eq!(topology.groups[0].components[0].load_point_ids, vec![1, 2, 3]);
assert_eq!(topology.groups[0].components[0].edges.len(), 2);
```

Also assert that an unassigned node, `is_option == false`, a missing option, and a size mismatch are excluded; two raw values that normalize to the same millimetre key group together; different keys split components; and output is stable after input-map permutation.

- [ ] **Step 2: Run the topology tests and confirm they fail**

Run: `cargo test -p pile-plan-core spatial::tests::tip_level -- --nocapture`

Expected: compilation fails because the topology DTOs and builder do not exist.

- [ ] **Step 3: Establish one crate-internal PPN key helper**

Rename the private helper in `analysis.rs` and update its existing call sites:

```rust
pub(crate) fn pile_tip_level_key(pile_tip_level_m: f64) -> i64 {
    (pile_tip_level_m * 1000.0).round() as i64
}
```

Do not expose or duplicate this formula in TypeScript as part of #22.

- [ ] **Step 4: Implement validity resolution and grouping**

Add:

```rust
pub fn build_tip_level_region_topology(
    neighborhood: &SpatialNeighborhood,
    selected_assignments: &HashMap<u32, SpatialPileAssignment>,
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
) -> TipLevelRegionTopology
```

For each neighbourhood node, resolve the selected assignment against an option with equal pile size and equal `pile_tip_level_key`. Include the node only when that option exists and `is_option` is true. Use the matched option's raw `pile_tip_level_m` as the group's stable `legend_value_m`, choosing the value belonging to the group's lowest load-point ID. Retain equal-key edges, traverse connected components, sort IDs and edges, sort components by minimum ID, and sort groups shallow-to-deep by descending key.

- [ ] **Step 5: Export the topology contract from `lib.rs`**

```rust
pub use spatial::{
    build_spatial_neighborhood, build_tip_level_region_topology,
    SpatialEdge, SpatialNeighborhood, SpatialNode, SpatialPileAssignment,
    TipLevelRegionComponent, TipLevelRegionGroup, TipLevelRegionTopology,
};
```

- [ ] **Step 6: Run Rust tests and formatting**

Run: `cargo fmt --all -- --check`

Expected: exit code 0.

Run: `cargo test --workspace`

Expected: all tests pass, including invalid/unassigned/group split/merge cases.

- [ ] **Step 7: Commit Rust topology**

```powershell
git add crates/pile-plan-core/src/spatial.rs crates/pile-plan-core/src/analysis.rs crates/pile-plan-core/src/lib.rs
git commit -m "feat: group valid tip-level regions in core"
```

---

### Task 3: Expose thin WASM, Tauri, and TypeScript topology contracts

**Files:**
- Modify: `crates/pile-plan-wasm/src/lib.rs`
- Modify: `apps/pile-plan-studio/src-tauri/src/main.rs`
- Create: `apps/pile-plan-studio/src/core/spatialTopologyContract.ts`
- Create: `apps/pile-plan-studio/src/core/spatialTopologyContract.test.ts`
- Modify: `apps/pile-plan-studio/src/core/coreClient.ts`

**Interfaces:**
- Consumes: the Task 1/2 Rust functions and DTOs
- Produces: `buildSpatialNeighborhoodCore(...)` and `buildTipLevelRegionTopologyCore(...)`

- [ ] **Step 1: Write failing TypeScript transport tests**

```ts
import { parseSpatialPileAssignments } from "./spatialTopologyContract.ts";

it("parses existing selection strings without normalizing PPN identity", () => {
  assert.deepEqual(
    parseSpatialPileAssignments(new Map([[7, "320|-18.0004"], [8, "bad"]])),
    new Map([[7, { pile_size_mm: 320, pile_tip_level_m: -18.0004 }]]),
  );
});
```

Also test pure `toBrowserTipLevelRegionTopologyRequest` and `toDesktopTipLevelRegionTopologyRequest` payload builders with literal expected objects. These tests catch dropped IDs, wrong map-key serialization, or raw PPN mutation without tying tests to function source text.

- [ ] **Step 2: Run the focused frontend tests and confirm failure**

Run from `apps/pile-plan-studio`: `node --test src/core/spatialTopologyContract.test.ts`

Expected: module/function-not-found failure.

- [ ] **Step 3: Define exact TypeScript DTO mirrors and transport parser**

```ts
export type SpatialEdge = {
  from_load_point_id: number;
  to_load_point_id: number;
};

export type SpatialNeighborhood = {
  nodes: Array<{ load_point_id: number; x_mm: number; y_mm: number }>;
  edges: SpatialEdge[];
};

export type SpatialPileAssignment = {
  pile_size_mm: number;
  pile_tip_level_m: number;
};

export type TipLevelRegionTopology = {
  groups: Array<{
    pile_tip_level_m_key: number;
    legend_value_m: number;
    components: Array<{ load_point_ids: number[]; edges: SpatialEdge[] }>;
  }>;
};
```

`parseSpatialPileAssignments` may split the existing `size|tip` transport string and reject non-finite values. It must preserve the raw parsed PPN and must not round or compare it.

Keep the browser/desktop request conversion functions in this contract module. `coreClient.ts` selects a runtime and forwards their returned payload; it does not own map conversion or spatial rules.

- [ ] **Step 4: Add thin WASM exports**

Add request structs and exports:

```rust
#[derive(Debug, Deserialize)]
pub struct SpatialNeighborhoodRequest { pub load_points: Vec<ProjectLoadPoint> }

#[derive(Debug, Deserialize)]
pub struct TipLevelRegionTopologyRequest {
    pub neighborhood: SpatialNeighborhood,
    pub selected_assignments: HashMap<u32, SpatialPileAssignment>,
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
}
```

`build_spatial_neighborhood` and `build_tip_level_region_topology` wasm-bindgen exports must only deserialize, call the core function, and serialize.

Alias the imported core functions as `build_spatial_neighborhood_core` and `build_tip_level_region_topology_core`; this avoids name collisions with the public wasm-bindgen export names while keeping the adapter bodies visibly thin. Apply the same import-alias pattern in Tauri.

- [ ] **Step 5: Add equivalent Tauri commands**

Use the same request fields and return DTOs. Register both commands in `tauri::generate_handler!`. Do not add graph or grouping logic to `main.rs`.

- [ ] **Step 6: Add runtime-neutral `coreClient` functions**

```ts
export async function buildSpatialNeighborhoodCore(
  loadPoints: LoadPoint[],
): Promise<SpatialNeighborhood>

export async function buildTipLevelRegionTopologyCore(input: {
  neighborhood: SpatialNeighborhood;
  selectedAssignments: Map<number, SpatialPileAssignment>;
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>;
}): Promise<TipLevelRegionTopology>
```

Use `toWasmNumberKeyedMap` for browser maps and `toStringKeyedRecord` for Tauri maps, matching existing `coreClient.ts` patterns.

- [ ] **Step 7: Rebuild WASM and run adapter tests**

Run from `apps/pile-plan-studio`: `npm run build:wasm`

Expected: both new wasm exports appear in generated bindings.

Run from repository root: `cargo test --workspace`

Run: `cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml`

Run from `apps/pile-plan-studio`: `npm test`

Expected: all commands exit successfully.

- [ ] **Step 8: Commit adapters and contracts**

```powershell
git add crates/pile-plan-wasm/src/lib.rs apps/pile-plan-studio/src-tauri/src/main.rs apps/pile-plan-studio/src/core/spatialTopologyContract.ts apps/pile-plan-studio/src/core/spatialTopologyContract.test.ts apps/pile-plan-studio/src/core/coreClient.ts
git commit -m "feat: expose spatial topology to the viewer"
```

---

### Task 4: Persist the project-wide region visibility setting

**Files:**
- Modify: `crates/pile-plan-core/src/project.rs`
- Modify: `crates/pile-plan-core/src/ifcpp.rs`
- Modify: `apps/pile-plan-studio/src/core/projectTypes.ts`
- Modify: `apps/pile-plan-studio/src/core/projectFile.ts`
- Modify: `apps/pile-plan-studio/src/core/projectFile.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectState.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectState.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectContent.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectContent.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/browserRecoveryStartup.test.ts`

**Interfaces:**
- Produces: project content field `showTipLevelRegions: boolean` and IFCPP field `settings.viewer.show_tip_level_regions`

- [ ] **Step 1: Write failing Rust legacy/default tests**

```rust
assert!(!ProjectViewerSettings::default().show_tip_level_regions);

let mut value = serde_json::to_value(sample_project()).unwrap();
value["settings"]["viewer"].as_object_mut().unwrap().remove("show_tip_level_regions");
let restored: PilePlanProject = serde_json::from_value(value).unwrap();
assert!(!restored.settings.viewer.show_tip_level_regions);
```

- [ ] **Step 2: Write failing TypeScript project round-trip tests**

Extend `projectFile.test.ts` to assert that a missing field loads as `false`, a saved `true` value writes `show_tip_level_regions: true`, and save/reload preserves it. Extend `projectContent.test.ts` so changing only this field makes project content unequal and therefore undoable/dirty-trackable. Extend the valid-record case in `browserRecoveryStartup.test.ts`: create a recovery record whose serialized IFCPP has `show_tip_level_regions: true`, restore it through `loadBrowserRecovery`, and assert `result.project.showTipLevelRegions === true`.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `cargo test -p pile-plan-core project::tests -- --nocapture`

Run: `cargo test -p pile-plan-core ifcpp::tests -- --nocapture`

Run from `apps/pile-plan-studio`: `node --test src/core/projectFile.test.ts src/domain/projectState.test.ts src/domain/projectContent.test.ts src/domain/browserRecoveryStartup.test.ts`

Expected: field-not-found or assertion failures.

- [ ] **Step 4: Add the backward-compatible Rust field**

```rust
pub struct ProjectViewerSettings {
    // existing fields
    #[serde(default)]
    pub show_tip_level_regions: bool,
}
```

Set it to `false` in `Default`. Update explicit Rust fixtures without changing `schema_version`.

- [ ] **Step 5: Thread the TypeScript field through load/save/state/content**

Add `show_tip_level_regions?: boolean` to `IfcppViewerSettings`, `showTipLevelRegions: boolean` to loaded/save input and `ProjectState`, return `settings?.show_tip_level_regions === true` from `normalizeProjectViewerSettings`, and serialize the exact boolean. Add the field to `PROJECT_CONTENT_KEYS`.

- [ ] **Step 6: Verify IFCPP and browser-recovery behavior**

Run: `cargo test --workspace`

Run from `apps/pile-plan-studio`: `npm test`

Expected: legacy projects default off, IFCPP round-trip passes, and the explicit IndexedDB recovery test restores `showTipLevelRegions === true` from serialized project content.

- [ ] **Step 7: Commit persistence**

```powershell
git add crates/pile-plan-core/src/project.rs crates/pile-plan-core/src/ifcpp.rs apps/pile-plan-studio/src/core/projectTypes.ts apps/pile-plan-studio/src/core/projectFile.ts apps/pile-plan-studio/src/core/projectFile.test.ts apps/pile-plan-studio/src/domain/projectState.ts apps/pile-plan-studio/src/domain/projectState.test.ts apps/pile-plan-studio/src/domain/projectContent.ts apps/pile-plan-studio/src/domain/projectContent.test.ts apps/pile-plan-studio/src/domain/browserRecoveryStartup.test.ts
git commit -m "feat: persist tip-level region visibility"
```

---

### Task 5: Generate projected capsule geometry and presentation in TypeScript

**Files:**
- Create: `apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.ts`
- Create: `apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.test.ts`
- Create: `apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.ts`
- Create: `apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.test.ts`
- Modify: `apps/pile-plan-studio/src/viewer/hoverCandidates.ts`

**Interfaces:**
- Consumes: Rust `TipLevelRegionTopology`, projected positions, symbol scale, and `LegendItems`
- Produces: `PresentedTipLevelRegionLayer[]` containing only circles, segments, color, opacity, and stable order

- [ ] **Step 1: Write failing geometry tests**

```ts
const topology: TipLevelRegionTopology = {
  groups: [{
    pile_tip_level_m_key: -18000,
    legend_value_m: -18,
    components: [{
      load_point_ids: [1, 2],
      edges: [{ from_load_point_id: 1, to_load_point_id: 2 }],
    }],
  }],
};

const geometry = buildTipLevelRegionGeometry({
  topology,
  pointsByLoadPointId: new Map([[1, { x: 10, y: 20 }], [2, { x: 30, y: 20 }]]),
  symbolScalePercent: 100,
});

assert.equal(geometry[0].diameterPx, 14 * 0.75 + 8);
assert.deepEqual(geometry[0].circles.map(({ x, y }) => ({ x, y })), [{ x: 10, y: 20 }, { x: 30, y: 20 }]);
assert.equal(geometry[0].segments.length, 1);
```

Also test an isolated node, missing projected endpoint exclusion, deterministic component order, and absence of any polygon/path primitive.

- [ ] **Step 2: Write failing presentation tests**

Test `presentTipLevelRegionGeometry` with `-10`, `-15`, and `-20` layers. Assert order `[-10, -15, -20]`, exact legend colors, `opacity === 0.25`, and omission of a layer whose `legend_value_m` has no matching legend item.

- [ ] **Step 3: Run focused tests and confirm failure**

Run from `apps/pile-plan-studio`: `node --test src/viewer/tipLevelRegionGeometry.test.ts src/viewer/tipLevelRegionPresentation.test.ts`

Expected: module/function-not-found failure.

- [ ] **Step 4: Export one marker-size source of truth**

In `hoverCandidates.ts`, retain `SYMBOL_BASE_SCALE = 0.75` and export:

```ts
export const LOAD_POINT_MARKER_BASE_PX = 14;

export function loadPointMarkerDiameter(symbolScalePercent: number): number {
  return LOAD_POINT_MARKER_BASE_PX * effectiveSymbolScale(symbolScalePercent);
}
```

The region builder adds 8 px to this returned diameter. Do not apply viewport zoom in geometry.

- [ ] **Step 5: Implement pure geometry DTOs and builder**

```ts
export type TipLevelRegionGeometryLayer = {
  pileTipLevelMKey: number;
  legendValueM: number;
  diameterPx: number;
  circles: Array<{ loadPointId: number; x: number; y: number; radius: number }>;
  segments: Array<{ fromLoadPointId: number; toLoadPointId: number; x1: number; y1: number; x2: number; y2: number }>;
};
```

Generate only circles and segments from the Rust topology. Do not reconstruct graph adjacency, components, PPN equality, validity, or enclosed faces.

- [ ] **Step 6: Implement presentation as a separate pure function**

```ts
export type PresentedTipLevelRegionLayer = TipLevelRegionGeometryLayer & {
  color: string;
  opacity: 0.25;
};
```

Lookup color with the exact Rust-provided `legendValueM`, omit unresolved styles, and sort numerically descending by `legendValueM` so increasingly negative PPNs render later.

- [ ] **Step 7: Run focused and full TypeScript tests**

Run from `apps/pile-plan-studio`: `node --test src/viewer/tipLevelRegionGeometry.test.ts src/viewer/tipLevelRegionPresentation.test.ts`

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 8: Commit geometry and presentation**

```powershell
git add apps/pile-plan-studio/src/viewer/hoverCandidates.ts apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.ts apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.test.ts apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.ts apps/pile-plan-studio/src/viewer/tipLevelRegionPresentation.test.ts
git commit -m "feat: build tip-level region primitives"
```

---

### Task 6: Orchestrate cached, stale-safe topology requests

**Files:**
- Create: `apps/pile-plan-studio/src/components/domain/useTipLevelRegionTopology.ts`
- Create: `apps/pile-plan-studio/src/components/domain/tipLevelRegionTopologyController.ts`
- Create: `apps/pile-plan-studio/src/components/domain/tipLevelRegionTopologyController.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx`

**Interfaces:**
- Consumes: Task 3 core calls and current `ProjectState`
- Produces: `TipLevelRegionTopology | null` for the active, last-completed request

- [ ] **Step 1: Write failing observable orchestration tests**

Define deferred fake implementations of these real dependency boundaries:

```ts
type SpatialTopologyDependencies = {
  buildNeighborhood: typeof buildSpatialNeighborhoodCore;
  buildTopology: typeof buildTipLevelRegionTopologyCore;
};
```

Exercise `createTipLevelRegionTopologyController` against those controlled promises and assert observable emissions: the newer result wins when requests finish out of order, the completed old topology remains visible until its replacement resolves, `disable()` emits `null`, changed assignments reuse the completed neighborhood, and changed load-point coordinates request a new neighborhood. The controller API contains no viewport input, so viewport changes cannot invalidate topology.

- [ ] **Step 2: Run the focused test and confirm failure**

Run from `apps/pile-plan-studio`: `node --test src/components/domain/tipLevelRegionTopologyController.test.ts`

Expected: module/function-not-found failure.

- [ ] **Step 3: Implement the framework-independent controller, then the thin hook**

The controller owns request generations, the cached completed neighborhood, and result installation. Its `update(input)` method starts only the stages whose input keys changed; `disable()` invalidates in-flight generations and emits `null`; `subscribe(listener)` returns an unsubscribe function. It accepts the two async core dependencies as constructor arguments so tests control completion order without mocking Rust behavior.

The React hook creates one controller instance, subscribes to it, calls `update` from an effect, and calls `disable` when disabled/unmounted:

```ts
export function useTipLevelRegionTopology(input: {
  enabled: boolean;
  loadPoints: LoadPoint[];
  selectedPileOptionKeysByLoadPoint: Map<number, string>;
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
}): TipLevelRegionTopology | null
```

Parse transport assignments with `parseSpatialPileAssignments`. Reject stale results by generation before emission. Log unexpected core failures with `console.error`; do not throw into rendering.

- [ ] **Step 4: Integrate the hook without rendering SVG yet**

Call the hook in `PilePlanViewer` using `state.showTipLevelRegions`, `state.loadPoints`, `state.selectedPileOptionKeysByLoadPoint`, and `state.pileOptionsByLoadPointId`. Add a pure `projectTipLevelRegionPoints` helper to `tipLevelRegionGeometry.ts`, test it against literal fractional project coordinates and the existing `projectPointPixels` transform, and memoize its returned `Map<number, ViewPoint>` using the fixed `projectTransform`. Derive geometry and presentation from the completed topology.

Do not include `state.viewport` in graph, topology, geometry, or presentation dependencies.

- [ ] **Step 5: Run focused and full frontend tests**

Run from `apps/pile-plan-studio`: `node --test src/components/domain/tipLevelRegionTopologyController.test.ts src/components/domain/PilePlanViewer.test.ts`

Run: `npm test`

Expected: stale-result and no-viewport-recalculation contracts pass.

- [ ] **Step 6: Commit orchestration**

```powershell
git add apps/pile-plan-studio/src/components/domain/useTipLevelRegionTopology.ts apps/pile-plan-studio/src/components/domain/tipLevelRegionTopologyController.ts apps/pile-plan-studio/src/components/domain/tipLevelRegionTopologyController.test.ts apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.ts apps/pile-plan-studio/src/viewer/tipLevelRegionGeometry.test.ts
git commit -m "feat: orchestrate tip-level region topology"
```

---

### Task 7: Render the non-interactive SVG overlay at the correct viewer layer

**Files:**
- Create: `apps/pile-plan-studio/src/components/domain/TipLevelRegionOverlay.tsx`
- Create: `apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.ts`
- Create: `apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/viewer.css`

**Interfaces:**
- Consumes: `PresentedTipLevelRegionLayer[]` and fixed canvas width/height
- Produces: one SVG group per PPN with one group-level opacity

- [ ] **Step 1: Write failing SVG-model behavior tests**

Call `buildTipLevelRegionSvgModel` with literal presented layers and assert the returned model has this observable structure:

```ts
{
  className: "tip-level-region-overlay",
  ariaHidden: true,
  groups: [{ fill: "#...", stroke: "#...", opacity: 0.25, lines: [...], circles: [...] }],
}
```

Assert `opacity` is absent from individual circles and lines, line `strokeWidth` equals `diameterPx`, line caps and joins are `round`, lines precede circles in the primitive sequence, and stable keys use normalized endpoint IDs.

- [ ] **Step 2: Run the renderer test and confirm failure**

Run from `apps/pile-plan-studio`: `node --test src/components/domain/tipLevelRegionSvgModel.test.ts`

Expected: file/module-not-found failure.

- [ ] **Step 3: Implement the pure model and SVG-only component**

Build the tested model without React or DOM dependencies. Have `TipLevelRegionOverlay.tsx` map that model directly to SVG groups, lines, and circles. Use the actual canvas width/height and `viewBox={`0 0 ${width} ${height}`}`. Render no polygon, path, mask, clip path, or filter. TypeScript compilation plus the live review verifies the thin JSX mapping; all attribute decisions reside in the tested model.

- [ ] **Step 4: Add CSS that preserves viewer invariants**

```css
.tip-level-region-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
```

Do not add another CSS transform, `will-change`, integer rounding, percentages for marker positions, or `vector-effect: non-scaling-stroke`.

- [ ] **Step 5: Insert the overlay before CPT connection lines**

Inside `.viewer-content`, render `TipLevelRegionOverlay` immediately before `.cpt-connection-lines`. This DOM order puts the overlay above the external coordinate grid and below CPT lines and all subsequent markers.

- [ ] **Step 6: Run viewer and frontend tests**

Run from `apps/pile-plan-studio`: `node --test src/components/domain/tipLevelRegionSvgModel.test.ts src/components/domain/PilePlanViewer.test.ts src/viewer/viewerGeometry.test.ts src/viewer/viewport.test.ts`

Run: `npm test`

Expected: all tests pass and existing projection tests remain unchanged.

- [ ] **Step 7: Commit the overlay**

```powershell
git add apps/pile-plan-studio/src/components/domain/TipLevelRegionOverlay.tsx apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.ts apps/pile-plan-studio/src/components/domain/tipLevelRegionSvgModel.test.ts apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx apps/pile-plan-studio/src/components/domain/viewer.css
git commit -m "feat: render connected tip-level regions"
```

---

### Task 8: Add the bilingual persisted View-ribbon toggle

**Files:**
- Modify: `apps/pile-plan-studio/src/components/template/ribbon/icons.ts`
- Modify: `apps/pile-plan-studio/src/components/template/ribbon/Ribbon.tsx`
- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/ribbon.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/ribbon.json`
- Modify: `apps/pile-plan-studio/src/components/domain/WorkspaceTranslations.test.ts`

**Interfaces:**
- Consumes: `ProjectState.showTipLevelRegions`
- Produces: ribbon callback that updates project content through the existing history/dirty-state path

- [ ] **Step 1: Write failing toggle-behavior and translation tests**

Test a pure helper with literal expected results:

```ts
assert.deepEqual(getTipLevelRegionToggle(false), {
  labelKey: "view.showTipLevelRegions",
  nextVisible: true,
});
assert.deepEqual(getTipLevelRegionToggle(true), {
  labelKey: "view.hideTipLevelRegions",
  nextVisible: false,
});
```

Assert English values are `Show tip-level regions` / `Hide tip-level regions` and Dutch values are `PPN-gebieden tonen` / `PPN-gebieden verbergen`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run from `apps/pile-plan-studio`: `node --test src/components/template/ribbon/tipLevelRegionToggle.test.ts src/components/domain/WorkspaceTranslations.test.ts`

Expected: module/function-not-found and translation assertions fail.

- [ ] **Step 3: Add a dedicated regions icon and View button**

Add an icon showing two connected circular regions. Add `showTipLevelRegions` and `onTipLevelRegionVisibilityChange` props to `Ribbon`. In the View tab, add a `RibbonGroup` adjacent to the existing Grid group, consume the tested helper, and render:

```tsx
<RibbonButton
  icon={regionsIcon}
  label={t(toggle.labelKey)}
  onClick={() => onTipLevelRegionVisibilityChange(toggle.nextVisible)}
/>
```

- [ ] **Step 4: Wire `App.tsx` through project content history**

Pass the boolean into `Ribbon` and update it with the same `handleProjectStateChange` path used by `showGrid`:

```tsx
onTipLevelRegionVisibilityChange={(showTipLevelRegions) => handleProjectStateChange({
  ...projectState,
  showTipLevelRegions,
})}
```

- [ ] **Step 5: Run focused and full tests**

Run from `apps/pile-plan-studio`: `node --test src/components/template/ribbon/tipLevelRegionToggle.test.ts src/components/domain/WorkspaceTranslations.test.ts src/core/projectFile.test.ts src/domain/projectContent.test.ts`

Run: `npm test`

Expected: default-off, bilingual, dirty/history, IFCPP, and browser-recovery paths pass.

- [ ] **Step 6: Commit the toggle**

```powershell
git add apps/pile-plan-studio/src/components/template/ribbon/icons.ts apps/pile-plan-studio/src/components/template/ribbon/Ribbon.tsx apps/pile-plan-studio/src/components/template/ribbon/tipLevelRegionToggle.ts apps/pile-plan-studio/src/components/template/ribbon/tipLevelRegionToggle.test.ts apps/pile-plan-studio/src/App.tsx apps/pile-plan-studio/src/i18n/locales/en/ribbon.json apps/pile-plan-studio/src/i18n/locales/nl/ribbon.json apps/pile-plan-studio/src/components/domain/WorkspaceTranslations.test.ts
git commit -m "feat: toggle connected tip-level regions"
```

---

### Task 9: Complete cross-runtime verification and live-viewer review

**Files:**
- Modify only files required to fix failures found by the commands below.
- Do not add bounded-face fill, overlap handling, performance indexing, export, or optimizer integration during verification.

**Interfaces:**
- Consumes: all previous tasks
- Produces: verified browser and desktop behavior for the approved experiment

- [ ] **Step 1: Run formatting and all Rust tests**

Run:

```powershell
cargo fmt --all -- --check
cargo test --workspace
cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml
```

Expected: all commands exit 0 with no failed tests.

- [ ] **Step 2: Run all frontend tests and production build**

Run from `apps/pile-plan-studio`:

```powershell
npm test
npm run build
```

Expected: all Node tests pass; WASM generation, TypeScript compilation, and Vite production build complete successfully.

- [ ] **Step 3: Verify focused geometry evidence, then review the integrated browser rendering**

First rerun the focused unit fixtures, which are the reproducible evidence for exact synthetic coordinates:

```powershell
node --test src/viewer/tipLevelRegionGeometry.test.ts src/viewer/tipLevelRegionPresentation.test.ts src/components/domain/tipLevelRegionSvgModel.test.ts
```

The fixtures must prove:

1. Isolated valid assignment: one translucent circle.
2. A–B–C equal PPN: one visually continuous capsule chain.
3. Four-node rectangle: four capsule sides with the center deliberately unfilled.
4. Two-PPN plus: crossing translucent capsules mix colors in the center, with deeper PPN composed last.

Then run from `apps/pile-plan-studio`: `npm run dev`. Open the existing sample project and visually confirm that the real integrated overlay uses the same circle/capsule styling, legend colors, fixed opacity, and layer order. Do not add a committed fixture generator solely for this review.

- [ ] **Step 4: Verify state changes and interaction invariants**

In the sample project, verify:

- toggle defaults off for an older project;
- enabling it persists after IFCPP save/reopen and browser recovery;
- changing one and multiple assignments updates regions only after the accepted result is ready;
- switching active pile plans preserves visibility and replaces topology;
- legend color changes recolor without rebuilding graph topology;
- marker click, Shift+click, lasso, hover cycling, CPT selection, pan, cursor-centred zoom, splitter movement, and panel hide/show behave exactly as before;
- no bounded-face fill appears;
- no visible pan/zoom lag is introduced on the 328-load-point sample.

- [ ] **Step 5: Verify desktop parity**

Run from `apps/pile-plan-studio`: `npm run tauri dev`

Repeat toggle, assignment change, pan/zoom, overlap, and persistence checks at the same nominal application scale. Confirm geometry matches the browser for the same project viewport.

- [ ] **Step 6: Review scope and repository state**

Run:

```powershell
git diff --check
git status --short
git log --oneline --decorate -12
```

Confirm every changed product file belongs to Tasks 1–8 or a directly evidenced verification fix. Confirm no face polygons, spatial index, optimizer dependency, export path, new dependency, or schema-version bump entered the diff.

- [ ] **Step 7: Commit only evidenced verification fixes**

If Step 1–6 required fixes, stage the exact affected files and commit:

```powershell
git commit -m "fix: finalize tip-level region integration"
```

If no files changed, do not create an empty commit.

---

## Execution Checkpoints

- Checkpoint A after Task 2: review Rust graph/topology semantics before adding adapters.
- Checkpoint B after Task 4: review cross-runtime DTOs and persistence before viewer work.
- Checkpoint C after Task 7: inspect the live SVG overlay before adding final ribbon polish.
- Checkpoint D after Task 9: review verification evidence and the final diff before any push or PR.

## Deferred Follow-ups

- Fill bounded same-PPN faces by adding polygon primitives in the geometry stage.
- Evaluate and redesign overlap policy in presentation.
- Compare alternative neighbourhood graphs without changing viewer integration.
- Use Rust topology and component counts when designing #21.
- Execute issue #30 as a separate phased core-consolidation effort.
- Resolve canonical PPN display precision under issue #29.
