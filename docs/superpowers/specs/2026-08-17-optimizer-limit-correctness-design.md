# Optimizer Limit Correctness Design

## Goal

Make the existing greedy pile-configuration optimizer safe, explicit, and
honest for release 0.2.1. Every returned assignment must respect the active
optimization constraints. Targets that cannot be assigned must remain
unassigned, retain an explanation with their pile plan, and be represented
distinctly from missing or invalid engineering options.

This design resolves issue #27 and a bounded part of the optimizer-invariant
work described by #30. It deliberately keeps the locally greedy search method.
The absence of a global optimality guarantee is documented separately in #31
and may become irrelevant when the spatially coherent optimizer from #21
replaces this optimization line.

## Product Semantics

The optimizer has two ordered objectives for completed results:

1. maximize the number of assigned target load points;
2. minimize assignment cost within equal coverage.

No cost difference may compensate for leaving one additional target
unassigned. Configuration counts, distinct pile-size counts, distinct
tip-level counts, enabled legend values, maximum utilization, fixed
assignments, and locks remain hard constraints.

The greedy search continues to select one configuration at a time. At each
step it prefers the feasible configuration that covers the most currently
uncovered targets. Within equal new coverage it prefers the lowest resulting
assignment cost. After full coverage it may add another permitted
configuration only when that lowers the assignment cost. Stable canonical
configuration ordering breaks a remaining tie.

This is a deterministic heuristic, not a claim of global optimality. In
particular, a locally best configuration can consume a size, tip-level, or
configuration slot that a better final combination would have used. Issue #31
contains the limitation, a counterexample, and possible future search methods.

## Core Ownership and Request Contract

Rust remains the authoritative owner of optimizer validity and constraint
enforcement. The browser and Tauri adapters expose the same serialized
contract and remain thin.

The optimization request will provide Rust with:

- pile options for the relevant project load points;
- the requested target load-point IDs;
- locked load-point IDs;
- current assignments represented by concrete pile configuration data;
- whether limits apply to the target or the whole pile plan;
- enabled sizes and tip levels;
- maximum sizes, tip levels, configurations, and utilization;
- pile-head and cost settings.

TypeScript may choose the requested target scope because that is application
workflow. Rust determines the effective targets by excluding locks, derives
fixed and baseline configurations from the current assignments, and applies
the requested limit scope. TypeScript will no longer precompute separate
baseline size, tip-level, and configuration arrays.

When limits apply to the target, assignments outside the effective target do
not consume target limits. When limits apply to the whole plan, all retained
assignments outside the effective target, including locked assignments, form
the baseline and consume the corresponding limits.

This moves baseline derivation, lock exclusion, and hard-limit semantics into
the core as the partial #30 migration. Canonical configuration identity across
the entire frontend, aggregation, and project normalization remain outside
this issue.

## Core Result Contract

The optimizer will return one structured result rather than a bare list of
choices:

- `assignments`: choices for effective targets that can be assigned within the
  selected configuration set;
- `unassigned`: effective target IDs with an explicit reason;
- `selected_configurations`: the configuration keys used by the result;
- final distinct size, tip-level, and configuration counts needed for contract
  verification and summary diagnostics.

The result reasons distinguish at least:

- no valid engineering option exists;
- valid options exist, but none pass the enabled-configuration or utilization
  constraints;
- eligible options exist, but none belong to the configuration set selected
  within the configured count limits.

The adapters serialize the same reason enum for WASM and Tauri. Unknown future
reasons must not turn into an assignment outside the allowed set.

## Scoring Without Sentinels

`OptimizationScore` will use named fields rather than encoded penalties.
Coverage is represented by an explicit unassigned count. Known costs are
accumulated in `u64`.

Missing costs are represented explicitly. Within equal coverage, a result with
fewer assignments whose cost is unknown is preferred; the known total cost is
then compared. This keeps a structurally valid option available for coverage
without pretending that an unknown cost is zero or adding a large integer
sentinel. Canonical configuration ordering provides the final deterministic
tie-break.

The greedy step comparison uses the same explicit components as marginal
heuristics: new coverage first, then cost completeness and resulting known
cost. The final result reports the completed coverage and cost fields. Neither
partial nor final scoring adds artificial cost for an uncovered target.

## Assignment Behavior

After the greedy configuration set is selected, each effective target may only
choose an eligible option belonging to that set. The current fallback to the
cheapest valid option outside the set is removed.

Feasible targets receive their cheapest eligible option inside the selected
set. Infeasible targets receive no assignment and an explicit result reason.
The frontend clears any previous assignment for those targets. Partial
feasibility is a successful optimizer result, not a transport or calculation
error.

Locked targets are not changed. Non-target assignments are preserved. The
returned and applied plan must never exceed the relevant hard limits; result
counts make that invariant directly testable.

## Persisted Pile-Plan Outcome

