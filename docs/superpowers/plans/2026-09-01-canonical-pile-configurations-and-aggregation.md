# Canonical Pile Configurations and Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents, so all execution is inline.

**Goal:** Make Rust authoritative for canonical pile-configuration identity and multi-load-point option aggregation while preserving IFCPP compatibility and presenting critical multi-selection facts in the frontend.

**Architecture:** A new Rust pile-configuration module owns metre-to-millimetre identity and a new aggregation module combines cached per-location options by canonical key. TypeScript stores structured keys, retains only workflow/presentation responsibilities, and invokes the stateless core only for selections containing two or more load points.

**Tech Stack:** Rust 2021, Serde, wasm-bindgen/serde-wasm-bindgen, Tauri 2, React 19, TypeScript 6, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-09-01-canonical-pile-configurations-and-aggregation-design.md`

## Global Constraints

- Work on `feature/0.3.0-spatial-planning`; never create a branch containing `codex/`.
- Use no subagents.
- Preserve IFCPP schema 3 and continue writing `pile_tip_level_m_key` while 0.2.x and 0.3.0 exchange projects.
- Use `pile_tip_level_mm: i64` in domain and new runtime contracts.
- Only Rust converts metre-valued PPN data to canonical integer millimetres.
- Preserve the current millimetre rounding policy; do not resolve #29's 100 mm precision question.
- Keep active-configuration filtering, authoritative IFCPP normalization, pile-cap grouping, `OptimizationUnit`, greedy grouping, and #21 outside this plan.
- Keep single-selection options synchronous from the existing cached core analysis.
- Call Rust aggregation only for two or more explicitly selected load points.
- Use maximum utilization and lower-load-point-ID tie-breaking; do not retain average utilization.
- Follow strict red-green-refactor TDD for every production change.
- Commit each independently passing task before starting the next.

## File Structure

### Create

- `crates/pile-plan-core/src/pile_configuration.rs` — canonical key, conversion, ordering, and legacy project-wire helpers.
- `crates/pile-plan-core/src/pile_option_aggregation.rs` — cross-load-point aggregation DTOs and pure algorithm.
- `apps/pile-plan-studio/src/core/pileConfigurationKey.ts` — TypeScript value equality and one-way integer token.
- `apps/pile-plan-studio/src/core/pileConfigurationKey.test.ts` — runtime key behavior and token tests.
- `apps/pile-plan-studio/src/core/pileOptionAggregationContract.ts` — WASM/Tauri DTO mapping for aggregated options.
- `apps/pile-plan-studio/src/core/pileOptionAggregationContract.test.ts` — transport fixture normalization.
- `apps/pile-plan-studio/src/components/domain/pileOptionAggregationController.ts` — completed-result cache and stale-response protection.
- `apps/pile-plan-studio/src/components/domain/pileOptionAggregationController.test.ts` — real controller lifecycle tests.
- `apps/pile-plan-studio/src/components/domain/useAggregatedPileOptions.ts` — React orchestration for multi-selection only.

### Remove after replacements pass

- `apps/pile-plan-studio/src/domain/pileOptionAggregation.ts`
- `apps/pile-plan-studio/src/domain/pileOptionAggregation.test.ts`
- `apps/pile-plan-studio/src/domain/pileOptionColumns.ts`
- `apps/pile-plan-studio/src/domain/pileOptionColumns.test.ts`

### Modify — Rust and adapters

- `crates/pile-plan-core/src/lib.rs`
- `crates/pile-plan-core/src/analysis.rs`
- `crates/pile-plan-core/src/export.rs`
- `crates/pile-plan-core/src/import/refresh.rs`
- `crates/pile-plan-core/src/pile_plan_import.rs`
- `crates/pile-plan-core/src/project.rs`
- `crates/pile-plan-core/src/spatial.rs`
- `crates/pile-plan-wasm/src/lib.rs`
- `apps/pile-plan-studio/src-tauri/src/main.rs`
- `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/*` — regenerated bindings and binary.

### Modify — TypeScript runtime and persistence

- `apps/pile-plan-studio/src/core/projectTypes.ts`
- `apps/pile-plan-studio/src/core/projectAnalysisResult.ts`
- `apps/pile-plan-studio/src/core/coreClient.ts`
- `apps/pile-plan-studio/src/core/projectFile.ts`
- `apps/pile-plan-studio/src/core/projectFile.test.ts`
- `apps/pile-plan-studio/src/domain/projectState.ts`
- `apps/pile-plan-studio/src/domain/projectContent.ts`
- `apps/pile-plan-studio/src/domain/historyAction.ts`
- `apps/pile-plan-studio/src/domain/pilePlanManagement.ts`
- `apps/pile-plan-studio/src/domain/pilePlanImport.ts`
- `apps/pile-plan-studio/src/domain/pilePlanExport.ts`
- `apps/pile-plan-studio/src/domain/projectCostSummary.ts`
- associated tests and fixtures for the modules above.

### Modify — consumers and presentation

- `apps/pile-plan-studio/src/App.tsx`
- `apps/pile-plan-studio/src/components/domain/Legend.tsx`
- `apps/pile-plan-studio/src/components/domain/LegendEditor.tsx`
- `apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx`
- `apps/pile-plan-studio/src/components/domain/RightPanel.tsx`
- `apps/pile-plan-studio/src/components/domain/rightPanelModel.ts`
- `apps/pile-plan-studio/src/components/domain/rightPanelModel.test.ts`
- `apps/pile-plan-studio/src/domain/pileOptionTable.ts`
- `apps/pile-plan-studio/src/domain/pileOptionTable.test.ts`
- `apps/pile-plan-studio/src/viewer/legendSelection.ts`
- `apps/pile-plan-studio/src/core/spatialTopologyContract.ts`
- `apps/pile-plan-studio/src/components/domain/tipLevelRegionTopologyController.ts`
- `apps/pile-plan-studio/src/components/domain/useTipLevelRegionTopology.ts`
- related tests and bilingual `rightPanel.json` locale files.

---

### Task 1: Canonical Rust pile-configuration identity

**Files:**
- Create: `crates/pile-plan-core/src/pile_configuration.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`
- Modify: `crates/pile-plan-core/src/analysis.rs`
- Modify: `crates/pile-plan-core/src/export.rs`
- Modify: `crates/pile-plan-core/src/import/refresh.rs`
- Modify: `crates/pile-plan-core/src/pile_plan_import.rs`
- Modify: `crates/pile-plan-core/src/project.rs`
- Modify: `crates/pile-plan-core/src/ifcpp.rs`
- Modify: `crates/pile-plan-core/src/spatial.rs`

**Interfaces:**
- Produces: `PileConfigurationKey { pile_size_mm: u32, pile_tip_level_mm: i64 }`.
- Produces: `PileConfigurationKey::from_metres(u32, f64) -> PileConfigurationKey`.
- Produces: `PileConfigurationKey::pile_tip_level_m(&self) -> f64`.
- Produces: `PileConfigurationOption.configuration: PileConfigurationKey`.
- Removes: optimizer-local `pile_tip_level_key` and `pile_tip_level_m_key` domain fields.

- [ ] **Step 1: Write failing canonical identity tests**

Create `pile_configuration.rs` with tests that describe the public API before
adding the implementation:

```rust
#[test]
fn canonical_key_rounds_negative_metres_to_integer_millimetres() {
    assert_eq!(
        PileConfigurationKey::from_metres(320, -18.5004),
        PileConfigurationKey { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
    );
}

#[test]
fn canonical_key_converts_back_to_metres_for_physical_calculations() {
    let key = PileConfigurationKey { pile_size_mm: 290, pile_tip_level_mm: -17_750 };
    assert_eq!(key.pile_tip_level_m(), -17.75);
}

#[test]
fn canonical_order_uses_size_then_tip_millimetres() {
    let mut keys = vec![
        PileConfigurationKey { pile_size_mm: 320, pile_tip_level_mm: -19_000 },
        PileConfigurationKey { pile_size_mm: 290, pile_tip_level_mm: -18_000 },
    ];
    keys.sort();
    assert_eq!(keys[0].pile_size_mm, 290);
}
```

In `project.rs`, add the separate legacy serialization behavior test where the
existing `sample_project()` fixture is available:

```rust
#[test]
fn selected_piles_keep_the_legacy_ifcpp_tip_key_field() {
    let value = serde_json::to_value(sample_project()).unwrap();
    let pile = &value["user_state"]["pile_plans"][0]["selected_piles"]["1"]["pile"];
    assert_eq!(pile["pile_tip_level_m_key"], -18_000);
    assert!(pile.get("pile_tip_level_mm").is_none());
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cargo test -p pile-plan-core pile_configuration`

Expected: compilation fails because the new module/API does not exist.

Run: `cargo test -p pile-plan-core selected_piles_keep_the_legacy_ifcpp_tip_key_field`

Expected: failure because the canonical domain field and explicit legacy
serializer have not been introduced together yet.

- [ ] **Step 3: Implement the canonical module and export it**

Implement the minimal value object:

```rust
#[derive(Clone, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct PileConfigurationKey {
    pub pile_size_mm: u32,
    pub pile_tip_level_mm: i64,
}

impl PileConfigurationKey {
    pub fn from_metres(pile_size_mm: u32, pile_tip_level_m: f64) -> Self {
        Self {
            pile_size_mm,
            pile_tip_level_mm: (pile_tip_level_m * 1000.0).round() as i64,
        }
    }

    pub fn pile_tip_level_m(&self) -> f64 {
        self.pile_tip_level_mm as f64 / 1000.0
    }
}
```

Move all core identity construction to `from_metres`, rename internal key
fields, and add `configuration` to every produced `PileConfigurationOption`.
Cost calculations accept or derive from the canonical key in Rust rather than
recomputing identity in callers.

Serialize and deserialize `SelectedPileChoice.pile` through a focused legacy
wire helper so the domain rename does not alter IFCPP schema 3:

```rust
#[derive(Deserialize, Serialize)]
struct LegacyProjectPileConfigurationKey {
    pile_size_mm: u32,
    pile_tip_level_m_key: i64,
}
```

- [ ] **Step 4: Run focused and workspace Rust tests**

Run: `cargo test -p pile-plan-core pile_configuration`

Expected: the new tests pass.

Run: `cargo test -p pile-plan-core`

Expected: all existing core tests pass after fixture field updates, and IFCPP
JSON still contains only the legacy selected-pile field name.

- [ ] **Step 5: Commit the independently passing Rust identity slice**

```bash
git add crates/pile-plan-core
git commit -m "refactor: centralize pile configuration identity"
```

---

### Task 2: Replace TypeScript float-string assignments with structured keys

**Files:**
- Create: `apps/pile-plan-studio/src/core/pileConfigurationKey.ts`
- Create: `apps/pile-plan-studio/src/core/pileConfigurationKey.test.ts`
- Modify: `apps/pile-plan-studio/src/core/projectTypes.ts`
- Modify: `apps/pile-plan-studio/src/core/projectFile.ts`
- Modify: `apps/pile-plan-studio/src/core/projectFile.test.ts`
- Modify: all runtime, plan, history, import/export, optimizer, legend, viewer,
  spatial-topology, and tests listed in the File Structure section that use
  `selectedPileOptionKeysByLoadPoint` or raw option keys.

**Interfaces:**
- Produces: `pileConfigurationToken(key: PileConfigurationKey) -> string`.
- Produces: `samePileConfiguration(left, right) -> boolean`.
- Produces: `selectedPileConfigurationsByLoadPoint: Map<number, PileConfigurationKey>`.
- Produces: legacy `IfcppPileConfigurationKey { pile_size_mm, pile_tip_level_m_key }` only at the project boundary.
- Consumes: `PileConfigurationOption.configuration` from Task 1.

- [ ] **Step 1: Write failing helper and state tests**

Create behavior tests:

```typescript
it("tokens already-canonical integer fields without metre conversion", () => {
  assert.equal(
    pileConfigurationToken({ pile_size_mm: 320, pile_tip_level_mm: -18_500 }),
    "320|-18500",
  );
});

it("compares structured configurations by both canonical fields", () => {
  assert.equal(
    samePileConfiguration(
      { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
      { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
    ),
    true,
  );
});
```

Update one plan-management test first so its assignment fixture is a
`PileConfigurationKey` object and its expected duplicated assignment is a
distinct equal value object.

Add a project round-trip fixture whose runtime key is
`{ pile_size_mm: 320, pile_tip_level_mm: -18_500 }` and assert saved JSON still
contains `{ pile_size_mm: 320, pile_tip_level_m_key: -18_500 }`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test src/core/pileConfigurationKey.test.ts src/domain/pilePlanManagement.test.ts`

Expected: the helper module and structured plan field do not yet exist.

- [ ] **Step 3: Implement helpers and migrate the state graph**

Implement only integer-based helpers:

```typescript
export function pileConfigurationToken(key: PileConfigurationKey): string {
  return `${key.pile_size_mm}|${key.pile_tip_level_mm}`;
}

export function samePileConfiguration(
  left: PileConfigurationKey | null | undefined,
  right: PileConfigurationKey | null | undefined,
): boolean {
  return left === right || (
    left !== null && left !== undefined && right !== null && right !== undefined
    && left.pile_size_mm === right.pile_size_mm
    && left.pile_tip_level_mm === right.pile_tip_level_mm
  );
}
```

Rename the state/plan property everywhere. Copy nested key objects when
duplicating plans or capturing project content. Use canonical tokens only for
lookup tables and React row keys. Update optimizer and default-choice adapters
to return structured maps directly. Update tip-level topology to consume
canonical assignments rather than reparsing strings.

Define a separate `IfcppPileConfigurationKey` and map exact integer fields in
`pilePlanDataFromWire` and `createIfcppProject`. Remove the old float-string
parse/round conversion without changing project schema 3.

- [ ] **Step 4: Compile and run focused frontend suites**

Run: `npx tsc -p tsconfig.json --noEmit`

Expected: no remaining string-valued assignment type errors.

Run:
`node --test src/core/pileConfigurationKey.test.ts src/core/projectFile.test.ts src/domain/pilePlanManagement.test.ts src/domain/projectContent.test.ts src/domain/projectHistoryReducer.test.ts src/viewer/legendSelection.test.ts src/components/domain/tipLevelRegionTopologyController.test.ts`

Expected: all selected structured-assignment behaviors pass.

- [ ] **Step 5: Scan for prohibited identity reconstruction**

Run from the repository root:

```powershell
rg -n "Math\.round\([^\n]*1000|pile_size_mm\}\\|\$\{[^}]*pile_tip_level_m|selectedPileOptionKeysByLoadPoint" apps/pile-plan-studio/src
```

Expected: no runtime identity reconstruction or old state property remains;
legacy `pile_tip_level_m_key` may remain only in explicit IFCPP wire types and
fixtures.

- [ ] **Step 6: Run the complete frontend suite and commit**

Run: `npm test`

Expected: all frontend tests pass.

```bash
git add apps/pile-plan-studio/src crates/pile-plan-core/src/spatial.rs
git commit -m "refactor: store structured pile configurations"
```

---

### Task 3: Add authoritative Rust multi-load-point aggregation

**Files:**
- Create: `crates/pile-plan-core/src/pile_option_aggregation.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`
- Modify: `crates/pile-plan-wasm/src/lib.rs`
- Modify: `apps/pile-plan-studio/src-tauri/src/main.rs`
- Create: `apps/pile-plan-studio/src/core/pileOptionAggregationContract.ts`
- Create: `apps/pile-plan-studio/src/core/pileOptionAggregationContract.test.ts`
- Modify: `apps/pile-plan-studio/src/core/coreClient.ts`

**Interfaces:**
- Produces: `aggregate_pile_options_for_load_points(&HashMap<u32, Vec<PileConfigurationOption>>) -> Vec<AggregatedPileConfiguration>`.
- Produces: `aggregate_pile_options` WASM export and Tauri command.
- Produces: `aggregatePileOptionsCore(optionsByLoadPoint) -> Promise<AggregatedPileConfiguration[]>`.

- [ ] **Step 1: Write failing core aggregation tests**

Use literal fixtures to cover one behavior per test:

```rust
#[test]
fn aggregate_reports_the_maximum_utilization_and_critical_load_point() {
    let result = aggregate_pile_options_for_load_points(&HashMap::from([
        (7, vec![option(320, -18.5, true, Some(0.71), 61, 700.0)]),
        (3, vec![option(320, -18.5, true, Some(0.90), 64, 1000.0)]),
    ]));
    assert_eq!(result[0].maximum_utilization, Some(0.90));
    assert_eq!(result[0].critical_load_point_id, Some(3));
    assert_eq!(result[0].critical_governing_cpt_id, Some(64));
}

#[test]
fn aggregate_breaks_equal_utilization_by_lower_load_point_id() {
    let result = aggregate_pile_options_for_load_points(&HashMap::from([
        (8, vec![option_with_utilization(0.8)]),
        (2, vec![option_with_utilization(0.8)]),
    ]));
    assert_eq!(result[0].critical_load_point_id, Some(2));
}

#[test]
fn missing_configuration_has_priority_over_invalid_configuration() {
    let result = aggregate_pile_options_for_load_points(&HashMap::from([
        (1, vec![invalid_option(320, -18.5)]),
        (2, vec![]),
    ]));
    assert_eq!(result[0].status, AggregatedPileConfigurationStatus::Missing);
    assert_eq!(result[0].missing_load_point_ids, vec![2]);
    assert_eq!(result[0].invalid_load_point_ids, vec![1]);
}
```

Also add tests for missing CPT capacity, singleton equivalence, shuffled input,
and deterministic size/tip ordering.

- [ ] **Step 2: Run the aggregation tests and verify RED**

Run: `cargo test -p pile-plan-core pile_option_aggregation`

Expected: compilation fails because the module and DTOs do not exist.

- [ ] **Step 3: Implement the minimal pure aggregator**

Index each load point's options by `PileConfigurationKey`, build the union in a
`BTreeMap`, classify missing/invalid IDs, and update the critical record only
when utilization is greater or equal with a lower ID. Sort/deduplicate ID
vectors before producing the DTO.

- [ ] **Step 4: Verify the core algorithm**

Run: `cargo test -p pile-plan-core pile_option_aggregation`

Expected: all aggregation fixtures pass.

- [ ] **Step 5: Add failing adapter contract tests**

Add WASM and Tauri fixtures that submit two load points and assert status,
maximum utilization, critical load point, canonical key fields, and sorted
missing IDs. Add a TypeScript transport test that maps the snake-case core DTO
without recalculating any engineering fields.

Run:
`cargo test -p pile-plan-wasm aggregate`

Run:
`cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml aggregate`

Run:
`node --test src/core/pileOptionAggregationContract.test.ts`

Expected: all fail because adapters are not exposed.

- [ ] **Step 6: Implement thin WASM, Tauri, and core-client adapters**

Define the shared request as only `options_by_load_point`. Both Rust adapters
call `aggregate_pile_options_for_load_points` directly. The TypeScript client
uses `toWasmNumberKeyedMap` for browser and `toStringKeyedRecord` for Tauri,
then maps the response DTO without computing status or critical fields.

- [ ] **Step 7: Run adapter tests and commit**

Run the three focused commands from Step 5 and then:
`cargo test --workspace`

Expected: all pass.

```bash
git add crates/pile-plan-core crates/pile-plan-wasm apps/pile-plan-studio/src-tauri apps/pile-plan-studio/src/core
git commit -m "feat: aggregate pile options in the Rust core"
```

---

### Task 4: Add stale-safe multi-selection orchestration

**Files:**
- Create: `apps/pile-plan-studio/src/components/domain/pileOptionAggregationController.ts`
- Create: `apps/pile-plan-studio/src/components/domain/pileOptionAggregationController.test.ts`
- Create: `apps/pile-plan-studio/src/components/domain/useAggregatedPileOptions.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.tsx`

**Interfaces:**
- Produces controller `update`, `clear`, and `subscribe` methods.
- Consumes `aggregatePileOptionsCore` from Task 3.
- Guarantees no core aggregation call for zero or one selected load point.

- [ ] **Step 1: Write failing controller lifecycle tests**

Use real promises with controlled completion:

```typescript
it("does not aggregate a single selected load point", async () => {
  let calls = 0;
  const controller = createPileOptionAggregationController(async () => {
    calls += 1;
    return [];
  });
  await controller.update(singleSelectionInput());
  assert.equal(calls, 0);
});

it("rejects an older result after the selected IDs change", async () => {
  const requests: Deferred<AggregatedPileConfiguration[]>[] = [];
  const controller = createPileOptionAggregationController(() => {
    const request = deferred<AggregatedPileConfiguration[]>();
    requests.push(request);
    return request.promise;
  });
  const values: AggregatedPileConfiguration[][] = [];
  controller.subscribe((value) => { if (value) values.push(value); });
  const first = controller.update(input([1, 2]));
  const second = controller.update(input([2, 3]));
  requests[1].resolve([aggregate(-19_000)]);
  await second;
  requests[0].resolve([aggregate(-18_000)]);
  await first;
  assert.deepEqual(values, [[aggregate(-19_000)]]);
});
```

Add a third test proving a completed selection key reuses its cached result.

- [ ] **Step 2: Run the controller test and verify RED**

Run: `node --test src/components/domain/pileOptionAggregationController.test.ts`

Expected: module/API missing.

- [ ] **Step 3: Implement controller and hook**

Build the cache key from sorted selected IDs plus the selected option arrays'
canonical keys and analysis facts. Increment a generation for every selection
change. Publish `loading`, `result`, and `error` state only for the current
generation. Clear aggregate state immediately for zero/one selection so the
caller uses cached individual options.

- [ ] **Step 4: Run controller and type checks**

Run: `node --test src/components/domain/pileOptionAggregationController.test.ts`

Run: `npx tsc -p tsconfig.json --noEmit`

Expected: controller tests and compilation pass.

- [ ] **Step 5: Commit the orchestration slice**

```bash
git add apps/pile-plan-studio/src/components/domain/pileOptionAggregationController.ts apps/pile-plan-studio/src/components/domain/pileOptionAggregationController.test.ts apps/pile-plan-studio/src/components/domain/useAggregatedPileOptions.ts apps/pile-plan-studio/src/components/domain/RightPanel.tsx
git commit -m "feat: load aggregated pile options for multiselection"
```

---

### Task 5: Present adaptive single- and multi-selection columns

**Files:**
- Modify: `apps/pile-plan-studio/src/components/domain/rightPanelModel.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/rightPanelModel.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.tsx`
- Modify: `apps/pile-plan-studio/src/domain/pileOptionTable.ts`
- Modify: `apps/pile-plan-studio/src/domain/pileOptionTable.test.ts`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json`
- Remove: old TypeScript aggregation and column-label modules/tests after consumers are gone.

**Interfaces:**
- Single columns: symbol, size, tip, status, cost, use, governing, frd.
- Multi columns: symbol, size, tip, status, totalCost, maxUse, criticalLoadPoint.
- Critical-load-point links use the existing load-point selection transition.

- [ ] **Step 1: Write failing adaptive-table behavior tests**

Add literal column expectations:

```typescript
it("shows critical multiselection facts instead of averages and governing CPT", () => {
  assert.deepEqual(getPileOptionColumns(2).map(({ key }) => key), [
    "symbol", "size", "tip", "status", "totalCost", "maxUse", "criticalLoadPoint",
  ]);
});

it("keeps governing CPT and FRd for a single location", () => {
  assert.deepEqual(getPileOptionColumns(1).map(({ key }) => key), [
    "symbol", "size", "tip", "status", "cost", "use", "governing", "frd",
  ]);
});
```

Add a row-model test with unit cost `€1,200`, three selected points, maximum
utilization `0.9`, and critical load point `3`; assert `€3,600`, `90%`, and the
resolved display name for load point 3. Add an unknown-cost test asserting `-`.

- [ ] **Step 2: Run the table tests and verify RED**

Run:
`node --test src/domain/pileOptionTable.test.ts src/components/domain/rightPanelModel.test.ts`

Expected: the adaptive column keys and aggregate row fields do not exist.

- [ ] **Step 3: Implement adaptive presentation only**

Make columns a function of explicit selected count. Map individual options and
aggregated DTOs into one renderable row union. Multiply a known unit cost by
the selected count only for the multi-selection row. Render critical load
point as a nested button that stops row assignment propagation and invokes the
existing load-point selection transition.

Delete the old average-utilization aggregation and `Use (Avg)` column helper
once no imports remain. Add bilingual labels:

```json
{
  "columns": {
    "totalCost": "Total cost",
    "maxUse": "Max use",
    "criticalLoadPoint": "Critical load point"
  }
}
```

and Dutch equivalents `Totale kosten`, `Max. benutting`, and `Kritieke
belastinglocatie`.

- [ ] **Step 4: Run focused UI tests and frontend suite**

Run:
`node --test src/domain/pileOptionTable.test.ts src/components/domain/rightPanelModel.test.ts src/components/domain/WorkspaceTranslations.test.ts src/viewer/legendSelection.test.ts`

Run: `npm test`

Expected: all frontend tests pass and no test expects average utilization.

- [ ] **Step 5: Commit the presentation slice**

```bash
git add apps/pile-plan-studio/src
git commit -m "feat: show critical multiselection pile options"
```

---

### Task 6: Regenerate artifacts and run complete verification

**Files:**
- Modify: `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/*`
- Modify if required by generated signatures: WASM import declarations in TypeScript.

**Interfaces:**
- Consumes all previous task contracts.
- Produces the tracked browser WASM package with the aggregation export.

- [ ] **Step 1: Rebuild the tracked WASM package**

Run from `apps/pile-plan-studio`: `npm run build:wasm`

Expected: generated declarations include `aggregate_pile_options` and use
`pile_tip_level_mm` for new runtime DTOs.

- [ ] **Step 2: Run the full automated verification gate**

Run from repository root: `cargo test --workspace`

Run from `apps/pile-plan-studio`: `npm test`

Run from `apps/pile-plan-studio`: `npm run build`

Run from repository root:

```powershell
rg -n "Math\.round\([^\n]*1000|selectedPileOptionKeysByLoadPoint|Use \(Avg\)" apps/pile-plan-studio/src
```

Expected: tests/build exit zero; the scan finds no old runtime identity or
average-use label. Explicit legacy IFCPP occurrences remain allowed.

- [ ] **Step 3: Verify live browser behavior**

Use the existing live viewer on `http://127.0.0.1:4303/`:

1. open the sample project;
2. select one load point and confirm governing CPT/FRd columns are immediate;
3. select multiple load points and confirm total cost/max use/critical location;
4. click the critical location and confirm single-location navigation;
5. choose a pile configuration and verify structured assignment updates;
6. enable tip-level regions and verify the overlay still follows assignments;
7. save and reopen the project and confirm assignments survive;
8. inspect browser console and require zero new errors.

- [ ] **Step 4: Review the complete diff against the spec**

Run: `git diff --check origin/feature/0.3.0-spatial-planning...HEAD`

Review every spec requirement and confirm no IFCPP schema bump, grouping,
optimizer-unit, or active-filtering migration entered the diff.

- [ ] **Step 5: Commit generated artifacts and verification adjustments**

```bash
git add apps/pile-plan-studio/src/core/wasm/pile-plan-wasm apps/pile-plan-studio/src docs/superpowers
git commit -m "build: refresh canonical configuration WASM contracts"
```

- [ ] **Step 6: Report verified status without merging or pushing**

Report exact test counts, build result, live-viewer observations, commits, and
remaining #30/#28/#21 follow-ups. Do not push, open a PR, merge, or close issues
without a new explicit user request.
