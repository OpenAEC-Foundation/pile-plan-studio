# Greedy optimization over optimization units

**Status:** Proposed for review

**Target:** Pile Plan Studio 0.3.0

**Branch:** `feature/0.3.0-greedy-optimization-units`

**Related issues:** #21, #28, and #30

## Purpose

Connect the existing greedy optimizer to the solver-independent
`OptimizationUnit` model. This makes project-wide `LoadPointGroup` equality
constraints effective during optimization without coupling group construction
or option aggregation to the future spatial optimizer from #21.

The change preserves the current greedy objective and UI controls. It replaces
the greedy optimizer's duplicate per-load-point eligibility, utilization, and
cost logic with the already implemented Rust preparation step.

## Scope

This slice includes:

- expanding an optimization target to complete `LoadPointGroup`s in Rust;
- preparing the selected groups as `OptimizationUnit`s;
- running the current greedy heuristic over unit options and total unit costs;
- preserving locked configurations as hard constraints;
- expanding a selected unit option back to load-point assignments;
- returning preparation failures as structured blocking outcomes;
- passing the cached group partition through the TypeScript core boundary;
- equivalent WASM and Tauri behavior;
- deterministic Rust, contract, frontend-integration, and regression tests.

This slice excludes:

- any spatial-coherence objective or Gabriel-graph use in optimization;
- a replacement solver, ILP model, or Pareto search for #21;
- changes to the optimization panel controls;
- changes to legend ownership or behavior from #24;
- persisted grouping settings, manual groups, or group visualization;
- the remaining project-format migration from metre-valued tip-level fields;
- performance work beyond avoiding unnecessary duplicate preparation.

## Chosen architecture

The public optimizer operation remains one Rust-owned transaction:

```text
frontend request
    -> select and expand target groups
    -> prepare_optimization_units
    -> stop on preparation diagnostics
    -> greedy unit solver
    -> expand unit choices to load-point results
    -> tagged completed or blocked outcome
```

The frontend does not call preparation and solving as two separate asynchronous
operations. A single Rust operation prevents stale prepared units, duplicated
domain decisions in TypeScript, and browser/desktop drift.

Internally, preparation and solving remain separate pure functions. The future
#21 optimizer can reuse `prepare_optimization_units` without depending on the
greedy heuristic.

## Input contract

`GreedyOptimizationInput` gains the complete, currently derived group
partition:

```rust
pub struct GreedyOptimizationInput {
    pub groups: Vec<LoadPointGroup>,
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub target_load_point_ids: Vec<u32>,
    pub locked_load_point_ids: Vec<u32>,
    pub current_assignments: HashMap<u32, PileConfigurationKey>,
    pub limit_scope: OptimizationLimitScope,
    pub pile_head_level_m: Option<f64>,
    pub cost_settings: PileCostSettings,
    pub settings: GreedyOptimizationSettings,
}
```

The existing `GreedyOptimizationSettings` remains compatible with project
schema 3 in this slice. Rust converts its metre-valued enabled tip levels once
to canonical integer millimetres when it constructs
`OptimizationCandidateSettings`. This does not extend the temporary legacy
boundary elsewhere and does not perform a project-format migration while #24
is in progress.

The frontend passes the groups already produced and cached by
`useLoadPointGroups`. It must not rederive, expand, or reinterpret groups.

## Target and group semantics

The requested target remains load-point based in the UI. Rust normalizes the
target IDs and selects every group containing at least one target ID. Every
member of each selected group then belongs to the effective optimization
target.

Consequences:

- selecting one unlocked group member optimizes the complete group;
- selecting a locked member may optimize its unlocked group members around the
  locked configuration;
- the `all` scope includes every non-empty derived group;
- groups that do not intersect the requested target are not prepared and
  cannot block a selected-scope run;
- whole-plan baseline calculations exclude every member of an expanded target
  group, avoiding double counting;
- response assignments and unassigned outcomes use the expanded target, so the
  active pile plan cannot retain different configurations inside one optimized
  group.

The application starts optimization only when the cached partition is ready,
has no derivation error, and covers a non-empty project. Rust defensively
rejects a malformed partition when a requested target is absent or a load point
occurs in more than one selected group. This is a structured blocking domain
failure, not a panic or a partial optimization.

## Preparation

The outer optimizer adapter constructs `PrepareOptimizationUnitsInput` for the
selected groups and calls `prepare_optimization_units` exactly once.

Existing preparation rules remain authoritative:

- a configuration must be present and technically valid for every member;
- selected-CPT capacity data must be complete for every member;
- normal candidates must respect enabled size, enabled tip, and maximum
  utilization settings;