Each pile plan gains optional optimizer-outcome metadata keyed by load-point
ID. The metadata stores the unassigned reason from the last optimization that
targeted that point. It is part of project content, IFCPP persistence, and
undo/redo, with an empty default for older projects.

The lifecycle is per load point:

- a manual pile assignment change or removal clears the stored optimizer
  outcome for that point only;
- a new optimization replaces outcomes for the effective targets in its
  scope;
- outcomes for points outside that optimization scope remain unchanged;
- duplicating a pile plan preserves its outcomes;
- a fresh non-optimization plan starts without outcomes;
- creating an optimization plan preserves out-of-scope outcomes from its
  source and installs the new outcomes for its targets.

The stored reason describes the last optimization result. The tooltip wording
will make that provenance explicit instead of claiming that later project
changes were reevaluated automatically.

The IFCPP field is additive and optional. Rust supplies the authoritative
default so existing schema-three projects remain compatible without a schema
version bump solely for this metadata.

## Viewer Status Semantics

Unassigned load points retain the existing engineering-state precedence:

1. yellow cross when every option is missing required CPT capacity data;
2. red cross when no valid engineering option exists;
3. optimizer unresolved symbol when valid engineering options exist but the
   last optimization could not assign one within its active constraints.

The optimizer unresolved state does not reuse a cross, pile legend shape, or
new semantic color.

At a closer zoom, small candidate nodes and converging paths terminate in a
question mark. At a more distant zoom, only the question mark remains. The
question mark is anchored exactly on the load-point coordinate in both levels
of detail; revealing or hiding the candidate paths must not move it. Geometry
scales with the existing viewer transform and symbol-size control. The
implementation does not counter-scale the symbol to a fixed screen size.

The icon uses a dark neutral foreground with a slightly wider light
under-stroke following the same paths. This contour halo improves contrast on
project drawings without adding a surrounding circle, square, or background
container. The existing orange selection ring stays centered on the question
mark. Hit testing and the tooltip apply to the complete marker.

The detailed-to-simple zoom threshold is a presentation value and will be
tuned through browser inspection. Both variants use the same anchor and SVG
path language. The question mark will be an SVG path rather than font text so
browser and Tauri rendering remain deterministic.

## Optimizer Command Icon

The existing optimization command icon currently reads more like routing or a
network. It will be replaced as part of #27 with a related deterministic SVG:

- several smaller open candidate nodes on the left;
- simple converging paths;
- one larger filled selected-result node on the right.

The command icon communicates “multiple candidates become one best choice.”
The unresolved viewer marker reuses the convergence language but replaces the
result with a question mark. Other ribbon icons and the pile legend symbol
catalog are unchanged.

## Summary and Localization

The optimization summary will separately report:

- assigned target count;
- changed target count;
- unassigned target count.

An all-unassigned result still completes with a summary. Only adapter,
serialization, or core execution failures use the error presentation.

Dutch and English copy will explain both the summary and marker tooltip. The
tooltip will say that the last optimization did not find an assignment within
its configured limits. More specific reason text may distinguish utilization,
enabled configurations, and exhausted configuration-count limits without
changing the marker shape.

## Verification

Rust tests will cover:

- coverage-first and cost-second greedy selection;
- deterministic tie-breaking;
- missing costs without sentinel arithmetic;
- realistic numbers of uncovered targets without overflow;
- impossible size, tip-level, and configuration limits;
- maximum utilization and disabled configurations;
- target versus whole-plan baselines derived in Rust;
- explicit locked assignments;
- no fallback assignment outside the selected set;
- final distinct counts matching every configured hard limit;
- explicit unassigned reasons.

WASM and Tauri contract tests will prove that both adapters accept the same
request and return the same structured result.

TypeScript tests will cover applying partial results, summary counts, per-point
status replacement, manual status clearing, plan duplication, undo/redo, IFCPP
round trips, localized copy, marker-state precedence, icon structure, and the
two viewer levels of detail.

The complete Rust and frontend test suites and production builds will run.
Browser inspection will verify the command icon, both unresolved marker
variants, the zoom transition, selection, tooltip behavior, and contrast on a
representative drawing. The known grid and Chromium rasterization work in #23
is not reopened or changed as part of this feature.

After the implementation is verified and pushed, #30 will receive a comment
that identifies the exact optimizer-invariant migration, links #27 and the
implementation, lists the relevant core and adapter tests, and explicitly
states that the rest of #30 remains open.

## Out of Scope

- Global optimality for configuration-set selection.
- Beam search, branch-and-bound, mixed-integer programming, or another
  replacement search method; these are tracked in #31 and may be superseded by
  #21.
- Spatial grouping or connected-region objectives from #21 and #22.
- Legend behavior from #24 beyond avoiding visual and semantic conflicts.
- Canonical configuration identity across the complete frontend from #29 and
  #30.
- Changes to the grid/rasterization issue tracked in #23.
