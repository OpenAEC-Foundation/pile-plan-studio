# Greedy Optimization Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing greedy optimizer consume Rust-prepared `OptimizationUnit`s so automatic load-point groups are optimized atomically.

**Architecture:** A single Rust operation selects complete target groups, calls the solver-independent unit preparer, and either returns structured blocking diagnostics or runs a deterministic greedy unit solver. TypeScript passes the cached group partition through thin browser/desktop serializers and applies only completed outcomes.

**Tech Stack:** Rust, serde, wasm-bindgen, Tauri 2, TypeScript 6, React 19, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-09-02-greedy-optimization-units-design.md`

## Global Constraints

- Do not implement spatial coherence, Gabriel-graph scoring, ILP, or any replacement solver from #21.
- Do not change legend storage, encoding, activation ownership, or palette behavior from #24.
- Keep grouping, technical validity, costs, locks, target expansion, and solver decisions in Rust.
- Keep the current schema-3 metre-valued optimizer settings on the persistence boundary; normalize enabled tip levels to integer millimetres inside Rust.
- A blocked preparation result must not mutate a pile plan or create a new plan.
- Locked load points remain unchanged.
- Browser/WASM and desktop/Tauri behavior must remain equivalent.
- Use `feature/0.3.0-greedy-optimization-units`; never create a branch containing `codex/`.
- Use test-driven development and commit each independently verified task.

---

### Task 1: Rust target-group selection and preparation boundary

**Files:**
- Create: `crates/pile-plan-core/src/greedy_optimizer.rs`
- Modify: `crates/pile-plan-core/src/optimization_units.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**
- Consumes: `LoadPointGroup`, `PrepareOptimizationUnitsInput`, `OptimizationCandidateSettings`, and `prepare_optimization_units`.
- Produces: `select_target_groups(groups: &[LoadPointGroup], target_ids: &[u32]) -> Result<Vec<LoadPointGroup>, OptimizationPreparationDiagnostic>` and `InvalidGroupPartition` diagnostic support.

- [x] **Step 1: Write failing Rust tests for target expansion and malformed partitions**

Add focused module tests equivalent to:

```rust
#[test]
fn selected_member_expands_to_complete_group() {
    let groups = vec![group(&[1, 2]), group(&[3])];
    assert_eq!(select_target_groups(&groups, &[2]).unwrap(), vec![group(&[1, 2])]);
}

#[test]
fn duplicate_selected_membership_is_blocked() {
    let groups = vec![group(&[1, 2]), group(&[2, 3])];
    let diagnostic = select_target_groups(&groups, &[2]).unwrap_err();
    assert_eq!(diagnostic.kind, OptimizationPreparationDiagnosticKind::InvalidGroupPartition);
    assert_eq!(diagnostic.load_point_ids, vec![2]);
}

#[test]
fn missing_target_membership_is_blocked() {
    let diagnostic = select_target_groups(&[group(&[1])], &[2]).unwrap_err();
    assert_eq!(diagnostic.load_point_ids, vec![2]);
}
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `cargo test -p pile-plan-core greedy_optimizer::tests --no-fail-fast`

Expected: compilation fails because the module, selector, or diagnostic variant does not exist.

- [x] **Step 3: Implement deterministic selection and validation**

Normalize target IDs with `BTreeSet`. Sort/deduplicate every group copy, select groups intersecting the target, and count membership for requested target IDs. Return one `InvalidGroupPartition` diagnostic containing sorted missing or multiply represented target IDs. Return selected groups sorted lexicographically.

Add:

```rust
InvalidGroupPartition,
```

to `OptimizationPreparationDiagnosticKind` and register `mod greedy_optimizer` in `lib.rs` without yet replacing the public optimizer export.

- [x] **Step 4: Run focused and preparation tests and verify GREEN**

Run: `cargo test -p pile-plan-core greedy_optimizer::tests --no-fail-fast`

Run: `cargo test -p pile-plan-core optimization_units::tests --no-fail-fast`

Expected: all selected tests pass.

- [x] **Step 5: Commit the target boundary**

```powershell
git add crates/pile-plan-core/src/greedy_optimizer.rs crates/pile-plan-core/src/optimization_units.rs crates/pile-plan-core/src/lib.rs
git commit -m "feat: select complete optimization target groups"
```

### Task 2: Greedy solver over `OptimizationUnit`

**Files:**
- Modify: `crates/pile-plan-core/src/greedy_optimizer.rs`
- Modify: `crates/pile-plan-core/src/analysis.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`
- Modify: `crates/pile-plan-core/src/project.rs`

**Interfaces:**
- Consumes: `prepare_optimization_units(&PrepareOptimizationUnitsInput) -> OptimizationPreparationResult` and canonical unit options with concrete `total_cost`.
- Produces: `greedy_optimize_pile_choices(&GreedyOptimizationInput) -> GreedyOptimizationOutcome` plus the existing completed `GreedyOptimizationResult` payload.

- [x] **Step 1: Write failing tests for completed, grouped, forced, and blocked runs**

Cover at minimum:

```rust
assert!(matches!(
    greedy_optimize_pile_choices(&grouped_input()),
    GreedyOptimizationOutcome::Completed { result }
        if result.assignments.iter().map(|item| item.load_point_id).collect::<Vec<_>>() == vec![1, 2]
));

