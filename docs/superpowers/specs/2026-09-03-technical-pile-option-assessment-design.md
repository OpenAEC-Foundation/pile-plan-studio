# Technical pile-option assessment and missing-capacity presentation

**Status:** Approved

**Created:** 2026-09-03

**Target:** Pile Plan Studio 0.3.0

**Branch:** `feature/0.3.0-greedy-optimization-units`

**Related issues:** #21, #24, #28, and #30

## Purpose

Give initial pile assignment, grouped greedy optimization, the viewer, and the
pile-option table one shared interpretation of whether a load-point group can
receive a valid common pile configuration.

The current implementation mixes permanent engineering conditions with
optimizer outcomes. A technically unresolvable group can consequently appear
as an unresolved optimizer group and its otherwise valid members can receive a
question mark. Initial assignment independently evaluates the same situation,
which can produce different red and yellow crosses inside one group.

This change separates those concerns:

- Rust derives current technical assignment issues from the current analysis
  and `LoadPointGroup` partition;
- initial assignment and every optimizer reuse that same classification;
- technical issues are shown permanently and are never persisted as optimizer
  outcomes;
- question marks are reserved for technically assignable locations that could
  not be assigned within optimizer settings;
- missing-capacity rows explain which CPTs lack data instead of showing
  partially calculated utilization facts as if they were conclusive.

## Scope

This slice includes:

- explicit pile-option invalid reasons `missing_capacity_data` and
  `insufficient_capacity`;
- one Rust-owned group assessment shared by default assignment, greedy
  optimization, and frontend presentation;
- deterministic group-level yellow/red classification;
- permanent technical notices above the pile-option table;
- clickable load-point IDs in group notices;
- corrected optimizer outcomes, markers, and summary counts;
- corrected single- and multi-selection Missing rows;
- an anchored popover with clickable missing-CPT identifiers;
- a separate project-level `analysis_unavailable` condition for an analysis
  with no pile configurations;
- equivalent WASM and Tauri contracts and regression coverage.

## Non-goals

This slice does not:

- design a general group-management interface or group visualization;
- choose final user-facing terminology for a future groups feature;
- change the automatic 1,200 mm grouping rule;
- prevalidate or change the existing manual group-assignment behavior;
- alter optimizer candidate controls or their persistence;
- implement legend issue #24;
- implement the spatial or ILP optimizer from issue #21;
- change the IFCPP schema version solely for derived technical issues;
- make CPT availability depend on a load point when the underlying capacity
  data is configuration-by-CPT data.

## Terminology

A pile configuration is valid for one load point only when selected-CPT
capacity data is complete and the calculated utilization does not exceed the
engineering limit of 100 percent.

An invalid configuration has one of two technical reasons:

- `missing_capacity_data`: capacity data is missing for at least one selected
  CPT, so the configuration cannot be assessed conclusively;
- `insufficient_capacity`: all required capacity data is present, but the
  calculated utilization exceeds 100 percent.

`not_allowed` is not used. That term could be confused with a user-disabled
optimizer candidate or an optimizer-specific utilization threshold. Technical
assessment always uses the full analyzed configuration set and the engineering
100-percent boundary. Enabled sizes, enabled tip levels, optimizer utilization
limits, and global configuration limits belong only to optimization.

Internal cause names may use `group_member`, but user-facing copy uses
"location", "linked locations", or concrete location IDs. A future groups UI
may rephrase this as, for example, "the group of locations 12 and 14" without
changing the domain model.

## Option status

Each analyzed option has one effective status:

1. `valid` when data is complete and utilization is at most 100 percent;
2. `missing_capacity_data` when at least one selected CPT lacks capacity data;
3. `insufficient_capacity` when data is complete and utilization exceeds 100
   percent.

Missing data has precedence within one option. A utilization calculated from
only the available CPTs is not a conclusive engineering result and must not
turn an incomplete option into `insufficient_capacity`.

