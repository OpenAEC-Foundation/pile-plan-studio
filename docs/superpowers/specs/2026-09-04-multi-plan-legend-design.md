# Multi-plan legend activation and optimizer candidate sources

**Status:** Written review

**Created:** 2026-09-04

**Target:** Pile Plan Studio 0.3.1-alpha

**Branch:** `codex/0.3.1-multi-plan-legends`

**Related issues:** #24; #32 is an explicit non-goal

## Purpose

Make legend activation belong to an individual pile plan while keeping visual
appearance consistent across the project. Each pile plan can then show the
sizes and pile-tip levels relevant to that alternative without silently
changing other plans. At the same time, the optimizer gets an explicit choice
between all available configurations and the current plan's active legend
values.

The design preserves one project-wide visual language: a given pile size or
pile-tip level keeps the same color and symbol when the user switches plans.
Only whether that value is active changes per plan.

## Goals

- Store active pile sizes and active pile-tip levels per pile plan.
- Keep legend colors, symbols, encoding mode, palette, and assignment metadata
  project-wide.
- Make inactive but used values visible through calm, neutral fallback
  rendering instead of hiding the load point.
- Let the legend editor work across a temporary selection of pile plans without
  turning that selection into project data.
- Warn only about duplicate appearances that are ambiguous in at least one
  actual pile plan.
- Let optimization use either all available configurations or only the values
  active in the current plan.
- Preserve predictable undo, dirty-state, import, duplication, refresh, and
  save behavior.

## Non-goals

- Issue #32's dual-color mode is not part of this change. In particular, this
  design does not add an encoding mode in which symbol fill represents pile
  size while connected-region fill represents pile-tip level.
- Connected pile-tip regions keep their existing pile-tip-level color
  behavior.
- The design does not make appearance settings plan-specific.
- The design does not add a persistent concept of a multi-plan legend scope.
- The design does not change the engineering validity rules, grouping rules,
  or greedy optimization algorithm.
- The design does not automatically activate values merely because a user
  manually assigns or imports a pile that uses them.

## Terminology

- **Available value:** a pile size or pile-tip level in the current canonical
  configuration catalog.
- **Active value:** an available value enabled in a particular pile plan's
  legend activation.
- **Used value:** a value referenced by at least one assignment in a particular
  pile plan.
- **Appearance:** the project-wide symbol, color, automatic/manual assignment
  metadata, encoding mode, and palette settings.
- **Candidate source:** the persisted optimizer policy that determines the
  domain from which concrete optimizer candidates are resolved for a run.
- **Resolved candidates:** the concrete valid configuration keys produced from
  the candidate source at the start of an optimization run.

Activation and engineering validity are independent. An inactive configuration
may still be technically valid and manually assigned. A configuration active
in the legend may still be missing capacity data or have insufficient
capacity.

## Data ownership

### Per pile plan

Every pile plan stores:

- `active_pile_sizes`;
- `active_pile_tip_levels`;
- its existing assignments, locks, name, and optimizer outcomes.

The frontend runtime follows the same ownership. Consumers obtain activation
from the active pile plan or through selectors that accept a pile-plan ID.
There is no duplicated top-level activation that can become a second source of
truth.

### Project-wide

Project settings continue to store:

- legend encoding mode;
- color scheme;
- the appearance entry for every known pile size and pile-tip level;
- symbol and color automatic/manual assignment metadata;
- viewer settings that already have project-wide scope.

Removing a pile plan never removes project-wide appearances. An appearance may
therefore become temporarily unused and become relevant again when another
plan or source refresh introduces its value.

### Optimizer settings

Project-wide greedy optimizer settings add `candidate_source` with two values:

- `all_available` (default);
- `active_legend`.

The existing persisted `enabled_pile_sizes` and
`enabled_pile_tip_levels` fields stop representing permanent user settings.
They are compatibility input for older files only. At run time the frontend
resolves the chosen source to explicit configuration keys and passes that
resolved set across the core boundary.

## IFCPP schema version 4

This change introduces IFCPP schema version 4 because activation moves from
project settings into each pile plan and optimizer candidate semantics become
explicit.

Pile Plan Studio 0.3.1-alpha:

- reads schema versions 1, 2, 3, and 4;
- writes schema version 4;
- does not modify an older file merely by opening it;
- writes the in-memory migrated representation as schema 4 when the user saves.

Older Pile Plan Studio versions are not required to read schema 4. The user has
accepted this forward-compatibility boundary.

### Migration from schemas 1-3

For every existing pile plan, copy the old project-wide
`active_pile_sizes` and `active_pile_tip_levels` into that plan. This preserves
the exact visible activation after migration, regardless of which plan was
active when the file was saved.

For optimizer settings:

- set `candidate_source` to `all_available`;
- retain all unrelated limits and cost/utilization settings;
- do not treat legacy enabled size/tip arrays as the new active-legend policy.

Project-wide appearance data migrates unchanged. The schema reader normalizes
and validates migrated activation against the canonical available values using
the same rules as schema 4 input.

### Round trip

Schema 4 writes activation only within each pile plan. A save/load round trip
must preserve different activations for different plans, the shared appearance,
the candidate-source choice, and the active pile-plan ID.

## Pile-plan lifecycle

Each creation path has an explicit activation rule:

| Operation | Activation of resulting plan |
| --- | --- |
| New manually created plan | All currently available sizes and tip levels |
| Duplicate plan | Exact copy of source-plan activation |
| Import CSV/XLSX as a new pile plan | Exact copy of the current source-plan activation |
| Optimize current plan in place | Preserve current-plan activation |
| Save optimization as a new plan | Property values present in the resolved candidate set |

For a new optimization plan, activation is based on the **resolved optimizer
candidates**, not only configurations used by the final result. If a run could
choose from three sizes and five tip levels but happens to use two of each, the
new plan activates all three sizes and all five tip levels. The user can then
use `Gebruikte activeren` to narrow the plan deliberately.

Manual assignment and pile-plan import do not silently activate newly used
values. The viewer fallback states make those assignments visible and the
legend/editor explain that their properties are inactive.

### Source refresh

Refreshing imported project sources reconciles each plan independently:

- active values that remain available stay active;
- removed values disappear from activation;
- genuinely new available values become active in every existing plan;
- existing plan-specific differences remain intact for values that existed
  before the refresh.

This extends the current refresh semantics to per-plan activation rather than
resetting all plans to a shared list.

## Legend editor

### Opening and draft ownership

The editor opens with:

- activation from the currently active pile plan;
- the project-wide appearance draft;
- a UI-only `Palenplannen in scope` selection containing only the current plan.

The scope selection is not persisted, does not enter undo history, and lasts
only while the editor remains open. If the active pile plan changes while the
editor is open, the existing safe-close behavior remains: close the editor
rather than applying a draft to a different plan.

Applying the editor writes current-plan activation and project-wide appearance
as one atomic history action. Canceling discards both drafts.

### Scope-aware commands

The scope selector affects only these bulk operations:

1. `Gebruikte activeren` replaces the current plan's activation with the union
   of sizes and tip levels actually used by the selected plans.
2. Automatic color and symbol assignment targets the union of activated values
   in the selected plans.

Manual enable/disable controls always edit only the current plan. Selecting
other plans in scope never changes those plans.

### Cross-plan activity badge

Each value can show a `+n` badge, where `n` is the number of other pile plans
in which the value is active. The current plan is excluded from the count. A
tooltip lists those other plan names in stable project order.

The badge is informational; it does not change scope or activation.

### Appearance visibility

The editor always displays the actual stored color and symbol for every
available value, even when the value is inactive in the current plan. Neutral
fallback appearances belong only to viewer, compact legend, and pile-option
presentation; they never overwrite or obscure the editor's stored appearance.

### Duplicate-appearance warnings

Duplicate colors and symbols remain allowed. A persistent warning appears only
when two or more values using the same visual channel are active together in
at least one pile plan.

The warning identifies:

- the duplicate values;
- whether the conflict is a color or symbol conflict;
- the pile plans in which the values are co-active.

A duplicate shared only by values that are never co-active produces no warning.
Conflict detection follows the current encoding mode, because only the visual
channel used for that property can create ambiguity.

## Viewer presentation