- unit cost is the sum of the member costs and must be known;
- maximum utilization and governing facts are aggregated across the group;
- agreeing locked members force their complete configuration;
- conflicting, unassigned, unavailable, or technically invalid locked
  configurations are blocking diagnostics;
- an unlocked member receiving a forced configuration must respect the
  optimization utilization limit;
- locked members themselves may remain above that optimization limit.

If preparation returns any diagnostic, the greedy solver does not run and the
operation returns no assignments.

## Greedy unit solver

The solver consumes only:

- prepared `OptimizationUnit`s;
- the current global size, tip-level, and configuration limits;
- baseline configurations required by the selected limit scope.

It does not inspect raw `PileConfigurationOption`s, recalculate costs, apply
enabled filters, or reason about CPT validity.

### Candidate set

The candidate set is the deterministic union of canonical configurations in
all unit options. Configurations are ordered by ascending pile size and then by
descending tip level, matching the existing deterministic tie-break.

Forced configurations are included before the iterative search. They cover
their forced units and remain selected regardless of enabled filters. A forced
configuration is never replaced by the greedy solver.

### Score

For a set of selected configurations, each unit chooses its cheapest matching
unit option. The score remains lexicographic:

1. number of uncovered load points;
2. total cost of covered units.

An uncovered multi-member unit contributes its number of members, not one. This
preserves the existing priority of covering as many load points as possible.
Unknown-cost scoring is removed from the solver because missing relevant cost
is already a blocking preparation diagnostic.

Total cost sums each chosen `OptimizationUnitOption.total_cost` once. Equal
scores use the existing canonical configuration ordering, giving reproducible
results independent of map or group input order.

### Iteration

Starting from the forced configurations, evaluate every not-yet-selected
candidate that is available to at least one unit and is allowed by the global
limits. Add the candidate with the best resulting score. Continue while the
score strictly improves and another configuration can be added.

This is the current greedy strategy expressed over units; it is not presented
as a global optimum and does not add spatial coherence.

## Limits and fixed configurations

For `target` limit scope, counts include configurations selected or forced in
the expanded target. For `whole-plan` scope, they additionally include current
assignments outside the expanded target.

Locks and out-of-target assignments are immutable for this run. They therefore
form a fixed baseline even when that baseline already exceeds a newly lowered
user limit. The solver follows this rule:

- it may reuse a configuration already present in the fixed baseline;
- it may add a configuration only when doing so does not increase an
  already-exceeded size, tip, or configuration count and does not create a new
  limit violation;
- it never drops or changes fixed assignments to make a limit achievable;
- units left uncovered by the available configuration budget receive the
  existing `configuration_limits` unassigned reason.

This keeps locks harder than optimizer limits while ensuring the optimizer does
not worsen an existing limit violation.

## Result expansion

After selecting configurations, each covered unit chooses its cheapest matching
option. The chosen canonical configuration is expanded to every unlocked member
of the effective target group.

Locked members are omitted from assignment patches and keep their current
assignment. Their forced configuration still determines the option assigned to
the unlocked members and counts toward solver limits.

If an unforced unit cannot be covered within the global limits, every member of
that unit receives the same unassigned outcome. The frontend applies completed
results through the existing atomic pile-plan transition and creates at most
one undo/redo action.

Selected-configuration and limit-count summaries are derived from canonical
configuration keys. Result ordering is deterministic by load-point ID and then
configuration ordering where applicable.

## Outcome and error handling

Expected domain failures use a tagged result rather than thrown strings:

```rust
#[serde(tag = "status", rename_all = "snake_case")]
pub enum GreedyOptimizationOutcome {
    Completed {
        result: GreedyOptimizationResult,
    },
    Blocked {
        diagnostics: Vec<OptimizationPreparationDiagnostic>,
    },
}
```

The malformed-partition diagnostic is added to the shared structured
diagnostic vocabulary. All diagnostics remain available to future richer UI.

For this slice, TypeScript converts a blocked outcome to a concise localized
message in the existing optimization panel. It applies no project mutation,
creates no pile plan, and clears the running state. Unexpected transport or
runtime failures continue through the existing exception path.

Completed outcomes follow the existing result application path. A stale result
still cannot apply after replacement of analysis input, project, or active pile
plan.

## Rust and TypeScript responsibilities

Rust owns:

- target-group selection and expansion;
- group-partition validation for the optimizer request;
- metre-to-canonical-millimetre adaptation at the legacy settings boundary;
- optimization-unit preparation and all technical diagnostics;
- greedy configuration selection over units;
- lock, global-limit, scoring, tie-break, and result-expansion semantics.

TypeScript owns:

- waiting until the cached group partition is ready;
- passing groups through browser and desktop request serializers;
- asynchronous request lifecycle and stale-result protection;
- localized presentation of blocked outcomes;
- applying a completed result to the active pile plan and history.