The existing `is_option`, `missing_cpt_ids`, and utilization facts may remain
the low-level analysis representation if that avoids an unnecessary wire
migration. All consumers must nevertheless obtain the effective status from
one Rust rule rather than reconstructing it independently.

## Group assessment

Rust adds one pure, solver-independent assessment over the current complete
`LoadPointGroup` partition and `options_by_load_point`. The implementation may
reuse and extend the existing pile-option aggregation primitive, but it exposes
one authoritative result to consumers.

For every non-empty group, configurations are compared by canonical
`PileConfigurationKey`. A group configuration is:

- `valid` when it exists and is valid for every location in the group;
- `missing_capacity_data` when it is absent at a location or has missing
  selected-CPT capacity data at any location;
- `insufficient_capacity` when it is present with complete data everywhere and
  has insufficient capacity at one or more locations.

The overall group classification is:

1. valid if at least one group configuration is valid;
2. missing/yellow if none is valid and every group configuration is
   `missing_capacity_data`;
3. insufficient/red if none is valid and at least one group configuration is
   completely assessable but has insufficient capacity.

This rule deliberately makes all unassigned members of one unresolvable group
use the same cross color. A valid individual location therefore becomes yellow
when its group can only fail because another location lacks data. It becomes
red when at least one common configuration is completely assessable but has
insufficient capacity somewhere in the group.

### Technical issue causes

An invalid group assessment produces location-addressable technical issues
using these causes:

- `no_valid_option`: the location itself has no individually valid option;
- `group_member_without_valid_option`: the location has an individually valid
  option, but at least one linked location has none;
- `no_common_valid_group_configuration`: every location has at least one
  individually valid option, but there is no configuration that is valid for
  all of them.

Each issue also contains:

- the effective status `missing_capacity_data` or `insufficient_capacity`;
- all sorted location IDs in the group;
- sorted blocking location IDs where applicable;
- sorted, deduplicated missing CPT IDs;
- whether missing-capacity configurations also occur in an effectively red
  mixed case.

The cause supplies the first sentence of a notice. The status and supporting
facts supply a coherent second sentence. This avoids a growing flat enum such
as separate missing and insufficient variants for every cause.

## No available pile configurations

An options map with no configuration rows anywhere is not a red or yellow
technical assignment issue. In normal project analysis this occurs when the
foundation advice contains no usable bearing-capacity row, for example because
none was imported or every FRd cell was empty and therefore skipped.

Because the set of configurations is derived project-wide, normal analysis
produces either configuration rows for every load point or no rows for any load
point. A missing options entry for only one expected load point remains a
defensive analysis-contract error rather than an engineering classification.

The frontend represents the project-wide condition as
`analysis_unavailable`, distinct from:

- `pending`, while current analysis/default assignment has not completed;
- `analysis_error`, when a request or runtime unexpectedly fails;
- technical `missing_capacity_data` and `insufficient_capacity` results.

Unassigned load points use a neutral grey dot for `analysis_unavailable`. The
visual may match the existing neutral pending dot because neither state
expresses an engineering verdict, while state, accessible text, and the right
panel remain distinct. Red and yellow crosses are shown only after at least one
configuration has actually been assessed.

The pile-option table is empty and displays:

> **Pile options cannot be determined.**
> The foundation advice contains no usable bearing-capacity configurations.

The optimizer is disabled with the same reason. Unexpected analysis failures
continue through the explicit error path and are not reported as missing or
insufficient capacity.

## Shared data flow

The pure Rust group assessor is reused in three paths:

1. project analysis plus the current cached group partition are assessed for
   viewer and right-panel presentation;
2. `choose_default_pile_options` uses the same assessment before selecting the
   cheapest common valid configuration;
3. greedy optimization uses the same assessment before preparing eligible
   `OptimizationUnit`s.

The browser and desktop expose a thin batch assessment contract accepting the
groups and current analyzed options. TypeScript owns request orchestration,
caching, stale-response rejection, localization, and interaction, but does not
derive technical causes or group colors.