The viewer resolves activation separately for the property encoded as symbol
and the property encoded as color. The same four-state matrix applies in both
existing encoding modes:

| Symbol property | Color property | Marker presentation |
| --- | --- | --- |
| Active | Active | Normal configured symbol and configured color |
| Inactive | Active | Small filled dot in the configured active color |
| Active | Inactive | Normal configured symbol with neutral-gray fill |
| Inactive | Inactive | Small neutral-gray filled dot |

The small fallback dot is intentionally smaller than a normal circular pile
symbol so it does not look like an active circle configuration. It may visually
match the existing neutral pending/unassigned dot; accessible state and the
right panel continue to explain the underlying condition.

Fallback markers remain first-class load-point markers. They support selection,
hover, cycling among coincident points, keyboard-accessible interactions where
already available, and a clear selected halo. Status and selection overlays
remain above the base marker consistently.

The fallback matrix applies to assigned configurations. Unassigned states,
technical assessment states, and optimizer question marks retain their own
existing state logic and do not gain hover-only explanations as part of this
change.

## Compact legend

The compact legend keeps used but inactive values visible in their normal
sorted position:

- an inactive value on the color channel uses a neutral-gray swatch;
- an inactive value on the symbol channel uses the small fallback dot;
- if both properties of a used viewer assignment are inactive, its viewer
  representation is the small neutral-gray dot;
- each used inactive legend item gets a `!` indicator with an explanatory
  tooltip;
- a value that is both unused and inactive is omitted.

The existing compact `Gebruikte activeren` action affects only the current pile
plan. It does not reuse the editor's temporary multi-plan scope.

## Pile-option table

Filtering follows current-plan activation, with one exception: the currently
assigned configuration always remains visible. It stays at its normal sorted
position and keeps the current-row accent.

If one or both properties of that current configuration are inactive:

- its leading marker uses the same partial-neutral fallback matrix as the
  viewer;
- `Uit` or `Off` appears directly after every inactive property value;
- both labels appear when both properties are inactive.

Other filtered-out options remain hidden. This exception explains the current
assignment without turning the options table into a list of every inactive
configuration.

## Optimizer candidate source

The optimization panel adds a candidate-source choice before the configuration
limits:

- **Alle beschikbare configuraties** / **All available configurations**;
- **Alleen actief in legenda** / **Only active in legend**.

The choice is stored project-wide with the other greedy optimizer settings.
`all_available` is the default for new and migrated projects.

### Resolution flow

At the start of every optimization run:

1. Read the current canonical available configuration catalog.
2. If the source is `all_available`, select the complete catalog.
3. If the source is `active_legend`, select configuration keys whose size and
   tip level are both active in the current pile plan.
4. Resolve the selection to concrete canonical configuration keys.
5. Clamp maximum sizes, maximum tip levels, and maximum complete
   configurations against this resolved domain.
6. Send the explicit resolved configuration keys and the clamped limits to the
   Rust core.

Rust remains authoritative for technical option validity, grouped eligibility,
locks, utilization thresholds, configuration-limit behavior, and the greedy
selection. The frontend does not infer engineering eligibility from legend
activation.

If resolution produces no candidates, the run action is disabled and the
panel explains that the selected candidate source contains no available
configurations. No optimization request is sent and project state remains
unchanged.

The source is resolved afresh for each run. Changing plans or activation can
therefore change candidates without rewriting the stored optimizer policy.

### Result-plan activation

For in-place optimization, retain the current plan's activation unchanged.

For `optimalisatie als nieuw palenplan opslaan`, derive the new plan's active
sizes and tip levels from the resolved candidate keys used as input to that
run. Do not derive activation from only the solver's selected or assigned
result. The resolved set is captured with the run request so that a later UI
change or stale response cannot produce mismatched activation.

## State, history, and concurrency

Persistent activation and appearance changes use the existing project-content
history boundary:

- applying legend-editor changes is one undo step;
- compact `Gebruikte activeren` is one undo step;
- creating, duplicating, importing, optimizing into, or refreshing plans
  records activation in the same atomic transition as the plan operation;
- undo/redo restores both the correct activation and the active plan;
- every persistent change marks the project dirty through the existing content
  comparison.

