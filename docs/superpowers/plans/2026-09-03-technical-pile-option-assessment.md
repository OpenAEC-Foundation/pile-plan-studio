# Technical Pile-Option Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make default assignment, grouped greedy optimization, viewer markers, permanent notices, and pile-option tables share one Rust-owned interpretation of valid, missing-capacity, and insufficient-capacity configurations.

**Architecture:** Add a pure Rust technical-assignment assessor over canonical configurations and `LoadPointGroup`s, reuse it inside default assignment and optimization preparation, and expose it through equivalent WASM/Tauri commands. A stale-safe React-side controller caches the derived assessment without persisting it; pile plans retain only genuine optimizer outcomes.

**Tech Stack:** Rust, serde, wasm-bindgen, Tauri 2, TypeScript 6, React 19, i18next, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-09-03-technical-pile-option-assessment-design.md`

## Global Constraints

- Technical assessment uses every analyzed configuration and the engineering utilization boundary of 100 percent.
- `missing_capacity_data` takes precedence within an incomplete configuration; `insufficient_capacity` requires complete selected-CPT capacity data.
- Optimizer enabled sizes, enabled tip levels, maximum utilization, and configuration limits must not affect permanent technical state.
- Rust owns option status, canonical matching, group classification, issue causes, supporting IDs, and missing-CPT union semantics.
- TypeScript must not infer grouped validity by scanning `isOption`, utilization, or missing-CPT arrays.
- Technical issues are derived state and must not be written to IFCPP, recovery content, undo history, or a pile plan.
- Only `optimization_constraints` and `configuration_limits` are persisted optimizer-unassigned reasons and render question marks.
- Compact optimization summaries report load-point counts only; no group count is displayed.
- Browser/WASM and desktop/Tauri behavior must remain equivalent.
- Do not change grouping distance, manual group-assignment semantics, legend behavior from #24, or optimization method from #21.
- Keep the current branch `feature/0.3.0-greedy-optimization-units` and preserve unrelated work.
- Execute inline in this chat; do not dispatch subagents or parallel implementation tasks.
- Use test-driven development and commit each independently verified task.

## File structure

- `crates/pile-plan-core/src/pile_option_status.rs`: the one effective per-option technical-status rule.
- `crates/pile-plan-core/src/technical_assignment.rs`: grouped technical assessment, structured issues, and no-configuration/contract outcomes.
- `crates/pile-plan-core/src/pile_option_aggregation.rs`: canonical per-configuration aggregation, missing-CPT union, and conclusive metric fields.
- `crates/pile-plan-core/src/analysis.rs`: default choice orchestration that consumes shared group assessment.
- `crates/pile-plan-core/src/optimization_units.rs`: eligible-unit preparation and technical-unassigned IDs.
- `crates/pile-plan-core/src/greedy_optimizer.rs`: optimizer-only unassigned outcomes and atomic result expansion.
- `crates/pile-plan-core/src/project.rs`: persistence filtering for optimizer-only reasons.
- `crates/pile-plan-wasm/src/lib.rs` and `apps/pile-plan-studio/src-tauri/src/main.rs`: thin assessment commands and contract parity.
- `apps/pile-plan-studio/src/core/technicalAssignmentContract.ts`: browser/desktop request conversion and normalized assessment DTOs.
- `apps/pile-plan-studio/src/components/domain/technicalAssignmentController.ts`: cached, stale-safe async derived state.
- `apps/pile-plan-studio/src/components/domain/useTechnicalAssignment.ts`: React lifecycle wrapper around the controller.
- `apps/pile-plan-studio/src/domain/technicalAssignmentNotice.ts`: pure selection-specific notice model.
- `apps/pile-plan-studio/src/components/domain/TechnicalAssignmentNotice.tsx`: localized coherent notice with clickable location IDs.
- `apps/pile-plan-studio/src/components/domain/MissingCptPopover.tsx`: accessible anchored missing-CPT navigation.
- Existing viewer, right-panel, optimization, persistence, and translation files consume these focused units.

---

### Task 1: Effective option status and conclusive aggregation facts

**Files:**
- Create: `crates/pile-plan-core/src/pile_option_status.rs`
- Modify: `crates/pile-plan-core/src/analysis.rs`
- Modify: `crates/pile-plan-core/src/pile_option_aggregation.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**
- Consumes: `PileConfigurationOption` and canonical `PileConfigurationKey`.
- Produces: serialized `PileConfigurationOption.technical_status: PileOptionTechnicalStatus`, one pure `pile_option_technical_status(is_option, utilization, missing_cpt_ids)` classifier used while constructing options, and `AggregatedPileConfiguration.missing_cpt_ids: Vec<u32>`.

- [ ] **Step 1: Write failing Rust tests for effective single-option status**

Add tests in `pile_option_status.rs` for the exact precedence:

```rust
assert_eq!(pile_option_technical_status(true, Some(0.80), &[]), PileOptionTechnicalStatus::Valid);
assert_eq!(
    pile_option_technical_status(false, Some(1.20), &[8]),
    PileOptionTechnicalStatus::MissingCapacityData,
);
assert_eq!(
    pile_option_technical_status(false, Some(1.01), &[]),
    PileOptionTechnicalStatus::InsufficientCapacity,
);
assert_eq!(
    pile_option_technical_status(false, None, &[]),
    PileOptionTechnicalStatus::MissingCapacityData,
);
```

The missing fixture deliberately retains a partial utilization to prove that it remains inconclusive.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
$env:Path = 'C:\Users\bjorn\.cargo\bin;' + $env:Path
cargo test -p pile-plan-core pile_option_status::tests --no-fail-fast
```

Expected: compilation fails because the module and enum do not exist.

- [ ] **Step 3: Implement the minimal Rust status rule**

Define:

```rust
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PileOptionTechnicalStatus {
    Valid,
    MissingCapacityData,
    InsufficientCapacity,
}

