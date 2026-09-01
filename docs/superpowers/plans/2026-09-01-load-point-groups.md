# Load-point groups implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents for this project.

**Goal:** Add Rust-owned automatic load-point groups, atomic grouped pile assignment, and solver-independent grouped optimization preparation without changing the project format or current greedy optimizer.

**Architecture:** The Rust core derives a complete load-point partition with all-pairs union-find, owns atomic assignment and lock decisions, and prepares temporary `OptimizationUnit`s. WASM and Tauri expose only grouping and assignment to the current app; TypeScript caches derived groups, guards asynchronous requests, applies returned patches through project history, and presents transient localized conflicts.

**Tech Stack:** Rust, serde, wasm-bindgen, Tauri 2, TypeScript 6, React 19, node:test, Vite, SVG viewer.

**Spec:** `docs/superpowers/specs/2026-09-01-load-point-groups-design.md`

## Global constraints

- Code and internal identifiers remain English; new user-facing copy is available in Dutch and English.
- Use `LoadPointGroup`, not `PileGroup` or `PileCapGroup`, as the generic internal name.
- The automatic edge rule is strict squared Euclidean distance `< 1200² mm²`; exact duplicates connect and exact 1200 mm does not.
- Grouping is transitive and returns a deterministic full partition including singleton groups.
- Group derivation never mutates a pile plan.
- Group assignments affect only the active pile plan and are one atomic undo/redo action.
- A lock conflict in any group involved by a multi-selection blocks the whole assignment.
- Manual grouped assignment does not validate cross-member engineering feasibility.
- Rust owns grouping, assignment, lock, eligibility, cost, and diagnostic decisions; TypeScript only orchestrates and presents.
- Do not modify IFCPP, IndexedDB, project schema versions, the greedy optimizer, Gabriel topology, or tip-level-region geometry.
- Do not add group selection, group underlays, conflict markers, a grouping toggle, or a configurable distance.
- Do not add a spatial index or a 1000-load-point performance benchmark.
- Preserve browser/WASM and desktop/Tauri behavior parity.
- Use a descriptive existing `feature/0.3.0-...` branch; never create a branch containing `codex/`.

## File structure

New Rust files:

- `crates/pile-plan-core/src/load_point_groups.rs` — group model, settings, union-find derivation, and atomic assignment domain operation.
- `crates/pile-plan-core/src/optimization_units.rs` — solver-independent unit preparation, option eligibility, costs, and blocking diagnostics.

New frontend files:

- `apps/pile-plan-studio/src/core/loadPointGroupContract.ts` — browser/desktop request conversion and result types.
- `apps/pile-plan-studio/src/core/loadPointGroupContract.test.ts` — serialization parity and contract tests.
- `apps/pile-plan-studio/src/components/domain/loadPointGroupController.ts` — cached asynchronous grouping with stale-response protection.
- `apps/pile-plan-studio/src/components/domain/loadPointGroupController.test.ts` — controller lifecycle tests.
- `apps/pile-plan-studio/src/components/domain/useLoadPointGroups.ts` — React adapter around the controller.
- `apps/pile-plan-studio/src/components/viewer/ActionNotice.tsx` — generalized bottom-center neutral/error notice.
- `apps/pile-plan-studio/src/components/viewer/ActionNotice.css` — notice layout and error styling.
- `apps/pile-plan-studio/src/components/viewer/ActionNotice.test.ts` — semantics and presentation contract.
- `apps/pile-plan-studio/src/AppLoadPointGroups.test.ts` — App orchestration and stale-assignment guards.

Modified integration files:

- `crates/pile-plan-core/src/lib.rs` — export the two new domain modules.
- `crates/pile-plan-wasm/src/lib.rs` — thin grouping and assignment exports plus parity tests.
- `apps/pile-plan-studio/src-tauri/src/main.rs` — matching Tauri commands and tests.
- `apps/pile-plan-studio/src/core/coreClient.ts` — runtime routing for grouping and assignment.
- `apps/pile-plan-studio/src/components/domain/RightPanel.tsx` — delegate pile-option application and expose pending state.
- `apps/pile-plan-studio/src/App.tsx` — group cache, atomic assignment orchestration, history commit, and action notice.
- `apps/pile-plan-studio/src/i18n/locales/en/common.json` — English lock-conflict copy.
- `apps/pile-plan-studio/src/i18n/locales/nl/common.json` — Dutch lock-conflict copy.
- Generated files under `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/` — refreshed WASM binary and bindings.