assert!(matches!(
    greedy_optimize_pile_choices(&missing_cost_input()),
    GreedyOptimizationOutcome::Blocked { diagnostics }
        if diagnostics.iter().any(|item| item.kind == OptimizationPreparationDiagnosticKind::MissingRelevantCost)
));
```

Add explicit cases for a six-member unit outweighing a singleton in coverage, total unit cost breaking equal-coverage ties, a forced configuration propagating only to unlocked members, non-target groups not blocking, and whole-plan baselines excluding expanded target members.

- [x] **Step 2: Run the focused tests and verify RED**

Run: `cargo test -p pile-plan-core greedy_optimizer::tests --no-fail-fast`

Expected: failures because the public input/outcome and unit solver are incomplete.

- [x] **Step 3: Move greedy-owned DTOs and implement the tagged outcome**

Move `GreedyOptimizationSettings`, `OptimizationLimitScope`, `GreedyOptimizationInput`, `GreedyOptimizedPileChoice`, `GreedyUnassignedReason`, `GreedyUnassignedLoadPoint`, and `GreedyOptimizationResult` from `analysis.rs` to `greedy_optimizer.rs`.

Define:

```rust
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum GreedyOptimizationOutcome {
    Completed { result: GreedyOptimizationResult },
    Blocked { diagnostics: Vec<OptimizationPreparationDiagnostic> },
}
```

Add `groups: Vec<LoadPointGroup>` and change `pile_head_level_m` to `Option<f64>` on `GreedyOptimizationInput`. Re-export all moved public types from `lib.rs`.

- [x] **Step 4: Implement the outer preparation adapter**

Select target groups in Rust, compute the expanded target ID set, construct canonical `OptimizationCandidateSettings`, and call `prepare_optimization_units` once. Convert every legacy enabled metre tip with `PileConfigurationKey::from_metres(0, level).pile_tip_level_mm` or the focused canonical helper.

If group validation or preparation yields diagnostics, return `Blocked` immediately. For `whole-plan`, build baseline keys only from assignments outside the expanded target.

- [x] **Step 5: Implement greedy scoring and selection over units**

Use a score with the exact ordering:

```rust
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct OptimizationScore {
    uncovered_load_point_count: usize,
    known_total_cost: u64,
}
```

For each unit, choose its minimum-cost option whose configuration is selected. Sum `unit.load_point_ids.len()` when uncovered and `option.total_cost` when covered. Seed selected keys with forced configurations. Evaluate remaining canonical candidates deterministically and continue only while the score improves.

Permit a candidate when its union with baseline, forced, and already selected keys stays within every limit. If a fixed baseline already exceeds a limit, permit only candidates that do not increase any exceeded count; reusing an already-counted key remains legal.

- [x] **Step 6: Expand results atomically to group members**

For a covered unit, output its chosen configuration for every unlocked member. Do not output locked members as changed or unassigned. For an uncovered unforced unit, output `configuration_limits` for every member. Sort assignments and unassigned entries by load-point ID and calculate summary counts from the union of baseline and selected canonical keys.

- [x] **Step 7: Adapt the existing singleton regression tests**

Move greedy tests out of `analysis.rs`, construct singleton `LoadPointGroup`s in shared test helpers, unwrap only `Completed` outcomes, and preserve current expected assignments and deterministic ordering. Update the missing/invalid cases to expect `Blocked` preparation diagnostics where the approved group spec strengthened behavior.

- [x] **Step 8: Run the core suite and verify GREEN**

Run: `cargo test -p pile-plan-core --no-fail-fast`

Expected: all core tests pass.

- [x] **Step 9: Commit the unit solver**

```powershell
git add crates/pile-plan-core/src/analysis.rs crates/pile-plan-core/src/greedy_optimizer.rs crates/pile-plan-core/src/lib.rs crates/pile-plan-core/src/project.rs docs/superpowers/plans/2026-09-02-greedy-optimization-units.md
git commit -m "feat: run greedy optimization over grouped units"
```

### Task 3: WASM and Tauri parity

**Files:**
- Modify: `crates/pile-plan-wasm/src/lib.rs`
- Modify: `apps/pile-plan-studio/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `GreedyOptimizationInput` with groups and nullable pile-head level.
- Produces: identical serialized `GreedyOptimizationOutcome` values from `greedy_optimize` in browser and desktop modes.