The frontend assessment cache is invalidated whenever analyzed options or the
group partition changes. Technical issues are current derived state and are
not written to IFCPP, undo history, or recovery storage.

## Initial assignment behavior

For a technically valid group, initial assignment keeps the existing behavior
of selecting its cheapest common valid configuration.

For an invalid group:

- no member receives an initial assignment;
- every member receives the shared group yellow/red visual classification;
- each selected location can show its precise permanent technical notice;
- the condition is not labeled as an optimizer outcome.

This removes the current red/yellow mismatch inside groups without introducing
a second default-assignment-specific rule.

## Optimizer outcome boundary

Only technically valid groups enter normal greedy candidate selection. An
unlocked technically invalid group is omitted from the solver and returned as
current technical assessment information; it does not block progress for
other groups.

Persisted optimizer unassigned reasons are limited to:

- `optimization_constraints`: the group is technically assignable, but no
  eligible option remains after optimizer candidate filters or its utilization
  setting;
- `configuration_limits`: eligible options exist, but the configured global
  size, tip-level, or complete-configuration limits prevent assignment.

These are the only reasons that produce question marks. Technical causes such
as `no_valid_option`, `group_member_without_valid_option`, and
`no_common_valid_group_configuration` move out of the optimizer-reason model.
If an in-development project contains those legacy persisted values, they are
discarded on load and replaced by current derived technical assessments.

Locked-group conflicts, malformed group partitions, missing pile-head level,
missing required cost data, and unexpected runtime failures retain their
structured blocking behavior. This design changes the handling of ordinary
unlocked groups with no valid common technical configuration, not invariant or
transaction-safety failures.

### Optimizer summary

The result panel combines current technical assessment for the expanded target
with the optimizer result. Its concepts remain separate, for example:

```text
303 assigned.
123 changed.
25 without a valid pile option.
2 not assigned within the optimization settings.
```

All members of a technically invalid target group count in the technical line.
They do not count as unresolved optimizer locations or unresolved optimizer
groups. The last line counts only `optimization_constraints` and
`configuration_limits` outcomes.

The compact summary reports load-point counts only. It does not append a group
count to either the technical line or the optimizer line. Internally every
singleton is also a `LoadPointGroup`, so a result containing one linked group
of three locations and two separate locations would technically contain three
groups; presenting that as "5 locations (3 groups)" would be ambiguous before
a groups UI exists. Structured group or optimization-unit counts remain
available for diagnostics and tests, and a future detailed view may spell out
"1 linked group of 3 locations and 2 separate locations" explicitly.

## Permanent technical notices

When one selected location has a technical issue, a permanent notice appears
above the pile-option table. It is independent of whether optimization has
ever run.

The notice is composed rather than exposed only through a tooltip:

- the cause determines the lead sentence;
- the status determines the engineering explanation;
- a mixed red case also mentions that other configurations have missing data;
- relevant location IDs are inline interactive links.

Examples:

> **No valid common pile configuration for locations 12 and 14.**
> These locations must receive the same pile configuration. For every
> configuration, capacity data is missing at least one of these locations.

> **No valid common pile configuration for locations 12 and 14.**
> The configurations with complete data have insufficient capacity at least
> one location. Capacity data is missing for other configurations.

> **Location 14 has no valid pile option.**
> Locations 12 and 14 must receive the same pile configuration, so neither can
> be assigned automatically.

Clicking a location ID selects or opens that load point through the existing
right-panel navigation. IDs are sorted and all are shown; they may wrap across
lines for a larger group. User-facing copy does not use the word "group
member". The exact future phrase "group of locations ..." is a presentation
change over the same structured issue.

The optimization panel may summarize the same issues, but it does not own or
persist their wording or state.

## Pile-option table behavior

### Single selection

For a `missing_capacity_data` row:

- cost remains available when it can be calculated from the configuration;
- utilization, governing CPT, and FRd display `-`;
- the Missing status provides access to the missing CPT identifiers.