Files renamed:

- `apps/pile-plan-studio/src/components/viewer/HistoryNotice.tsx` to `ActionNotice.tsx`.
- `apps/pile-plan-studio/src/components/viewer/HistoryNotice.css` to `ActionNotice.css`.
- `apps/pile-plan-studio/src/components/viewer/HistoryNotice.test.ts` to `ActionNotice.test.ts`.

---

### Task 1: Derive deterministic proximity groups in Rust

**Files:**

- Create: `crates/pile-plan-core/src/load_point_groups.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**

- Consumes: `analysis::LoadPoint { id, x_mm, y_mm, .. }`.
- Produces:

```rust
pub const DEFAULT_MAX_GROUP_EDGE_DISTANCE_MM: f64 = 1_200.0;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LoadPointGroupingSettings {
    pub max_edge_distance_mm: f64,
}

impl Default for LoadPointGroupingSettings {
    fn default() -> Self {
        Self { max_edge_distance_mm: DEFAULT_MAX_GROUP_EDGE_DISTANCE_MM }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LoadPointGroup {
    pub load_point_ids: Vec<u32>,
}

pub fn derive_load_point_groups(
    load_points: &[LoadPoint],
    settings: &LoadPointGroupingSettings,
) -> Vec<LoadPointGroup>;
```

- Invariant: members are sorted ascending and groups are sorted lexicographically by member list.

- [ ] **Step 1: Write failing core tests for the complete partition**

Add tests inside `load_point_groups.rs` covering empty input, singleton input, duplicate coordinates, strict boundary behavior, a transitive chain, disconnected clusters, and shuffled input. Use helpers with explicit millimetre coordinates, for example:

```rust
#[test]
fn transitive_edges_form_one_group() {
    let groups = derive(&[
        point(8, 0.0, 0.0),
        point(2, 1_000.0, 0.0),
        point(5, 2_000.0, 0.0),
    ]);

    assert_eq!(groups, vec![LoadPointGroup {
        load_point_ids: vec![2, 5, 8],
    }]);
}

#[test]
fn exact_threshold_does_not_connect() {
    let groups = derive(&[
        point(1, 0.0, 0.0),
        point(2, 1_200.0, 0.0),
    ]);

    assert_eq!(groups, vec![group(&[1]), group(&[2])]);
}
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `cargo test -p pile-plan-core load_point_groups`

Expected: compilation fails because the module and functions do not exist.

- [ ] **Step 3: Implement all-pairs union-find**

Implement a private index-based union-find. Compare squared `f64` distances without calling `sqrt`, union when the strict comparison succeeds, then collect IDs by root. Normalize a non-finite or negative configured distance to `0.0` so malformed runtime input cannot connect unrelated points.

Export the module and public types/functions from `lib.rs`:

```rust
pub mod load_point_groups;

pub use load_point_groups::{
    derive_load_point_groups, LoadPointGroup, LoadPointGroupingSettings,
    DEFAULT_MAX_GROUP_EDGE_DISTANCE_MM,
};
```

- [ ] **Step 4: Run focused and full core tests**

Run: `cargo test -p pile-plan-core load_point_groups`

Expected: all grouping tests pass.

Run: `cargo test -p pile-plan-core`

Expected: the full core suite passes.

- [ ] **Step 5: Commit the grouping kernel**

```bash
git add crates/pile-plan-core/src/load_point_groups.rs crates/pile-plan-core/src/lib.rs
git commit -m "feat: derive proximity load point groups"
```

---

### Task 2: Apply grouped assignments atomically in Rust

**Files:**

- Modify: `crates/pile-plan-core/src/load_point_groups.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**

- Consumes: the partition from Task 1, selected load-point IDs, current active-plan assignments, locks, and one requested `PileConfigurationKey`.
- Produces:

```rust
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ApplyLoadPointGroupAssignmentInput {
    pub selected_load_point_ids: Vec<u32>,
    pub groups: Vec<LoadPointGroup>,
    pub requested_configuration: PileConfigurationKey,
    pub current_assignments: HashMap<u32, PileConfigurationKey>,
    pub locked_load_point_ids: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LoadPointGroupAssignmentChange {
    pub load_point_id: u32,
    pub configuration: PileConfigurationKey,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct BlockingLockedLoadPoint {
    pub load_point_id: u32,
    pub assigned_configuration: Option<PileConfigurationKey>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ApplyLoadPointGroupAssignmentResult {
    Applied { changes: Vec<LoadPointGroupAssignmentChange> },
    Blocked {
        involved_load_point_ids: Vec<u32>,
        blocking_locked_load_points: Vec<BlockingLockedLoadPoint>,
    },
}

pub fn apply_load_point_group_assignment(
    input: &ApplyLoadPointGroupAssignmentInput,
) -> ApplyLoadPointGroupAssignmentResult;
```

- [ ] **Step 1: Write failing assignment tests**

Cover a singleton, one group, the union of two groups from multi-selection, duplicate selected members, a matching lock, a mismatching lock, an unassigned lock, and all-or-nothing behavior. Include this representative assertion:

```rust
#[test]
fn conflict_in_one_selected_group_blocks_every_group() {
    let result = apply_load_point_group_assignment(&input(
        vec![1, 10],
        vec![group(&[1, 2]), group(&[10, 11])],
        assignments(&[(11, config(320, -18_000))]),
        vec![11],
        config(290, -17_500),
    ));

    assert!(matches!(result,
        ApplyLoadPointGroupAssignmentResult::Blocked { .. }
    ));
}
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `cargo test -p pile-plan-core group_assignment`

Expected: compilation fails because the assignment contract is absent.

- [ ] **Step 3: Implement involved-group expansion and lock checks**

Build a set from selected IDs, include every group intersecting it, deduplicate and sort the union, inspect every locked member before producing changes, and return every blocker in sorted order. Never inspect pile options in this function. Return changes only for unlocked members whose current configuration differs from the request.

Export the input, result, patch, and blocker types from `lib.rs`.

- [ ] **Step 4: Run focused and full core tests**

Run: `cargo test -p pile-plan-core group_assignment`

Expected: all atomic-assignment tests pass.

Run: `cargo test -p pile-plan-core`

Expected: full core suite passes.

- [ ] **Step 5: Commit atomic assignment**

```bash
git add crates/pile-plan-core/src/load_point_groups.rs crates/pile-plan-core/src/lib.rs
git commit -m "feat: apply load point group assignments"
```

---

### Task 3: Prepare solver-independent optimization units

**Files:**

- Create: `crates/pile-plan-core/src/optimization_units.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**

- Consumes: `LoadPointGroup`, `PileConfigurationOption`, active-plan locks and assignments, canonical enabled tip levels in millimetres, optional pile-head level, and `PileCostSettings`.
- Produces:

```rust
pub struct OptimizationCandidateSettings {
    pub max_utilization: f64,
    pub enabled_pile_sizes: Vec<u32>,
    pub enabled_pile_tip_levels_mm: Vec<i64>,
}

pub struct PrepareOptimizationUnitsInput {
    pub groups: Vec<LoadPointGroup>,
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub current_assignments: HashMap<u32, PileConfigurationKey>,
    pub locked_load_point_ids: Vec<u32>,
    pub pile_head_level_m: Option<f64>,
    pub cost_settings: PileCostSettings,
    pub candidate_settings: OptimizationCandidateSettings,
}

pub struct OptimizationUnit {
    pub load_point_ids: Vec<u32>,
    pub forced_configuration: Option<PileConfigurationKey>,
    pub options: Vec<OptimizationUnitOption>,
}

pub struct OptimizationUnitOption {
    pub configuration: PileConfigurationKey,
    pub total_cost: u64,
    pub maximum_utilization: f64,
    pub critical_load_point_id: u32,
    pub critical_governing_cpt_id: Option<u32>,
    pub critical_governing_frd_kn: Option<f64>,
}

#[serde(rename_all = "snake_case")]
pub enum OptimizationPreparationDiagnosticKind {
    MissingPileHeadLevel,
    MissingAnalysisData,
    ConflictingLockedConfigurations,
    LockedMemberUnassigned,
    LockedConfigurationUnavailable,
    LockedConfigurationExceedsUtilizationLimit,
    MissingRelevantCost,
    NoEligibleConfiguration,
}

pub struct OptimizationPreparationDiagnostic {
    pub kind: OptimizationPreparationDiagnosticKind,
    pub load_point_ids: Vec<u32>,
    pub configuration: Option<PileConfigurationKey>,
}

pub struct OptimizationPreparationResult {
    pub units: Vec<OptimizationUnit>,
    pub diagnostics: Vec<OptimizationPreparationDiagnostic>,
}

pub fn prepare_optimization_units(
    input: &PrepareOptimizationUnitsInput,
) -> OptimizationPreparationResult;
```

- [ ] **Step 1: Write failing preparation tests for normal units**

Test singleton preservation, common valid options, missing/invalid member options, enabled filters, concrete summed cost, maximum utilization, and deterministic critical load-point tie-breaking. Reuse small option and cost-setting fixtures.

```rust
#[test]
fn group_option_sums_cost_and_reports_critical_member() {
    let result = prepare(input_for_two_members());
    let option = &result.units[0].options[0];

    assert_eq!(option.total_cost, 2 * expected_member_cost());
    assert_eq!(option.maximum_utilization, 0.90);
    assert_eq!(option.critical_load_point_id, 2);
}
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cargo test -p pile-plan-core optimization_units`

Expected: compilation fails because the module is absent.

- [ ] **Step 3: Implement normal candidate preparation**

For each group, select its member option maps and call `aggregate_pile_options_for_load_points`. Retain configurations with `Valid` aggregate status, enabled canonical size/tip, and per-member utilization at or below the clamped optimization limit. Calculate a per-member cost using `calculate_pile_cost`, sum into `u64`, and sort options by `PileConfigurationKey` ordering.

- [ ] **Step 4: Write failing tests for locks and diagnostics**

Cover equal locks, conflicting locks, an unassigned lock, forced disabled configuration, locked-member utilization exemption, unlocked-member utilization rejection, missing head level, missing relevant catalog cost, missing analysis, no eligible configuration, and multiple diagnostics returned together.

```rust
#[test]
fn locked_configuration_overrides_enabled_filters_only() {
    let result = prepare(locked_input_with_disabled_configuration());

    assert!(result.diagnostics.is_empty());
    assert_eq!(result.units[0].forced_configuration, Some(config(320, -18_000)));
    assert_eq!(result.units[0].options.len(), 1);
}
```

- [ ] **Step 5: Implement forced-domain and diagnostic logic**

Resolve all locked assignments in a group before normal enabled filtering. A common locked configuration bypasses enabled size/tip checks, but must exist and remain technically valid for every member. Apply `max_utilization` only to unlocked members for the forced configuration. Collect diagnostics for all groups; do not return early on the first conflict. Missing relevant cost is blocking and no fallback price is created.

- [ ] **Step 6: Run focused and full core tests**

Run: `cargo test -p pile-plan-core optimization_units`

Expected: all preparation tests pass.

Run: `cargo test -p pile-plan-core`

Expected: full core suite passes without changing greedy tests.

- [ ] **Step 7: Commit optimization preparation**

```bash
git add crates/pile-plan-core/src/optimization_units.rs crates/pile-plan-core/src/lib.rs
git commit -m "feat: prepare grouped optimization units"
```

---

### Task 4: Expose grouping and assignment through WASM and Tauri

**Files:**

- Modify: `crates/pile-plan-wasm/src/lib.rs`
- Modify: `apps/pile-plan-studio/src-tauri/src/main.rs`
- Modify generated: `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/pile_plan_wasm.js`
- Modify generated: `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/pile_plan_wasm.d.ts`
- Modify generated: `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm`
- Modify generated: `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm.d.ts`

**Interfaces:**

- Produces browser and desktop commands named `derive_load_point_groups` and `apply_load_point_group_assignment`.
- Optimization preparation remains Rust-internal and receives no transport command in this phase.

- [ ] **Step 1: Add failing WASM request/response parity tests**

Define a `DeriveLoadPointGroupsRequest { load_points }`. The transport calls the
core with `LoadPointGroupingSettings::default()` so 1200 mm remains a Rust-owned
decision. Use the core `ApplyLoadPointGroupAssignmentInput` directly for
assignment deserialization. Test that an empty grouping request returns an
empty list and that a two-member request serializes `status: "applied"` with
sorted changes.

- [ ] **Step 2: Run WASM tests and confirm RED**

Run: `cargo test -p pile-plan-wasm`

Expected: tests fail because the exports are absent.

- [ ] **Step 3: Add the two WASM exports**

Follow the existing `build_spatial_neighborhood` pattern:

```rust
#[wasm_bindgen]
pub fn derive_load_point_groups(request: JsValue) -> Result<JsValue, JsValue> {
    let request: DeriveLoadPointGroupsRequest = from_js_value(request)?;
    to_js_value(&derive_load_point_groups_core(
        &request.load_points,
        &LoadPointGroupingSettings::default(),
    ))
}
```

The assignment export deserializes the core input and serializes the structured core result; a blocked business result is not a thrown JavaScript error.

- [ ] **Step 4: Add matching Tauri commands and tests**

Add the same request shape, return core types directly, register both commands in `tauri::generate_handler!`, and extend native command tests with one grouped assignment.

- [ ] **Step 5: Run Rust transport tests**

Run: `cargo test -p pile-plan-wasm`

Expected: PASS.

Run: `cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 6: Regenerate tracked WASM bindings**

Run from `apps/pile-plan-studio`: `npm run build:wasm`

Expected: generated JS and TypeScript declarations export both new functions and the WASM binary changes.

- [ ] **Step 7: Commit transport parity and generated bindings**

```bash
git add crates/pile-plan-wasm/src/lib.rs apps/pile-plan-studio/src-tauri/src/main.rs apps/pile-plan-studio/src/core/wasm/pile-plan-wasm
git commit -m "feat: expose load point group core operations"
```

Push reminder: this is the first checkpoint containing all Rust domain work and both runtime transports. Offer to push before starting frontend integration if the branch has not been pushed recently.

---

### Task 5: Add TypeScript contracts and core-client routing

**Files:**

- Create: `apps/pile-plan-studio/src/core/loadPointGroupContract.ts`
- Create: `apps/pile-plan-studio/src/core/loadPointGroupContract.test.ts`
- Modify: `apps/pile-plan-studio/src/core/coreClient.ts`

**Interfaces:**

- Produces:

```ts
export type LoadPointGroup = { load_point_ids: number[] };

export type ApplyLoadPointGroupAssignmentResult =
  | { status: "applied"; changes: Array<{
      load_point_id: number;
      configuration: PileConfigurationKey;
    }> }
  | { status: "blocked";
      involved_load_point_ids: number[];
      blocking_locked_load_points: Array<{
        load_point_id: number;
        assigned_configuration: PileConfigurationKey | null;
      }> };

export async function deriveLoadPointGroupsCore(
  loadPoints: LoadPoint[],
): Promise<LoadPointGroup[]>;

export async function applyLoadPointGroupAssignmentCore(input: {
  selectedLoadPointIds: number[];
  groups: LoadPointGroup[];
  requestedConfiguration: PileConfigurationKey;
  currentAssignments: Map<number, PileConfigurationKey>;
  lockedLoadPointIds: number[];
}): Promise<ApplyLoadPointGroupAssignmentResult>;
```

- [ ] **Step 1: Write failing contract conversion tests**

Verify that browser requests retain `Map<number, PileConfigurationKey>` for
serde-wasm-bindgen, desktop requests use string-keyed records, derivation sends
only load points, and blocked/applied results preserve snake-case fields. Assert
that no TypeScript 1200 mm grouping constant is introduced.

- [ ] **Step 2: Run the focused frontend test and confirm RED**

Run from `apps/pile-plan-studio`: `node --test src/core/loadPointGroupContract.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement request converters and core-client functions**

Use `toWasmNumberKeyedMap` for browser assignment maps and `toStringKeyedRecord` for Tauri. Import the generated WASM functions and route with the existing `isTauriRuntime()` pattern. Clone returned configuration objects at the contract boundary.

- [ ] **Step 4: Add source-contract assertions for runtime parity**

In `loadPointGroupContract.test.ts`, assert that `coreClient.ts` calls the browser export and invokes the two matching Tauri command names. This mirrors the existing spatial and aggregation contract tests.

- [ ] **Step 5: Run focused and full frontend tests**

Run: `node --test src/core/loadPointGroupContract.test.ts`

Expected: PASS.

Run: `npm test`

Expected: full frontend suite passes.

- [ ] **Step 6: Commit the frontend transport contract**

```bash
git add apps/pile-plan-studio/src/core/loadPointGroupContract.ts apps/pile-plan-studio/src/core/loadPointGroupContract.test.ts apps/pile-plan-studio/src/core/coreClient.ts
git commit -m "feat: add load point group client contracts"
```

---

### Task 6: Cache the derived partition with stale-response protection

**Files:**

- Create: `apps/pile-plan-studio/src/components/domain/loadPointGroupController.ts`
- Create: `apps/pile-plan-studio/src/components/domain/loadPointGroupController.test.ts`
- Create: `apps/pile-plan-studio/src/components/domain/useLoadPointGroups.ts`

**Interfaces:**

- Consumes: `LoadPoint[]` and `deriveLoadPointGroupsCore` from Task 5.
- Produces:

```ts
export type LoadPointGroupSnapshot = {
  groups: LoadPointGroup[];
  pending: boolean;
  error: Error | null;
};

export type LoadPointGroupController = {
  update(loadPoints: LoadPoint[]): Promise<void>;
  subscribe(listener: (snapshot: LoadPointGroupSnapshot) => void): () => void;
  dispose(): void;
};

export function useLoadPointGroups(loadPoints: LoadPoint[]): LoadPointGroupSnapshot;
```

- [ ] **Step 1: Write failing controller tests**

Use deferred promises like `tipLevelRegionTopologyController.test.ts`. Verify initial pending state, successful publication, identical geometry not recomputed, coordinate change recomputed, a stale older response ignored, and disposal preventing publication.

The geometry signature must include sorted tuples of `id`, `x_mm`, and `y_mm`; design load changes alone must not trigger grouping.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test src/components/domain/loadPointGroupController.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement the framework-independent controller**

Keep request generation counters and the last geometry signature private. Emit `{ groups: [], pending: true, error: null }` for a new geometry, then publish only if the response generation is current. Keep the most recent successful result for an identical signature.

- [ ] **Step 4: Implement the thin React hook**

Create the controller once with `useRef`, subscribe in `useEffect`, call `update(loadPoints)` when the array changes, and dispose on unmount. Do not add groups to `ProjectState` or project content.

- [ ] **Step 5: Run focused and full frontend tests**

Run: `node --test src/components/domain/loadPointGroupController.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit the runtime cache**

```bash
git add apps/pile-plan-studio/src/components/domain/loadPointGroupController.ts apps/pile-plan-studio/src/components/domain/loadPointGroupController.test.ts apps/pile-plan-studio/src/components/domain/useLoadPointGroups.ts
git commit -m "feat: cache derived load point groups"
```

---

### Task 7: Generalize the bottom-center notice

**Files:**

- Rename: `apps/pile-plan-studio/src/components/viewer/HistoryNotice.tsx` to `apps/pile-plan-studio/src/components/viewer/ActionNotice.tsx`
- Rename: `apps/pile-plan-studio/src/components/viewer/HistoryNotice.css` to `apps/pile-plan-studio/src/components/viewer/ActionNotice.css`
- Rename: `apps/pile-plan-studio/src/components/viewer/HistoryNotice.test.ts` to `apps/pile-plan-studio/src/components/viewer/ActionNotice.test.ts`
- Modify: `apps/pile-plan-studio/src/App.tsx`

**Interfaces:**

- Produces:

```ts
export type ActionNoticeTone = "neutral" | "error";

type Props = {
  message: string;
  noticeId: number;
  tone?: ActionNoticeTone;
};
```

- [ ] **Step 1: Rename the files and write failing notice tests**

Use `git mv` for all three files. Update the test to require:

- neutral notices keep `role="status"` and `aria-live="polite"`;
- error notices use `role="alert"` and class `is-error`;
- both remain centered, pointer-transparent, and transient;
- reduced-motion behavior remains intact.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test src/components/viewer/ActionNotice.test.ts`

Expected: failure because tone support is absent.

- [ ] **Step 3: Implement `ActionNotice` and error styling**

Rename CSS selectors and keyframes from `history-notice` to `action-notice`. Keep the current neutral styling; add a restrained error border/background using existing application error colors. Choose `aria-live` and `role` from `tone` without rendering two live regions.

- [ ] **Step 4: Generalize App notice state without changing undo behavior**

Replace `historyNotice` with:

```ts
type ActionNoticeValue = {
  id: number;
  message: string;
  tone: "neutral" | "error";
};
```

Keep history-result messages neutral and the current 3500 ms lifecycle. Render the renamed component in the same viewer position.

- [ ] **Step 5: Run focused and full frontend tests**

Run: `node --test src/components/viewer/ActionNotice.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit the notice generalization**

```bash
git add apps/pile-plan-studio/src/components/viewer/ActionNotice.tsx apps/pile-plan-studio/src/components/viewer/ActionNotice.css apps/pile-plan-studio/src/components/viewer/ActionNotice.test.ts apps/pile-plan-studio/src/App.tsx
git commit -m "refactor: generalize viewer action notices"
```

---

### Task 8: Integrate atomic grouped assignment into the active plan

**Files:**

- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectHistoryReducer.test.ts`
- Create: `apps/pile-plan-studio/src/AppLoadPointGroups.test.ts`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/common.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/common.json`

**Interfaces:**

- Consumes: `useLoadPointGroups`, `applyLoadPointGroupAssignmentCore`, and `ActionNotice` from Tasks 5–7.
- Changes `RightPanel` props to:

```ts
type Props = {
  // existing props
  pileAssignmentPending?: boolean;
  onApplyPileConfiguration?: (
    selectedLoadPointIds: number[],
    configuration: PileConfigurationKey,
  ) => void;
};
```

- [ ] **Step 1: Write failing RightPanel integration assertions**

Update `RightPanel.test.ts` to assert that a pile-option row delegates selected IDs and the canonical configuration to `onApplyPileConfiguration`, no longer mutates `selectedPileConfigurationsByLoadPoint` locally, and receives a pending flag that adds `aria-disabled` and suppresses clicks.

- [ ] **Step 2: Write a failing history test for one grouped commit**

In `projectHistoryReducer.test.ts`, commit a state whose active-plan configuration map changes for several group members, then undo once and assert every member returns to its previous configuration. Also assert an untouched secondary pile plan remains unchanged.

Create `AppLoadPointGroups.test.ts` with source-contract assertions that App:

- uses `useLoadPointGroups(projectState.loadPoints)`;
- calls `applyLoadPointGroupAssignmentCore` rather than expanding groups in TypeScript;
- captures active-plan ID and the current assignment-map reference;
- compares a monotonically increasing request ID before applying a response;
- ignores a response when the active plan or captured assignment snapshot changed;
- sends blocked outcomes to `ActionNotice` with error tone;
- commits all returned changes through one `commitProjectState` call.

- [ ] **Step 3: Run focused tests and confirm RED**

Run from `apps/pile-plan-studio`:

`node --test src/components/domain/RightPanel.test.ts src/domain/projectHistoryReducer.test.ts src/AppLoadPointGroups.test.ts`

Expected: RightPanel delegation assertions fail before integration.

- [ ] **Step 4: Delegate row activation from `RightPanel`**

Resolve the row's canonical configuration exactly as today, but call the provided handler with `selectedLoadPoints.map(({ id }) => id)`. Remove the local `applyPileOption` map mutation. While pending, mark rows disabled and return before invoking the handler; retain existing nested CPT/load-point link event propagation behavior.

- [ ] **Step 5: Add the App-level group snapshot and assignment handler**

Call `useLoadPointGroups(projectState.loadPoints)`. The async handler captures:

- current group snapshot;
- selected IDs;
- active pile-plan ID;
- current assignments and locks;
- a monotonically increasing assignment request ID.

Do not call the core while groups are pending or unavailable. On response, ignore it if the request is no longer current or the active plan changed. For `applied`, use one `commitProjectState` functional update, re-check that the active plan is unchanged, apply every returned change to one cloned map, synchronize the active plan through the existing project-content path, and clear optimization summary/error exactly as other pile changes do.

For `blocked`, map blocking IDs to localized load-point names and call the generalized action notice with `tone: "error"`. Add translations equivalent to:

```json
// English
"loadPointGroups.assignmentBlocked": "Not changed: locked load point(s) {{names}} use another or no pile configuration."

// Dutch
"loadPointGroups.assignmentBlocked": "Niet gewijzigd: vergrendelde belastinglocatie(s) {{names}} gebruiken een andere of geen paalconfiguratie."
```

Use the same message for an unassigned and differently assigned locked member in this phase; structured core data remains available for later richer presentation.

- [ ] **Step 6: Guard project replacement and rapid actions**

Increment the request generation when the project is replaced or the active plan changes. Pass `pileAssignmentPending` to `RightPanel`, and reset pending only for the latest request. A stale response must neither mutate assignments nor show a conflict notice.

- [ ] **Step 7: Run focused and full frontend tests**

Run: `node --test src/components/domain/RightPanel.test.ts src/domain/projectHistoryReducer.test.ts src/AppLoadPointGroups.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS.

- [ ] **Step 8: Commit viewer integration**

```bash
git add apps/pile-plan-studio/src/App.tsx apps/pile-plan-studio/src/AppLoadPointGroups.test.ts apps/pile-plan-studio/src/components/domain/RightPanel.tsx apps/pile-plan-studio/src/components/domain/RightPanel.test.ts apps/pile-plan-studio/src/domain/projectHistoryReducer.test.ts apps/pile-plan-studio/src/i18n/locales/en/common.json apps/pile-plan-studio/src/i18n/locales/nl/common.json
git commit -m "feat: propagate pile choices through load point groups"
```

---

### Task 9: Verify browser, desktop, history, and live-viewer behavior

**Files:**

- Verify only; modify production or test files only when a failing check exposes a requirement missed by an earlier task.

**Interfaces:**

- Consumes: all deliverables from Tasks 1–8.
- Produces: evidence that the approved spec is satisfied in both runtime routes.

- [ ] **Step 1: Run formatting and static checks**

Run: `cargo fmt --all -- --check`

Expected: PASS.

Run from `apps/pile-plan-studio/src-tauri`: `cargo fmt -- --check`

Expected: PASS.

Run from repository root: `git diff --check`

Expected: no output.

- [ ] **Step 2: Run all Rust tests**

Run: `cargo test --workspace`

Expected: all core and WASM tests pass.

Run: `cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml`

Expected: all Tauri tests pass.

- [ ] **Step 3: Run all frontend tests and production build**

Run from `apps/pile-plan-studio`: `npm test`

Expected: all frontend tests pass.

Run: `npm run build`

Expected: WASM regeneration, TypeScript compilation, and Vite production build all pass.

- [ ] **Step 4: Start or reuse the development viewer on port 4303**

Run from `apps/pile-plan-studio`: `npm run dev -- --port 4303`

Expected: the viewer is available at `http://127.0.0.1:4303/` without console errors.

- [ ] **Step 5: Execute the live acceptance checklist**

In the sample project:

1. Change one member of an automatic two-member group and verify both symbols change while only the clicked location remains selected.
2. Repeat with a six-member transitive group.
3. Multi-select members from two groups, choose one option, and verify the union of both groups changes.
4. Undo once and verify every affected member is restored together.
5. Create a conflicting locked member and verify the full action is rejected with a bottom-center error notice.
6. Switch to another pile plan and verify it was not modified.
7. Enable tip-level regions and verify they update after a successful grouped assignment.
8. Confirm pan, zoom, exact point selection, and table navigation remain responsive.

- [ ] **Step 6: Inspect final git state and checkpoint**

Run: `git status --short --branch`

Expected: clean worktree; the branch is ahead only by the intentional commits.

Run: `git log --oneline --decorate -12`

Expected: each task has a focused commit in the planned order.

Offer to push the completed branch. Do not merge or close #28; update the issue with a concise progress comment only after the user approves the verified result.