- [ ] **Step 1: Write failing wrapper tests**

Update the existing WASM and Tauri core-wrapper tests to send singleton and multi-member groups and assert both status shapes:

```rust
assert!(matches!(outcome, GreedyOptimizationOutcome::Completed { .. }));
assert!(matches!(blocked, GreedyOptimizationOutcome::Blocked { diagnostics } if !diagnostics.is_empty()));
```

- [ ] **Step 2: Run wrapper tests and verify RED**

Run: `cargo test -p pile-plan-wasm --no-fail-fast`

Run: `cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml --no-fail-fast`

Expected: type or assertion failures until wrapper return types are updated.

- [ ] **Step 3: Update thin wrappers**

Change imports and command signatures from `GreedyOptimizationResult` to `GreedyOptimizationOutcome`. Keep wrapper bodies as direct calls to `greedy_optimize_pile_choices`; do not duplicate result interpretation.

- [ ] **Step 4: Run wrapper tests and verify GREEN**

Run both commands from Step 2 and expect all tests to pass.

- [ ] **Step 5: Commit transport parity**

```powershell
git add crates/pile-plan-wasm/src/lib.rs apps/pile-plan-studio/src-tauri/src/main.rs
git commit -m "feat: expose grouped greedy outcomes"
```

### Task 4: TypeScript optimizer transport contract

**Files:**
- Create: `apps/pile-plan-studio/src/core/greedyOptimizationContract.ts`
- Create: `apps/pile-plan-studio/src/core/greedyOptimizationContract.test.ts`
- Modify: `apps/pile-plan-studio/src/core/projectTypes.ts`

**Interfaces:**
- Consumes: `LoadPointGroup[]`, maps of options/current assignments, nullable pile-head level, cost settings, and current greedy settings.
- Produces: browser and desktop request DTOs plus normalized `GreedyOptimizationOutcome` discriminated unions.

- [ ] **Step 1: Write failing request and outcome contract tests**

Assert that browser requests retain numeric `Map` keys, desktop requests contain string-keyed records, group arrays are cloned, `pile_head_level_m` remains `null`, and both completed/blocked outcomes are deeply normalized without shared mutable arrays.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --test src/core/greedyOptimizationContract.test.ts`

Expected: module-not-found or missing-export failure.

- [ ] **Step 3: Implement the focused contract**

Define:

```ts
export type GreedyOptimizationOutcome =
  | { status: "completed"; result: GreedyOptimizationResult }
  | { status: "blocked"; diagnostics: OptimizationPreparationDiagnostic[] };