UI-only editor scope is excluded from project content, dirty state, recovery,
and undo/redo.

Asynchronous analysis and optimization retain stale-response rejection. A
result may be applied only to the project/plan revision and resolved candidate
snapshot for which it was requested.

## Error handling

- Invalid schema-4 activation data fails through the normal structured IFCPP
  validation path; the loader does not guess a different plan's activation.
- Missing activation fields in schemas 1-3 use the defined migration source.
- An active-legend candidate source with no concrete configurations is a
  normal disabled state, not an optimization failure.
- An unexpected candidate-resolution or core request failure leaves project
  and pile-plan state unchanged and uses the existing optimization error path.
- If a current assigned configuration becomes unavailable after a source
  refresh, the existing unavailable-assignment handling remains authoritative;
  fallback rendering does not manufacture a configuration catalog entry.
- Unknown values referenced by a schema-4 pile plan are normalized or rejected
  consistently with the existing canonical-configuration rules; they are not
  added to project appearance implicitly.

## Implementation boundaries

Rust owns:

- schema-4 project structures and migration;
- canonical configuration identity and explicit optimizer candidate input;
- technical and grouped eligibility;
- optimizer limit and selection behavior;
- serialization round trips and compatibility tests.

TypeScript owns:

- active-plan and per-plan activation selectors;
- editor drafts, UI-only scope, badges, and conflict explanations;
- viewer, compact-legend, and pile-option fallback presentation;
- candidate-source controls and resolution against the canonical catalog;
- atomic project transitions, undo/redo, dirty state, and stale-response
  protection;
- localized copy and accessible interaction details.

Both browser/WASM and desktop/Tauri paths expose equivalent schema and
optimization behavior.

## Verification

Implementation proceeds in vertical phases with tests added before behavior:

1. **Schema and migration**
   - Rust and TypeScript read schemas 1-3 and copy legacy activation to every
     plan.
   - Schema 4 round trips distinct plan activations, shared appearance, and
     candidate source.
   - Schema 4 is written only on save.

2. **Pile-plan lifecycle**
   - New, duplicate, CSV/XLSX import, in-place optimization, new-plan
     optimization, deletion, switching, and source refresh follow the matrix
     in this design.
   - New optimization plans activate resolved candidate values even when the
     result uses a strict subset.

3. **History and dirty state**
   - Editor apply and compact activation undo and redo atomically.
   - Plan lifecycle operations restore activation correctly through history.
   - UI-only editor scope never marks the project dirty.

4. **Legend editor**
   - Scope starts with current plan and survives only within the open session.
   - Bulk-used and automatic-assignment commands use the specified union.
   - Manual activation edits only current plan.
   - `+n` excludes current plan and lists stable plan names.
   - Duplicate warnings appear exactly for co-active conflicts in the current
     encoding channel.

5. **Viewer and compact legend**
   - All four activation combinations render correctly in both existing
     encoding modes.
   - Fallback markers retain selection, hover, overlap cycling, and overlay
     order.
   - Used inactive compact items show neutral visuals and `!`; unused inactive
     items are absent.

6. **Pile-option table**
   - The current assignment remains visible and sorted when filtered.
   - Partial-neutral markers and one or two `Uit`/`Off` labels match its
     inactive properties.
   - Other inactive options stay hidden.

7. **Optimizer**
   - Both candidate sources resolve the expected explicit configuration keys.
   - Limits clamp after candidate resolution.
   - Empty resolution disables the run without mutation.
   - WASM and Tauri deliver equivalent inputs and results.
   - Stale results cannot apply to a changed plan or candidate snapshot.

8. **Regression and manual acceptance**
   - Run the complete Rust core, WASM, and frontend test suites.
   - Run the production frontend build and desktop build checks appropriate to
     the changed contracts.
   - In the live viewer, use at least two pile plans with different activation
     and verify switching, editor scope, fallback markers, current-row
     retention, both optimizer sources, undo/redo, save, and reopen.

## Release boundary

The implementation targets 0.3.1-alpha. Issue #24 is completed and verified
before deciding whether issue #32 belongs in the same release. Nothing in this
design pre-implements #32 or makes its future inclusion necessary for schema 4
to be coherent.