pub fn pile_option_technical_status(
    is_option: bool,
    utilization: Option<f64>,
    missing_cpt_ids: &[u32],
) -> PileOptionTechnicalStatus {
    if !missing_cpt_ids.is_empty() || utilization.is_none() {
        PileOptionTechnicalStatus::MissingCapacityData
    } else if is_option {
        PileOptionTechnicalStatus::Valid
    } else {
        PileOptionTechnicalStatus::InsufficientCapacity
    }
}
```

Register and re-export the focused module from `lib.rs`.

Add `technical_status: PileOptionTechnicalStatus` to `PileConfigurationOption` and populate it in Rust analysis when each option is created. Update existing analysis fixtures and add a serialization assertion proving the wire value is `missing_capacity_data`. The status field is authoritative across the core boundary; downstream TypeScript must not reconstruct it from `is_option`, utilization, or missing-CPT arrays.

- [ ] **Step 4: Write failing aggregation tests for Missing rows**

Extend `pile_option_aggregation.rs` tests to assert:

```rust
assert_eq!(result[0].status, AggregatedPileConfigurationStatus::Missing);
assert_eq!(result[0].missing_cpt_ids, vec![4, 9]);
assert_eq!(result[0].maximum_utilization, None);
assert_eq!(result[0].critical_load_point_id, None);
assert_eq!(result[0].critical_governing_cpt_id, None);
assert_eq!(result[0].critical_governing_frd_kn, None);
```

Use duplicated and unsorted missing CPT IDs across two locations to prove union sorting and deduplication. Retain `invalid_load_point_ids` in the fixture to prove a Missing aggregate may still report supporting invalid-member facts.

- [ ] **Step 5: Run aggregation tests and verify RED**

Run:

```powershell
cargo test -p pile-plan-core pile_option_aggregation::tests --no-fail-fast
```

Expected: field and assertion failures because missing CPT IDs are absent and partial critical facts are still populated.

- [ ] **Step 6: Implement missing-CPT union and conclusive metrics**

Add `missing_cpt_ids: Vec<u32>` to `AggregatedPileConfiguration`. Accumulate identifiers in a `BTreeSet<u32>`. After determining aggregate status, publish critical fields only for `Valid` or `Invalid`; publish `None` for every utilization/governing field when status is `Missing`.

Use each option's Rust-produced `technical_status` instead of reconstructing the per-option precedence locally.

- [ ] **Step 7: Run focused Rust tests and verify GREEN**

Run both Task 1 focused commands. Expected: all tests pass.

- [ ] **Step 8: Commit the status and aggregation boundary**

```powershell
git add crates/pile-plan-core/src/pile_option_status.rs crates/pile-plan-core/src/analysis.rs crates/pile-plan-core/src/pile_option_aggregation.rs crates/pile-plan-core/src/lib.rs
git commit -m "feat: classify technical pile option status"
```

### Task 2: Rust-owned grouped technical assessment

**Files:**
- Create: `crates/pile-plan-core/src/technical_assignment.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**
- Consumes: complete `LoadPointGroup[]` and `HashMap<u32, Vec<PileConfigurationOption>>`.
- Produces: `assess_technical_assignment(&[LoadPointGroup], &HashMap<u32, Vec<PileConfigurationOption>>) -> Result<TechnicalAssignmentAssessment, TechnicalAssignmentAssessmentError>`.

- [ ] **Step 1: Write failing classification tests**

Create fixtures and assertions for:

```rust
assert_eq!(assessment.availability, TechnicalAssignmentAvailability::Available);
assert!(assessment.issues.is_empty()); // common valid configuration

assert_eq!(issue.status, TechnicalAssignmentIssueStatus::MissingCapacityData);
assert_eq!(issue.cause, TechnicalAssignmentIssueCause::GroupMemberWithoutValidOption);
assert_eq!(issue.group_load_point_ids, vec![1, 2]);
assert_eq!(issue.blocking_load_point_ids, vec![2]);

assert_eq!(overlap_issue.cause, TechnicalAssignmentIssueCause::NoCommonValidGroupConfiguration);
assert_eq!(overlap_issue.status, TechnicalAssignmentIssueStatus::MissingCapacityData);

assert_eq!(mixed_issue.status, TechnicalAssignmentIssueStatus::InsufficientCapacity);
assert!(mixed_issue.has_missing_capacity_data);
```

Also assert that every member of an invalid group receives the same status. When at least one member is individually invalid, those locations use `NoValidOption` and otherwise valid linked locations use `GroupMemberWithoutValidOption`. When every member is individually valid but no common valid configuration exists, every member uses `NoCommonValidGroupConfiguration`.

- [ ] **Step 2: Write failing availability and contract-error tests**

Cover:

```rust
assert_eq!(
    assess_technical_assignment(&[group(&[1])], &HashMap::from([(1, vec![])]))
        .unwrap().availability,
    TechnicalAssignmentAvailability::NoPileConfigurations,
);
assert_eq!(
    assess_technical_assignment(&[], &HashMap::new()).unwrap().availability,
    TechnicalAssignmentAvailability::Available,
);
assert_eq!(
    assess_technical_assignment(&[group(&[1, 2])], &HashMap::from([(1, vec![])]))
        .unwrap_err().missing_load_point_ids,
    vec![2],
);
```

- [ ] **Step 3: Run the assessment tests and verify RED**

Run:

```powershell
cargo test -p pile-plan-core technical_assignment::tests --no-fail-fast
```

Expected: missing types and function failures.

- [ ] **Step 4: Define the structured assessment contract**

Add:

```rust
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TechnicalAssignmentAvailability {
    Available,
    NoPileConfigurations,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TechnicalAssignmentIssueCause {
    NoValidOption,
    GroupMemberWithoutValidOption,
    NoCommonValidGroupConfiguration,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TechnicalAssignmentIssueStatus {
    MissingCapacityData,
    InsufficientCapacity,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TechnicalAssignmentIssue {
    pub load_point_id: u32,
    pub cause: TechnicalAssignmentIssueCause,
    pub status: TechnicalAssignmentIssueStatus,
    pub group_load_point_ids: Vec<u32>,
    pub blocking_load_point_ids: Vec<u32>,
    pub missing_cpt_ids: Vec<u32>,
    pub has_missing_capacity_data: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TechnicalAssignmentAssessment {
    pub availability: TechnicalAssignmentAvailability,
    pub issues: Vec<TechnicalAssignmentIssue>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TechnicalAssignmentAssessmentError {
    pub missing_load_point_ids: Vec<u32>,
}
```

- [ ] **Step 5: Implement deterministic group classification**

Normalize group members and iterate groups lexicographically. Reject absent expected option-map entries. Treat a non-empty group set whose global canonical-configuration union is empty as `NoPileConfigurations`.

For each group, reuse aggregate statuses and compute:

```rust
let status = if aggregates.iter().any(|item| item.status == Valid) {
    None
} else if aggregates.iter().all(|item| item.status == Missing) {
    Some(TechnicalAssignmentIssueStatus::MissingCapacityData)
} else {
    Some(TechnicalAssignmentIssueStatus::InsufficientCapacity)
};
```

Determine individually valid members once. Emit sorted per-location issues with group IDs, blocker IDs, missing-CPT union, and the mixed-case flag. Do not inspect optimizer settings.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Task 2 test command. Expected: all tests pass deterministically under shuffled group/map/option input.

- [ ] **Step 7: Commit the group assessor**

```powershell
git add crates/pile-plan-core/src/technical_assignment.rs crates/pile-plan-core/src/lib.rs
git commit -m "feat: assess grouped technical assignability"
```

### Task 3: Reuse assessment in default assignment and greedy preparation

**Files:**
- Modify: `crates/pile-plan-core/src/analysis.rs`
- Modify: `crates/pile-plan-core/src/optimization_units.rs`
- Modify: `crates/pile-plan-core/src/greedy_optimizer.rs`
- Modify: `crates/pile-plan-core/src/project.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**
- Consumes: Task 2 group assessment.
- Produces: optimizer-only `OptimizationUnassignedReason`, `technical_unassigned_load_point_ids`, and units containing only technically valid groups.

- [ ] **Step 1: Write failing default-assignment agreement tests**

In `analysis.rs`, add grouped fixtures asserting:

```rust
let assessment = assess_technical_assignment(&groups, &options).unwrap();
let choices = choose_default_pile_options(&options, &groups, 0.0, &cost_settings());
assert!(assessment.issues.iter().all(|issue| !choices.contains_key(&issue.load_point_id)));
assert_eq!(choices.get(&valid_group_member), Some(&expected_common_configuration));
```

Include one missing-member group and one no-common-overlap group. Every member of each invalid group must remain unassigned.

- [ ] **Step 2: Write failing optimization tests for separated outcomes**

Update greedy fixtures to require:

```rust
assert_eq!(result.technical_unassigned_load_point_ids, vec![1, 2]);
assert!(result.unassigned.is_empty());
assert_eq!(result.unassigned_group_count, 0);

assert!(result.unassigned.iter().all(|item|
    matches!(item.reason,
        OptimizationUnassignedReason::OptimizationConstraints
        | OptimizationUnassignedReason::ConfigurationLimits)));
```

Add a mixed run proving a technically invalid unlocked group is cleared while another valid group is optimized. Retain tests for candidate filters producing `optimization_constraints`, global limits producing `configuration_limits`, and locked/invariant failures blocking atomically.

- [ ] **Step 3: Run focused core tests and verify RED**

Run:

```powershell
cargo test -p pile-plan-core analysis::tests --no-fail-fast
cargo test -p pile-plan-core optimization_units::tests --no-fail-fast
cargo test -p pile-plan-core greedy_optimizer::tests --no-fail-fast
```

Expected: result-shape and old technical-reason assertions fail.

- [ ] **Step 4: Make default assignment consume shared group assessment**

Use an internal Task 2 group helper that returns valid aggregate candidates plus the assessment. Skip invalid groups and retain the existing deterministic cheapest-cost selection among common valid configurations. Do not add TypeScript classification.

- [ ] **Step 5: Simplify prepared optimization units**

Remove these technical-proxy fields from `OptimizationUnit`:

```rust
pub has_technically_valid_configuration: bool,
pub technically_valid_load_point_ids: Vec<u32>,
```

Add to `OptimizationPreparationResult`:

```rust
pub technical_unassigned_load_point_ids: Vec<u32>,
```

Assess every group before candidate filters. Exclude invalid unlocked groups from `units`, add their unlocked IDs to the technical list, and keep valid groups even when optimizer filters leave `options` empty. A locked invalid group continues to emit the existing locked-configuration diagnostic rather than being partially cleared.

Add `NoPileConfigurations` to `OptimizationPreparationDiagnosticKind` for the defensive case where a direct core call bypasses the disabled UI.

- [ ] **Step 6: Restrict greedy optimizer reasons**

Rename the public persisted enum and item for clarity:

```rust
pub enum OptimizationUnassignedReason {
    OptimizationConstraints,
    ConfigurationLimits,
}