```

Define the diagnostic-kind union including `invalid_group_partition`, and create `toBrowserGreedyOptimizationRequest`, `toDesktopGreedyOptimizationRequest`, and `greedyOptimizationOutcomeFromCore`. Reuse `toWasmNumberKeyedMap`, `toStringKeyedRecord`, pile-option conversion, and `loadPointGroupsFromCore`.

- [ ] **Step 4: Verify both serialization paths through the pure contract**

Exercise both request serializers with the same semantic input and assert that only the required map representation differs. Exercise `greedyOptimizationOutcomeFromCore` for both status variants. Leave `coreClient.ts` unchanged until Task 5 so this checkpoint remains type-correct and independently usable.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `node --test src/core/greedyOptimizationContract.test.ts`

Run: `npx tsc -p tsconfig.json --noEmit`

Expected: contract tests and the complete TypeScript typecheck pass.

- [ ] **Step 6: Commit the TypeScript contract**

```powershell
git add apps/pile-plan-studio/src/core/greedyOptimizationContract.ts apps/pile-plan-studio/src/core/greedyOptimizationContract.test.ts apps/pile-plan-studio/src/core/projectTypes.ts
git commit -m "feat: add grouped greedy transport contract"
```

### Task 5: Application orchestration and blocked feedback

**Files:**
- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/AppOptimization.test.ts`
- Modify: `apps/pile-plan-studio/src/core/coreClient.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/optimizationPanelModel.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/optimizationPanelModel.test.ts`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json`

**Interfaces:**
- Consumes: cached `loadPointGroups` and `GreedyOptimizationOutcome`.
- Produces: one completed atomic plan transition or a localized non-mutating blocked state.

- [ ] **Step 1: Write failing app orchestration tests**

Assert source-level and pure-model behavior for:

- passing `groups: loadPointGroups.groups` and nullable `pileHeadLevelM`;
- not calling `applyOptimizationResult` for a blocked outcome;
- disabling optimization while groups are pending, failed, or absent for a non-empty project;
- preserving state and setting `optimizationError` on blocked results;
- rejecting results after active-plan, assignment, or analysis-request changes.

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run: `node --test src/AppOptimization.test.ts src/components/domain/optimizationPanelModel.test.ts`

Expected: assertions fail until grouped orchestration and blocked outcome handling exist.

- [ ] **Step 3: Add localized diagnostic formatting**

Add a pure helper that maps the first structured diagnostic to a localized message and appends the number of additional diagnostics when present. Keep the complete diagnostic array at the contract boundary for future UI; this phase stores only the formatted message in existing `optimizationError` state.

Add Dutch and English strings for invalid group partition, missing analysis/head/cost, locked conflicts/unavailability/utilization, no eligible configuration, and an additional-diagnostic count.

- [ ] **Step 4: Route `greedyOptimizeCore` through the contract**

Extend its input with `groups`, change `pileHeadLevelM` to `number | null`, build requests with the Task 4 serializers, and return `Promise<GreedyOptimizationOutcome>`. Normalize both WASM and Tauri responses through `greedyOptimizationOutcomeFromCore`.

- [ ] **Step 5: Update the optimizer handler**

Capture active plan ID, current assignment-map identity, analysis request, and the ready group list before starting. Pass groups and the nullable head level. Branch on outcome status:

```ts
if (outcome.status === "blocked") {
  // clear running, set localized error, mutate no plan content
  return;
}
const applied = applyOptimizationResult({ previousChoices, result: outcome.result });
```

Retain the existing single commit for completed runs and refuse stale completed or blocked outcomes.

- [ ] **Step 6: Update disabled-state behavior**

Disable the existing optimizer action while grouping is pending, contains an error, or has no groups for a non-empty project. Do not add a control, dialog, marker, or legend change.

- [ ] **Step 7: Run focused tests and typecheck and verify GREEN**

Run: `node --test src/AppOptimization.test.ts src/components/domain/optimizationPanelModel.test.ts src/core/greedyOptimizationContract.test.ts`

Run: `npx tsc -p tsconfig.json --noEmit`

Expected: all pass without weakening stale-result guards.

- [ ] **Step 8: Commit application integration**

```powershell
git add apps/pile-plan-studio/src/App.tsx apps/pile-plan-studio/src/AppOptimization.test.ts apps/pile-plan-studio/src/core/coreClient.ts apps/pile-plan-studio/src/components/domain/optimizationPanelModel.ts apps/pile-plan-studio/src/components/domain/optimizationPanelModel.test.ts apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json
git commit -m "feat: optimize load point groups atomically"
```

### Task 6: Generated WASM, full verification, and live acceptance

**Files:**
- Regenerate: `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/*`
- Modify only if required by generated API: generated package declarations and checked-in binary.

**Interfaces:**
- Consumes: verified Rust and TypeScript contracts.
- Produces: checked-in browser artifact matching the source and a fully verified feature branch.

- [ ] **Step 1: Rebuild the WASM package**

Run from `apps/pile-plan-studio`:

```powershell
npm run build:wasm
```

Expected: generated JS, declarations, and `.wasm` reflect the new request/outcome without hand editing generated files.

- [ ] **Step 2: Run complete automated verification**

Run:

```powershell
cargo test --workspace --no-fail-fast
cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml --no-fail-fast
npm test
npx tsc -p tsconfig.json --noEmit
npm run build
git diff --check
```

Expected: every command exits zero.

- [ ] **Step 3: Commit generated artifacts**

```powershell
git add apps/pile-plan-studio/src/core/wasm/pile-plan-wasm
git commit -m "build: refresh grouped optimizer WASM"
```

- [ ] **Step 4: Run the live sample-project acceptance check**

Start the existing development viewer on port 4303. Optimize a target containing one member of an automatic two-member group and then a six-member group. Verify complete unlocked-group assignment, unchanged locked members, one undo action, deterministic rerun, and no changes to legend behavior.

- [ ] **Step 5: Review final branch state and push**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -8
git push -u origin feature/0.3.0-greedy-optimization-units
```

Expected: clean branch, all implementation checkpoints present, and remote tracking configured.