For `valid` and `insufficient_capacity` rows, the existing utilization,
governing CPT, and FRd values remain relevant and visible.

### Multiple selection

The aggregate DTO adds a sorted, deduplicated `missing_cpt_ids` union for each
configuration. It does not split this list by load point because capacity
availability is a property of configuration by CPT; repeating selected load
points would make the explanation longer without adding engineering meaning.

For an aggregate `missing_capacity_data` row:

- total cost remains available when calculable;
- maximum utilization and critical load point display `-`;
- critical governing CPT and FRd are not presented as conclusive facts;
- the Missing status uses the one union of missing CPT IDs.

The existing aggregation precedence remains: when a configuration lacks data
at any selected location, that row is Missing even if another selected
location has insufficient capacity. This row-level rule is distinct from the
overall group rule, which becomes red only when at least one different common
configuration is completely assessable and insufficient.

### Missing-CPT popover

The Missing status is a button-like control. Clicking it opens a compact
popover anchored to the status cell. The popover:

- identifies that bearing-capacity data is missing;
- lists only the sorted CPT identifiers, without repeating "CPT" or
  "Sondering" before every number;
- makes every identifier an interactive link that opens the existing CPT
  detail view;
- does not trigger row assignment when opened or when a CPT is selected;
- closes on outside click, Escape, selection of a CPT, or loss of its row;
- remains keyboard accessible and returns focus to the trigger when
  appropriate.

A short non-interactive hover title may summarize the identifiers. Essential
information and navigation do not depend on hover.

## State and persistence

Technical assessment is derived from project inputs, CPT-selection settings,
current analyzed options, and the current group partition. It is never stored
inside a pile plan.

Optimizer outcomes remain plan-specific because they describe the most recent
optimization applied to that plan. They are cleared or refreshed through the
existing invalidation rules when assignments or analysis inputs make them
stale.

This separation ensures that changing capacity data, CPT selection, or group
membership immediately changes permanent engineering feedback without leaving
stale technical reasons in saved plans.

## Error handling

- No project-wide configuration rows produce `analysis_unavailable`, a
  neutral map, an empty-state explanation, and a disabled optimizer.
- An expected invalid group produces derived technical issues and does not
  prevent other unlocked groups from being optimized.
- A failed frontend group-assessment request leaves project and plan state
  unchanged, shows an explicit analysis error, and never falls back to a red or
  yellow guess in TypeScript.
- A malformed assessment request, such as a missing expected load-point entry,
  is a structured contract error.
- Existing blocking lock and transaction-safety diagnostics remain atomic.
- A stale assessment, aggregation, or optimization response is ignored.

## Rust and TypeScript responsibilities

Rust owns:

- effective per-option technical status;
- canonical configuration matching;
- group configuration aggregation;
- group validity, yellow/red classification, causes, and supporting IDs;
- reuse of the classification in default assignment and optimizer preparation;
- missing-CPT union, sorting, and deduplication;
- technical-versus-optimizer outcome separation.

TypeScript owns:

- asynchronous request lifecycle and stale-result protection;
- transient cache storage for current assessments;
- localized coherent notice composition from structured results;
- marker and table presentation;
- popover focus, dismissal, and navigation interactions;
- applying and persisting only genuine optimizer outcomes.

TypeScript must not infer a group issue by scanning `isOption`, utilization, or
missing-CPT arrays.

## Verification

### Rust core

- individual option status covers valid, missing data, and insufficient
  capacity;
- missing data takes precedence within an incomplete option;
- a group with a common valid configuration is valid;
- a group for which every common configuration is missing is yellow;
- a group with no valid configuration and at least one completely assessable
  insufficient configuration is red;
- one location without any valid option produces `no_valid_option` for that
  location and `group_member_without_valid_option` for otherwise valid linked
  locations;
- individually valid locations without overlap produce
  `no_common_valid_group_configuration`;
- cause, status, group IDs, blocking IDs, and missing CPT IDs are deterministic;
- a lack of global configuration rows returns `analysis_unavailable` rather than a
  technical issue;