No React component needs a new control or layout. The existing optimizer button
is disabled while grouping is pending or failed, analogously to grouped manual
assignment controls.

## Relationship with #24

This branch does not alter legend storage, encoding modes, palette assignment,
or project-versus-plan legend scope. It continues to consume the existing
`activePileSizes` and `activePileTipLevels` values as optimizer candidate
filters.

Likely shared edits are limited to the optimizer handler in `App.tsx` and core
request types. After this branch is completed, it can be brought back to
`feature/0.3.0-spatial-planning`. The #24 branch should be rebased only after
its active work has stopped.

## Expected implementation locations

Rust core:

- `crates/pile-plan-core/src/analysis.rs`
- `crates/pile-plan-core/src/optimization_units.rs`
- `crates/pile-plan-core/src/lib.rs`

Transport:

- `crates/pile-plan-wasm/src/lib.rs`
- `apps/pile-plan-studio/src-tauri/src/main.rs`
- generated WASM package files after Rust verification

TypeScript:

- a focused greedy optimizer contract module under
  `apps/pile-plan-studio/src/core/`;
- `apps/pile-plan-studio/src/core/coreClient.ts`;
- the existing optimizer handler and disabled-state expression in
  `apps/pile-plan-studio/src/App.tsx`;
- translations and focused integration tests.

The exact extraction of existing greedy helpers from `analysis.rs` is an
implementation detail. Unit-specific solver helpers should live with the
optimizer rather than enlarging `optimization_units.rs`, whose responsibility
remains solver-independent preparation.

## Verification

### Rust preparation and target tests

- one selected member expands to its complete group;
- multiple selected members in one group produce one unit;
- selected members in multiple groups produce their group union;
- non-target groups cannot cause selected-scope diagnostics;
- expanded group members are excluded from whole-plan baseline counting;
- duplicate or missing target membership blocks the operation;
- missing analysis, cost, or pile-head level blocks before solving;
- forced and conflicting locked configurations retain existing preparation
  behavior.

### Rust greedy regression tests

- singleton groups reproduce the current deterministic assignments, counts,
  and configuration-limit outcomes;
- one common group configuration assigns every unlocked member;
- a cheaper configuration valid for only part of a group is never selected for
  that group;
- a six-member uncovered unit contributes six to coverage scoring;
- total group cost, rather than one member's cost, determines equal-coverage
  choices;
- forced configurations seed the solution and propagate to unlocked members;
- locked members are never returned as changed or unassigned;
- whole-plan baseline and target-only limits remain distinct;
- reuse of an existing fixed configuration is allowed when fixed counts already
  exceed a lowered limit;
- adding configurations cannot worsen an existing fixed limit violation;
- shuffled units and options return byte-for-byte equivalent ordered results;
- 20,000 singleton units do not overflow coverage counts.

### Contract and integration tests

- browser maps and desktop records serialize the same groups and assignments;
- WASM and Tauri expose the tagged outcome;
- optimization cannot start while groups are pending or failed;
- a completed grouped run changes all unlocked group members in one history
  action;
- a blocked run changes no project or pile-plan state;
- stale completed and blocked outcomes are ignored;
- existing summary and unassigned markers operate on expanded member results;
- no legend-editor ownership or persistence behavior changes.

### Final verification

- `cargo test --workspace`;
- rebuild the checked-in WASM package;
- frontend unit test suite;
- TypeScript typecheck;
- production frontend build;
- browser and desktop contract parity checks;
- live sample-project check using a two-member and six-member automatic group.

## Alternatives considered

### Prepare units in TypeScript, then call the solver

Rejected because it makes TypeScript responsible for domain sequencing, adds a
second asynchronous result that can become stale, and makes browser/desktop
parity harder to guarantee.

### Send prepared units over a new public solver API

This clean API may be useful for benchmarking multiple solvers later, but it
would expose transient preparation data before a second solver exists. Keeping
the separation internal avoids unnecessary public surface while preserving the
same Rust function boundary for #21.

### Keep the current per-load-point greedy implementation and post-process groups

Rejected because selecting members independently can produce a configuration
that is invalid for another member. Repairing assignments afterward would make
validity, limits, cost, and reproducibility dependent on repair order.

## Acceptance criteria

The slice is complete when:

1. automatic `LoadPointGroup`s are the atomic units of a greedy run;
2. every applied grouped configuration is technically valid for all members;
3. locks remain unchanged and force compatible unlocked members;
4. preparation failures block the complete run without project mutation;
5. existing greedy behavior is preserved for singleton groups except where the
   approved blocking preparation rules deliberately strengthen it;
6. no #24 legend behavior is changed;
7. browser and desktop results are equivalent and deterministic;
8. all verification commands and the live grouped-run check pass.