pub struct OptimizationUnassignedLoadPoint {
    pub load_point_id: u32,
    pub reason: OptimizationUnassignedReason,
}
```

Add `technical_unassigned_load_point_ids: Vec<u32>` to `GreedyOptimizationResult`. Carry the prepared list through the result. In expansion, an uncovered technically valid unit gets `ConfigurationLimits` when it has eligible options and `OptimizationConstraints` when optimizer filters left it none. Count only those units in `unassigned_group_count`.

- [ ] **Step 7: Filter legacy technical reasons during Rust project loading**

Keep schema-3 compatibility with a custom deserializer for `PilePlan.optimization_unassigned`. Accept and retain only `optimization_constraints` and `configuration_limits`; silently discard `no_valid_option`, `group_member_without_valid_option`, and `no_common_group_configuration`. Serialization writes only the two current variants.

Add a `project.rs` round-trip test using a legacy technical reason plus a current optimizer reason and assert only the current reason survives.

- [ ] **Step 8: Run the complete core suite and verify GREEN**

Run:

```powershell
cargo test -p pile-plan-core --no-fail-fast
```

Expected: all core tests pass, including default/optimizer agreement and legacy-load filtering.

- [ ] **Step 9: Commit shared operation behavior**

```powershell
git add crates/pile-plan-core/src/analysis.rs crates/pile-plan-core/src/optimization_units.rs crates/pile-plan-core/src/greedy_optimizer.rs crates/pile-plan-core/src/project.rs crates/pile-plan-core/src/lib.rs
git commit -m "feat: separate technical and optimizer outcomes"
```

### Task 4: WASM, Tauri, and TypeScript assessment contracts

**Files:**
- Modify: `crates/pile-plan-wasm/src/lib.rs`
- Modify: `apps/pile-plan-studio/src-tauri/src/main.rs`
- Create: `apps/pile-plan-studio/src/core/technicalAssignmentContract.ts`
- Create: `apps/pile-plan-studio/src/core/technicalAssignmentContract.test.ts`
- Modify: `apps/pile-plan-studio/src/core/pileOptionAggregationContract.ts`
- Modify: `apps/pile-plan-studio/src/core/pileOptionAggregationContract.test.ts`
- Modify: `apps/pile-plan-studio/src/core/greedyOptimizationContract.ts`
- Modify: `apps/pile-plan-studio/src/core/greedyOptimizationContract.test.ts`
- Modify: `apps/pile-plan-studio/src/core/projectTypes.ts`
- Modify: `apps/pile-plan-studio/src/core/coreClient.ts`
- Regenerate: `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/*`

**Interfaces:**
- Consumes: Rust DTOs from Tasks 1–3.
- Produces: `assessTechnicalAssignmentCore(input) -> Promise<TechnicalAssignmentAssessment>`, extended aggregation DTOs, and optimizer-only result contracts.

- [ ] **Step 1: Write failing Rust wrapper tests**

In WASM and Tauri wrapper tests, build the same two-member missing fixture and assert:

```rust
assert_eq!(result.availability, TechnicalAssignmentAvailability::Available);
assert_eq!(result.issues[0].status, TechnicalAssignmentIssueStatus::MissingCapacityData);
assert_eq!(result.issues[0].group_load_point_ids, vec![1, 2]);
```

Also update greedy wrapper assertions for `technical_unassigned_load_point_ids` and the two-value optimizer reason enum.

- [ ] **Step 2: Run wrapper tests and verify RED**

Run:

```powershell
cargo test -p pile-plan-wasm --no-fail-fast
cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml --no-fail-fast
```

Expected: missing command/import and changed DTO failures.

- [ ] **Step 3: Add thin Rust assessment commands**

Add serializable request structs containing `groups` and `options_by_load_point`. Expose:

```rust
assess_technical_assignment(request) -> Result<TechnicalAssignmentAssessment, TechnicalAssignmentAssessmentError>
```

through `#[wasm_bindgen]` and `#[tauri::command]`; register the Tauri command. Both wrappers deserialize, call the pure core function once, and serialize without classifying results.

- [ ] **Step 4: Run wrapper tests and verify GREEN**

Run both Task 4 Rust commands. Expected: all pass.

- [ ] **Step 5: Write failing TypeScript contract tests**

Define a fixture and assert browser numeric maps versus desktop records, deep cloning, missing-CPT arrays, and optimizer normalization:

```ts
assert.deepEqual(result.issues[0], {
  load_point_id: 1,
  cause: "group_member_without_valid_option",
  status: "missing_capacity_data",
  group_load_point_ids: [1, 2],
  blocking_load_point_ids: [2],
  missing_cpt_ids: [61, 62],
  has_missing_capacity_data: true,
});
assert.deepEqual(aggregate.missing_cpt_ids, [61, 62]);
assert.deepEqual(greedy.technical_unassigned_load_point_ids, [1, 2]);
```

- [ ] **Step 6: Run TypeScript contract tests and verify RED**

Run from `apps/pile-plan-studio`:

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
node --test src/core/technicalAssignmentContract.test.ts src/core/pileOptionAggregationContract.test.ts src/core/greedyOptimizationContract.test.ts
```

Expected: missing module/fields and old optimizer union failures.

- [ ] **Step 7: Implement TypeScript DTOs and client routing**

Define exact string unions matching Rust:

```ts
export type TechnicalAssignmentIssueCause =
  | "no_valid_option"
  | "group_member_without_valid_option"
  | "no_common_valid_group_configuration";
export type TechnicalAssignmentIssueStatus =
  | "missing_capacity_data"
  | "insufficient_capacity";
export type OptimizationUnassignedReason =
  | "optimization_constraints"
  | "configuration_limits";
```

Implement browser/desktop request conversion using the existing serialization helpers and add `assessTechnicalAssignmentCore`. Carry Rust's option `technical_status` into the TypeScript `technicalStatus` field, extend aggregate conversion with `missing_cpt_ids`, and normalize all returned arrays defensively. TypeScript consumes the serialized effective status and does not reclassify an option.

- [ ] **Step 8: Regenerate browser bindings**

Run from `apps/pile-plan-studio`:

```powershell
npm run build:wasm
```

Expected: generated JS and declarations expose `assess_technical_assignment` and the current DTO shape.

- [ ] **Step 9: Run focused frontend tests and typecheck**

Run:

```powershell
node --test src/core/technicalAssignmentContract.test.ts src/core/pileOptionAggregationContract.test.ts src/core/greedyOptimizationContract.test.ts
npx tsc -p tsconfig.json --noEmit
```

Expected: contract tests pass and TypeScript reports no errors.

- [ ] **Step 10: Commit transport source and generated changes**

```powershell
git add crates/pile-plan-wasm/src/lib.rs apps/pile-plan-studio/src-tauri/src/main.rs apps/pile-plan-studio/src/core/technicalAssignmentContract.ts apps/pile-plan-studio/src/core/technicalAssignmentContract.test.ts apps/pile-plan-studio/src/core/pileOptionAggregationContract.ts apps/pile-plan-studio/src/core/pileOptionAggregationContract.test.ts apps/pile-plan-studio/src/core/greedyOptimizationContract.ts apps/pile-plan-studio/src/core/greedyOptimizationContract.test.ts apps/pile-plan-studio/src/core/projectTypes.ts apps/pile-plan-studio/src/core/coreClient.ts apps/pile-plan-studio/src/core/wasm/pile-plan-wasm
git commit -m "feat: expose technical assignment assessment"
```

### Task 5: Stale-safe frontend assessment lifecycle

**Files:**
- Create: `apps/pile-plan-studio/src/components/domain/technicalAssignmentController.ts`
- Create: `apps/pile-plan-studio/src/components/domain/technicalAssignmentController.test.ts`
- Create: `apps/pile-plan-studio/src/components/domain/useTechnicalAssignment.ts`
- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/AppLoadPointGroups.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanWorkspace.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.tsx`

**Interfaces:**
- Consumes: ready groups, current analyzed options, and `assessTechnicalAssignmentCore`.
- Produces: `TechnicalAssignmentSnapshot` with `idle | loading | ready | unavailable | error` and `issuesByLoadPointId`.

- [ ] **Step 1: Write failing controller lifecycle tests**

Cover the same guarantees as other controllers:

```ts
assert.equal(controller.getState().status, "idle");
await controller.update({ groups, pileOptionsByLoadPointId });
assert.equal(controller.getState().status, "ready");
assert.equal(controller.getState().issuesByLoadPointId.get(1)?.cause, "no_valid_option");
```

Add deferred-promise tests proving an older response cannot replace a newer result, equal signatures reuse a completed result, `no_pile_configurations` becomes `unavailable`, errors contain no guessed issues, and `dispose()` suppresses publication.

- [ ] **Step 2: Run the controller test and verify RED**

Run:

```powershell
node --test src/components/domain/technicalAssignmentController.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the controller and React hook**

Define:

```ts
export type TechnicalAssignmentSnapshot =
  | { status: "idle" | "loading"; issuesByLoadPointId: Map<number, TechnicalAssignmentIssue>; error: null }
  | { status: "ready"; issuesByLoadPointId: Map<number, TechnicalAssignmentIssue>; error: null }
  | { status: "unavailable"; issuesByLoadPointId: Map<number, TechnicalAssignmentIssue>; error: null }
  | { status: "error"; issuesByLoadPointId: Map<number, TechnicalAssignmentIssue>; error: Error };
```

Build a deterministic signature from sorted group IDs and complete option facts. Clone maps/arrays at publication. `useTechnicalAssignment` owns subscribe/update/dispose and follows `useLoadPointGroups` lifecycle style.

- [ ] **Step 4: Wire one derived assessment at App scope**

Call the hook after `useLoadPointGroups`. Do not add it to `ProjectState`. Pass the snapshot through `PilePlanWorkspace` to `PilePlanViewer` and directly to `RightPanel`. Suspend assessment while groups or project analysis are pending/failed; preserve stale guards when project content changes.

- [ ] **Step 5: Disable optimization for unavailable assessment**

Extend `isOptimizationDisabled` with `technicalAssessmentStatus`. Return `true` for `idle`, `loading`, `unavailable`, or `error`, and only permit a run for `ready`. Add `noPileConfigurations` localized blocked text as a defensive fallback in `formatOptimizationDiagnostics`.

- [ ] **Step 6: Run focused lifecycle/orchestration tests and typecheck**

Run:

```powershell
node --test src/components/domain/technicalAssignmentController.test.ts src/AppLoadPointGroups.test.ts src/components/domain/optimizationPanelModel.test.ts
npx tsc -p tsconfig.json --noEmit
```

Expected: controller and App ownership tests pass without placing derived assessment in persisted state.

- [ ] **Step 7: Commit the frontend assessment lifecycle**

```powershell
git add apps/pile-plan-studio/src/components/domain/technicalAssignmentController.ts apps/pile-plan-studio/src/components/domain/technicalAssignmentController.test.ts apps/pile-plan-studio/src/components/domain/useTechnicalAssignment.ts apps/pile-plan-studio/src/App.tsx apps/pile-plan-studio/src/AppLoadPointGroups.test.ts apps/pile-plan-studio/src/components/domain/PilePlanWorkspace.tsx apps/pile-plan-studio/src/components/domain/RightPanel.tsx apps/pile-plan-studio/src/components/domain/optimizationPanelModel.ts apps/pile-plan-studio/src/components/domain/optimizationPanelModel.test.ts apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json
git commit -m "feat: derive current technical assignment state"
```

### Task 6: Optimizer application, persistence, summary, and viewer markers

**Files:**
- Modify: `apps/pile-plan-studio/src/components/domain/optimizationPanelModel.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/optimizationPanelModel.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/optimizationSummary.ts`
- Modify: `apps/pile-plan-studio/src/domain/optimizationSummary.test.ts`
- Modify: `apps/pile-plan-studio/src/core/projectFile.ts`
- Modify: `apps/pile-plan-studio/src/core/projectFile.test.ts`
- Delete: `apps/pile-plan-studio/src/domain/optimizationConflict.ts`
- Delete: `apps/pile-plan-studio/src/domain/optimizationConflict.test.ts`
- Modify: `apps/pile-plan-studio/src/viewer/loadPointMarker.ts`
- Modify: `apps/pile-plan-studio/src/viewer/loadPointMarker.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanViewer.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/viewer.css`
- Modify: `apps/pile-plan-studio/src/components/domain/OptimizationPanel.tsx`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/common.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/common.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json`

**Interfaces:**
- Consumes: `technical_unassigned_load_point_ids`, optimizer-only reasons, and `TechnicalAssignmentSnapshot`.
- Produces: atomic clearing, location-only summary counts, persisted optimizer-only maps, and correct neutral/cross/question-mark markers.

- [ ] **Step 1: Write failing optimization application and summary tests**

Assert:

```ts
assert.deepEqual(applied.optimizationUnassignedByLoadPoint, new Map([
  [5, "configuration_limits"],
]));
assert.equal(applied.choices.has(1), false); // technical ID cleared
assert.deepEqual(applied.summary, {
  assignedCount: 3,
  changedCount: 5,
  technicalUnassignedCount: 1,
  optimizerUnassignedCount: 1,
});
```

Use duplicate-free affected IDs and prove the summary contains no group-count field even when `result.unassigned_group_count` is nonzero.

- [ ] **Step 2: Write failing persistence filtering tests**

Load an IFCPP fixture containing all five old reason strings. Assert only:

```ts
new Map([
  [4, "optimization_constraints"],
  [5, "configuration_limits"],
])
```

is present at runtime and written back. Unknown future reason strings must also be ignored rather than trusted.

- [ ] **Step 3: Write failing marker tests**

Replace option-scanning fixtures with structured states:

```ts
assert.equal(getUnselectedLoadPointMarkerState({ analysisStatus: "loading" }), "pending");
assert.equal(getUnselectedLoadPointMarkerState({ analysisStatus: "error" }), "analysis-error");
assert.equal(getUnselectedLoadPointMarkerState({ analysisStatus: "unavailable" }), "unavailable");
assert.equal(getUnselectedLoadPointMarkerState({
  analysisStatus: "ready",
  technicalIssue: missingIssue,
}), "missing-capacity-data");
assert.equal(getUnselectedLoadPointMarkerState({
  analysisStatus: "ready",
  technicalIssue: insufficientIssue,
  optimizationUnassignedReason: "configuration_limits",
}), "insufficient-capacity");
assert.equal(getUnselectedLoadPointMarkerState({
  analysisStatus: "ready",
  optimizationUnassignedReason: "configuration_limits",
}), "optimizer-unassigned");
assert.equal(getUnselectedLoadPointMarkerState({ analysisStatus: "ready" }), "unassigned");
```

- [ ] **Step 4: Run focused frontend tests and verify RED**

Run:

```powershell
node --test src/components/domain/optimizationPanelModel.test.ts src/domain/optimizationSummary.test.ts src/core/projectFile.test.ts src/viewer/loadPointMarker.test.ts src/components/domain/PilePlanViewer.test.ts
```

Expected: old result, persistence, and marker semantics fail.

- [ ] **Step 5: Apply optimizer results atomically without persisting technical causes**

Build `affectedLoadPointIds` from assignments, optimizer-unassigned entries, and `technical_unassigned_load_point_ids`. Delete all affected previous choices, apply assignments, and persist only the optimizer-unassigned entries.

Change summary shape to:

```ts
export type OptimizationRunSummary = {
  assignedCount: number;
  changedCount: number;
  technicalUnassignedCount: number;
  optimizerUnassignedCount: number;
};
```

Count unique technical IDs. Render four location-only lines when nonzero; never render `unassigned_group_count` in `OptimizationPanel`.

- [ ] **Step 6: Filter optimizer reasons at the TypeScript persistence boundary**

Implement:

```ts
function isOptimizationUnassignedReason(value: unknown): value is OptimizationUnassignedReason {
  return value === "optimization_constraints" || value === "configuration_limits";
}
```

Use it while loading wire entries and serialize the already-filtered runtime map. Remove obsolete technical optimizer translation keys and delete `optimizationConflict.ts`, whose permanent responsibility moves to Task 7.

- [ ] **Step 7: Render marker priority from derived assessment**

Use this priority for an unassigned location while preserving distinct semantic states:

```text
pending -> neutral pending dot
analysis error -> neutral analysis-error dot with error-specific accessible/title text
analysis_unavailable -> neutral unavailable dot
technical missing -> yellow cross
technical insufficient -> red cross
optimizer-only reason -> question mark
fallback technically valid unassigned state -> neutral unassigned dot
```

The neutral states may share the current 9 px grey-dot visual, but `pending`, `analysis-error`, `unavailable`, and `unassigned` remain distinct values with suitable accessible/title text. All members receive the Rust-provided group status; do not inspect raw options in the viewer.

- [ ] **Step 8: Run focused frontend tests and typecheck and verify GREEN**

Run the Task 6 test command and:

```powershell
npx tsc -p tsconfig.json --noEmit
```

Expected: all pass and no UI summary references a group count.

- [ ] **Step 9: Commit optimizer and viewer semantics**

```powershell
git add apps/pile-plan-studio/src/components/domain/optimizationPanelModel.ts apps/pile-plan-studio/src/components/domain/optimizationPanelModel.test.ts apps/pile-plan-studio/src/domain/optimizationSummary.ts apps/pile-plan-studio/src/domain/optimizationSummary.test.ts apps/pile-plan-studio/src/core/projectFile.ts apps/pile-plan-studio/src/core/projectFile.test.ts apps/pile-plan-studio/src/domain/optimizationConflict.ts apps/pile-plan-studio/src/domain/optimizationConflict.test.ts apps/pile-plan-studio/src/viewer/loadPointMarker.ts apps/pile-plan-studio/src/viewer/loadPointMarker.test.ts apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx apps/pile-plan-studio/src/components/domain/PilePlanViewer.test.ts apps/pile-plan-studio/src/components/domain/viewer.css apps/pile-plan-studio/src/components/domain/OptimizationPanel.tsx apps/pile-plan-studio/src/i18n/locales/en/common.json apps/pile-plan-studio/src/i18n/locales/nl/common.json apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json
git commit -m "fix: separate technical and optimizer feedback"
```

### Task 7: Permanent coherent notices with linked location IDs

**Files:**
- Create: `apps/pile-plan-studio/src/domain/technicalAssignmentNotice.ts`
- Create: `apps/pile-plan-studio/src/domain/technicalAssignmentNotice.test.ts`
- Create: `apps/pile-plan-studio/src/components/domain/TechnicalAssignmentNotice.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/rightPanel.css`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json`

**Interfaces:**
- Consumes: selected location ID and `TechnicalAssignmentSnapshot`.
- Produces: `TechnicalAssignmentNoticeModel` and a localized warning/error block with inline load-point links.

- [ ] **Step 1: Write failing pure notice-model tests**

Define a model that preserves structured composition:

```ts
export type TechnicalAssignmentNoticeModel = {
  cause: TechnicalAssignmentIssueCause;
  status: TechnicalAssignmentIssueStatus;
  loadPointIds: number[];
  blockingLoadPointIds: number[];
  hasMissingCapacityData: boolean;
};
```

Assert selection returns the matching issue, clones and sorts IDs, and returns `null` for a valid location, multi-selection, loading, unavailable, or error states.

- [ ] **Step 2: Run notice-model tests and verify RED**

Run:

```powershell
node --test src/domain/technicalAssignmentNotice.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the pure model and coherent translation matrix**

Map the three causes to lead-sentence keys and the two statuses plus mixed flag to explanation keys. Provide Dutch and English text that:

- uses "location(s)" rather than "group member";
- explains that linked locations must receive one common configuration;
- mentions missing data, insufficient capacity, or both accurately;
- permits later rephrasing to "the group of locations 12 and 14" without changing DTOs.

- [ ] **Step 4: Implement linked notice rendering**

Render all sorted relevant IDs as inline buttons. Use `selectLoadPoint(state, id)` for navigation. Cause text and explanation remain visible without hover. Style `missing_capacity_data` as warning/yellow and `insufficient_capacity` as error/red while retaining readable neutral body text.

For `analysis_unavailable`, render a separate non-technical notice above the empty table:

```text
Pile options cannot be determined.
The foundation advice contains no usable bearing-capacity configurations.
```

- [ ] **Step 5: Integrate above the pile-option section**

Replace the old optimization-conflict block in `LoadPointPanel` with `TechnicalAssignmentNotice`. Pass the derived snapshot from `RightPanel` props. Ensure notices appear before any optimizer run and update after analysis/group changes.

- [ ] **Step 6: Run focused UI/model tests and typecheck**

Run:

```powershell
node --test src/domain/technicalAssignmentNotice.test.ts src/components/domain/RightPanel.test.ts src/components/domain/WorkspaceTranslations.test.ts
npx tsc -p tsconfig.json --noEmit
```

Expected: copy keys exist in both languages, location navigation is wired, and no user-facing "group member" string remains in this flow.

- [ ] **Step 7: Commit permanent technical notices**

```powershell
git add apps/pile-plan-studio/src/domain/technicalAssignmentNotice.ts apps/pile-plan-studio/src/domain/technicalAssignmentNotice.test.ts apps/pile-plan-studio/src/components/domain/TechnicalAssignmentNotice.tsx apps/pile-plan-studio/src/components/domain/RightPanel.tsx apps/pile-plan-studio/src/components/domain/RightPanel.test.ts apps/pile-plan-studio/src/components/domain/rightPanel.css apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json
git commit -m "feat: explain permanent technical assignment issues"
```

### Task 8: Missing rows and clickable CPT popover

**Files:**
- Modify: `apps/pile-plan-studio/src/domain/pileOptionStatus.ts`
- Modify: `apps/pile-plan-studio/src/domain/pileOptionStatus.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/pileOptionTable.ts`
- Modify: `apps/pile-plan-studio/src/domain/pileOptionTable.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/rightPanelModel.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/rightPanelModel.test.ts`
- Create: `apps/pile-plan-studio/src/components/domain/MissingCptPopover.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/rightPanel.css`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json`

**Interfaces:**
- Consumes: Rust-produced option `technicalStatus`, aggregate status, and `missing_cpt_ids` from core.
- Produces: rows with `missingCptIds`, inconclusive metrics replaced by `-`, and keyboard-accessible CPT navigation.

- [ ] **Step 1: Write failing row-model tests**

For a single Missing option with a partial utilization and FRd, assert:

```ts
assert.equal(row.useValue, null);
assert.equal(row.useLabel, "-");
assert.equal(row.governingCptId, null);
assert.equal(row.governingLabel, "-");
assert.equal(row.frdValue, null);
assert.equal(row.frdLabel, "-");
assert.deepEqual(row.missingCptIds, [61, 62]);
```

For a multi-selection Missing aggregate, assert `maxUseValue`, `criticalLoadPointId`, and their labels are null/dashes while total cost remains. Valid and insufficient rows must retain their conclusive fields.

- [ ] **Step 2: Write failing status and sorting/filtering tests**

Change the third effective label from generic `Not OK` to `Insufficient capacity` and verify Missing/insufficient filters still use localized display values. Add `missingCptIds: number[]` to `PileOptionTableRow` but do not make it a separate sortable column.

- [ ] **Step 3: Run focused model tests and verify RED**

Run:

```powershell
node --test src/domain/pileOptionStatus.test.ts src/domain/pileOptionTable.test.ts src/components/domain/rightPanelModel.test.ts
```

Expected: partial metrics remain and the row field/label does not exist.

- [ ] **Step 4: Implement conclusive presentation rows**

Consume `technicalStatus` once per single row; do not reconstruct it from `isOption`, utilization, or missing IDs. For Missing rows explicitly set all inconclusive numeric values to `null` and labels to `-`; do not merely hide cells in JSX. Clone sorted unique missing IDs from both individual options and aggregates. Keep cost/total cost intact.

- [ ] **Step 5: Implement the compact anchored popover**

`MissingCptPopover` owns its open state and trigger reference. The trigger displays localized Missing status and a concise native title. The open popover lists only identifier values such as `61`, `62`; each button invokes `openCpt`, calls `stopPropagation`, and closes.

Add document-level outside-pointer and Escape handling only while open. Restore focus to the trigger after Escape, close if its row unmounts, and provide appropriate `aria-expanded`, `aria-haspopup`, dialog/list labeling, and focus-visible styles.

- [ ] **Step 6: Integrate without triggering row assignment**

In the status-cell branch, render the popover only when `missingCptIds.length > 0`; otherwise render the ordinary noninteractive Missing pill with an explanatory title, never an empty popover. Stop pointer/click propagation at both trigger and popover. Preserve the existing row click for actual pile assignment and the existing governing-CPT/critical-location links.

- [ ] **Step 7: Run focused UI tests and typecheck**

Run:

```powershell
node --test src/domain/pileOptionStatus.test.ts src/domain/pileOptionTable.test.ts src/components/domain/rightPanelModel.test.ts src/components/domain/RightPanel.test.ts src/components/domain/WorkspaceTranslations.test.ts
npx tsc -p tsconfig.json --noEmit
```

Expected: row values, popover wiring, translations, and interaction guards pass.

- [ ] **Step 8: Commit table and popover behavior**

```powershell
git add apps/pile-plan-studio/src/domain/pileOptionStatus.ts apps/pile-plan-studio/src/domain/pileOptionStatus.test.ts apps/pile-plan-studio/src/domain/pileOptionTable.ts apps/pile-plan-studio/src/domain/pileOptionTable.test.ts apps/pile-plan-studio/src/components/domain/rightPanelModel.ts apps/pile-plan-studio/src/components/domain/rightPanelModel.test.ts apps/pile-plan-studio/src/components/domain/MissingCptPopover.tsx apps/pile-plan-studio/src/components/domain/RightPanel.tsx apps/pile-plan-studio/src/components/domain/RightPanel.test.ts apps/pile-plan-studio/src/components/domain/rightPanel.css apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json
git commit -m "feat: explain missing pile option capacities"
```

### Task 9: Regression verification and live acceptance

**Files:**
- Verify regenerated: `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/*`
- Modify: `apps/pile-plan-studio/src/AppOptimization.test.ts`
- Modify: `docs/superpowers/plans/2026-09-03-technical-pile-option-assessment.md`

**Interfaces:**
- Consumes: verified source contracts and integrated UI.
- Produces: integration coverage, a checked-in browser artifact matching Rust, full automated evidence, and completed live acceptance notes.

- [ ] **Step 1: Add the end-to-end optimization integration cases**

Extend `AppOptimization.test.ts` with grouped missing, grouped insufficient, and optimizer-only unassigned fixtures. Assert technical IDs are cleared without persisted optimizer reasons, optimizer-only IDs retain their two supported reasons, and the visible summary contains location counts but no group count.

- [ ] **Step 2: Rebuild and verify checked-in WASM bindings**

Run from `apps/pile-plan-studio`:

```powershell
$env:Path = 'C:\Program Files\nodejs;C:\Users\bjorn\.cargo\bin;' + $env:Path
npm run build:wasm
```

Expected: generated JS/declarations expose `assess_technical_assignment`; the `.wasm` binary reflects current Rust.

- [ ] **Step 3: Run complete Rust verification**

Run from repository root:

```powershell
cargo test --workspace --no-fail-fast
cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml --no-fail-fast
```

Expected: core, WASM wrapper, and Tauri wrapper suites all exit zero.

- [ ] **Step 4: Run complete frontend verification**

Run from `apps/pile-plan-studio`:

```powershell
npm test
npx tsc -p tsconfig.json --noEmit
npm run build
```

Expected: all Node tests pass, TypeScript reports no errors, and production build exits zero.

- [ ] **Step 5: Check generated and source diffs**

Run from repository root:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only intended source, generated WASM, tests, translations, and this plan are modified.

- [ ] **Step 6: Commit integration coverage and completed plan checkboxes**

```powershell
git add apps/pile-plan-studio/src/AppOptimization.test.ts apps/pile-plan-studio/src/core/wasm/pile-plan-wasm docs/superpowers/plans/2026-09-03-technical-pile-option-assessment.md
git commit -m "test: cover technical optimization outcomes"
```

- [ ] **Step 7: Run live viewer acceptance**

Use the existing development viewer for the current branch and verify:

1. a group with one location missing every option shows yellow crosses for all members;
2. a group with individually valid but non-overlapping options shows yellow crosses;
3. a group with a completely assessable insufficient common configuration shows red crosses;
4. a mixed group is red and its notice also mentions missing data;
5. technical groups do not appear as optimizer question marks or unresolved optimizer counts;
6. optimizer-only candidate/limit failures still show question marks;
7. the summary reports technical and optimizer location counts without group counts;
8. an empty foundation-advice configuration set shows neutral grey dots and disables optimization;
9. permanent notices appear before optimization and every location ID navigates correctly;
10. single and multi Missing rows show dashes for inconclusive facts;
11. the Missing popover lists deduplicated identifiers and opens each CPT without assigning the row;
12. English and Dutch copies remain coherent and existing legend behavior is unchanged.

Record the observed result under this step before marking it complete.

- [ ] **Step 8: Request code review and finish the branch**

Use `superpowers:requesting-code-review` against the approved spec and this plan. Resolve findings through test-first changes, rerun affected and full gates, then use `superpowers:finishing-a-development-branch` to present merge/push options. Do not push or merge merely because automated tests passed.