- default assignment and greedy preparation agree with the standalone group
  assessment for the same fixtures;
- unlocked invalid groups do not block optimization of valid groups;
- only true optimizer settings produce optimizer-unassigned reasons and group
  counts.

### WASM and Tauri

- both adapters expose equivalent batch-assessment DTOs;
- no-configuration, yellow, red, mixed, and valid fixtures serialize equally;
- missing CPT IDs are sorted and deduplicated in both runtimes;
- removed legacy technical optimizer reasons do not reappear through either
  adapter.

### TypeScript and UI

- pending analysis still renders the existing neutral dot;
- `analysis_unavailable` renders a neutral dot and never a cross;
- an empty configuration array no longer falls through to a red cross;
- all members of one invalid group render the same yellow or red cross;
- technically invalid groups never render optimizer question marks;
- question marks remain for optimizer constraints and configuration limits;
- permanent notices appear before optimization and include navigable location
  IDs;
- technical and optimizer counts remain separate for whole-plan and selected
  target runs;
- compact summary lines report locations only and do not show an ambiguous
  count that includes singleton groups;
- single Missing rows replace utilization, governing CPT, and FRd with `-`;
- multi Missing rows replace maximum utilization and critical location with
  `-`;
- the popover shows one deduplicated identifier list and opens the selected CPT;
- popover interaction never assigns a pile option;
- keyboard focus and dismissal behavior are covered;
- switching project, plan, analysis revision, group partition, or selection
  cannot publish stale results;
- legacy persisted technical optimizer values are ignored safely.

### Full gates

- `cargo test --workspace`;
- rebuild the checked-in WASM package;
- frontend unit tests;
- TypeScript production build;
- browser and desktop contract-parity tests;
- live viewer checks for initial assignment, one missing-member group, a group
  without common overlap, a mixed missing/insufficient group, optimizer-only
  question marks, clickable location IDs, and the Missing-CPT popover.

## Relationship to adjacent work

This specification amends the technical-diagnostic and outcome portions of
`2026-09-02-greedy-optimization-units-design.md`. The optimizer remains greedy
and unit-based; only ownership and presentation of technical unassignability
change.

Issue #24 follows after this branch is completed. Its multi-plan legend work
may consume the corrected marker states but does not own technical assessment.
Issue #21 can reuse the same Rust group assessment and `OptimizationUnit`
preparation so an ILP formulation receives the same feasible configurations
and produces the same technical-versus-solver distinction.

## Alternatives considered

### Keep every failure as an optimizer reason

Rejected because missing capacity and insufficient engineering capacity exist
before and after optimization. Persisting them on a pile plan makes the result
stale when analysis inputs change and incorrectly presents them as solver
failures.

### Reclassify group failures in TypeScript

Rejected because initial assignment and optimization already depend on Rust
domain rules. Repeating configuration intersection, missing-data precedence,
and utilization classification in presentation code would allow the viewer to
disagree with the operations it explains.

### Flatten cause and status into many issue variants

Rejected because every new cause would need separate missing, insufficient,
and mixed variants. An orthogonal cause plus status and supporting facts keeps
the model small while still producing precise coherent messages.

## Acceptance criteria

The slice is complete when:

1. one Rust assessment classifies individual and grouped technical validity;
2. initial assignment, greedy optimization, viewer markers, and notices agree;
3. technical issues are current derived state and never optimizer question
   marks or persisted optimizer reasons;
4. optimizer summaries count technical issues separately from locations not
   assigned within optimizer settings and show no group count;
5. red and yellow group colors follow the approved common-configuration rule;
6. no global configuration data produces neutral dots and disables
   optimization;
7. Missing rows suppress inconclusive engineering metrics and expose clickable
   missing-CPT identifiers;
8. relevant location IDs in permanent notices are clickable;
9. browser and desktop behavior remain equivalent;
10. all automated and live verification gates pass.
