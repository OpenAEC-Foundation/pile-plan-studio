# Load-point groups design

**Status:** Approved in design discussion

**Target:** Pile Plan Studio 0.3.x foundation

**Related issues:** #28 and, as a consumer, #21

## Purpose

Introduce a small Rust-owned domain foundation for grouping load points that
must share one complete pile configuration. The first producer of these groups
is an automatic project-wide proximity rule intended to recognize piles that
probably belong to the same pile cap.

The work prepares a reusable hard equality constraint for the future spatial
optimizer without coupling groups to the current greedy optimizer. It also
allows a manual configuration choice made through one or more selected load
points to propagate atomically to every member of the involved groups.

## Terminology and boundaries

`LoadPointGroup` is the generic internal term. It describes a set of load
points, not selected piles and not necessarily a physical pile cap. This keeps
the type usable for future manually defined or plan-specific equality groups.

The automatic rule in this phase has pile-cap meaning, but that meaning belongs
to the producer of the group rather than to the generic group type.

`OptimizationUnit` is a temporary, plan- and analysis-specific projection of a
`LoadPointGroup`. It contains eligible configurations, aggregate engineering
facts, costs, and lock effects for one optimization run. It is not a second
persisted group model.

## Scope

This phase includes:

- deterministic automatic load-point grouping in the Rust core;
- a full partition that includes singleton groups;
- atomic propagation of a manual configuration change across a group;
- structured handling of locked group members;
- a solver-independent Rust builder for `OptimizationUnit`s;
- thin WASM and Tauri contracts needed by the current viewer workflow;
- transient user feedback when a manual group assignment is blocked;
- automated tests and a live-viewer acceptance check.

This phase excludes:

- persisting grouping settings or group membership;
- a user-facing grouping toggle or configurable distance;
- manual groups and persistent group IDs;
- group underlays, conflict markers, or group selection;
- integration with the current greedy optimizer;
- implementation of the future #21 optimizer;
- automatic cross-member validity checks during manual assignment;
- a spatial index or a 1000-load-point performance target.

## Domain model

### `LoadPointGroup`

A group contains only a deterministically sorted list of member load-point IDs:

```text
LoadPointGroup {
    load_point_ids: Vec<u32>
}
```

The result is a complete partition of the project's load points:

- every load point occurs in exactly one group;
- a load point with no proximity relation forms a singleton group;
- an empty project produces an empty group list;
- members are sorted by ID;
- groups are sorted lexicographically by their member IDs.

Automatic groups have no persistent ID. Their member list is sufficient for
runtime lookup, caching, diagnostics, and deterministic testing. Future stored
manual groups may introduce explicit IDs without changing this phase's derived
grouping algorithm.

### Grouping settings

The Rust domain exposes a grouping settings value with a default maximum edge
distance of 1200 mm. In this phase the application always uses that default.
The setting is deliberately modeled now so a later project-level toggle and
distance value do not require changing the grouping algorithm's interface.

The setting is not added to IFCPP or IndexedDB in this phase.

## Automatic grouping algorithm

For every unordered pair of distinct load points `A` and `B`, calculate the
squared Euclidean distance from their project coordinates. Add an implicit edge
when:

```text
(A.x_mm - B.x_mm)^2 + (A.y_mm - B.y_mm)^2 < 1200^2
```

The comparison is strict. A pair at exactly 1200 mm does not receive an edge.
Distinct load points at identical coordinates have distance zero and therefore
are connected.

Use an all-pairs scan and union-find to calculate connected components. This
provides the required transitive behavior: if `A-B` and `B-C` are edges, all
three points belong to one group even when `A-C` is at least 1200 mm.

The algorithm is `O(n^2)` in distance comparisons and `O(n)` in retained
union-find state. It does not materialize or return the distance edges. Grouping
is recalculated only when load-point IDs or coordinates change.

Deriving or re-deriving groups is a pure operation. It never changes an
assignment in any pile plan. Existing inconsistent assignments may therefore
remain visible until the user changes them or an optimizer resolves them.

## Manual configuration propagation

Selection remains load-point based. Choosing a pile option starts one Rust-owned
group-assignment operation for the active pile plan. Every group containing at
least one selected load point participates. The target is the union of those
groups, with duplicate groups and members removed.

Inputs include:

- the selected target load-point IDs;
- the requested canonical `PileConfigurationKey`;
- the derived `LoadPointGroup` partition;
- the active plan's current assignments;
- the active plan's locked load-point IDs.

The core returns either an atomic assignment patch or a structured conflict.
TypeScript does not reproduce group or lock decisions.

The operation follows these rules:

1. Every unlocked member of every involved group receives the requested
   complete configuration.
2. A locked member already using the requested configuration remains unchanged.
3. A locked member using another configuration blocks the whole operation,
   including otherwise valid involved groups.
4. A locked member without an assignment also blocks the whole operation.
5. A blocked operation returns no partial patch and changes no project state.
6. The operation does not check whether the requested configuration is valid
   for the other group members. Existing analysis presentation remains
   responsible for exposing invalid manual assignments.

A successful patch is applied to the active pile plan only and is recorded as
one undo/redo action, including when multiple selected points involve multiple
groups. Other pile plans use the same project-wide group partition but keep
their own assignments and locks.

### Conflict feedback

A lock conflict contains enough structured information for later richer
presentation, including the member IDs, blocking IDs, requested configuration,
and locked configuration where available.

In this phase, the existing transient notice at the bottom center is generalized
from an undo-only history notice to an `ActionNotice` with neutral and error
variants. A blocked assignment produces a localized error notice naming the
blocking load point or points. No permanent conflict marker or modal is added.

Pile-option controls are disabled while the short asynchronous assignment
operation is in flight. Stale responses must not apply to a replaced project,
another active pile plan, or a newer assignment state.

## Optimization preparation

The Rust core provides a pure, solver-independent operation that projects every
`LoadPointGroup` into an `OptimizationUnit`. This operation is not integrated
with the greedy optimizer in this phase.

### `OptimizationUnit`

Each unit contains:

- sorted member load-point IDs;
- zero or more eligible `OptimizationUnitOption`s;
- the forced locked configuration, when present.

Each option contains:

- the canonical complete pile configuration;
- total group cost as a concrete integer value;
- maximum utilization over the group;
- critical load-point ID;
- critical governing CPT ID and `FRd`.

The existing Rust pile-option aggregation is reused rather than reimplemented.
Group cost is the sum of the member costs for the configuration. Current
projects use one project-wide pile-head level, but the aggregation remains
expressed as a sum so future member-specific cost inputs do not change the unit
contract.

### Normal candidate eligibility

For an unlocked group, a configuration is eligible only when:

- it exists for every member;
- all selected CPTs have the required bearing-capacity data;
- it is technically valid for every member;
- every member is at or below the optimization `max_utilization`;
- its size and tip level are enabled for optimization;
- its cost can be calculated.

Maximum size, tip-level, and complete-configuration counts are not applied while
building individual units. Those limits couple multiple units and belong to the
eventual solver.

### Lock handling

Locks are plan-specific and reduce the unit domain:

- no locks leave all normal candidates available;
- multiple locked members with the same assigned configuration force that one
  configuration;
- multiple locked members with different configurations are a blocking
  conflict;
- a locked member without an assignment is a blocking conflict;
- a forced locked configuration may fall outside the enabled size/tip filters;
- the forced configuration still counts toward global solver limits;
- the forced configuration must remain technically valid for every member;
- a locked member may retain a utilization above the configured optimization
  limit, because the optimizer is not allowed to change it;
- every unlocked member that would newly receive the forced configuration must
  remain at or below `max_utilization`.

### Costs

Cost is required for trustworthy cost-based optimization.

- A missing project pile-head level is a blocking preparation diagnostic.
- A missing cost-catalog entry is blocking when its configuration is otherwise
  an eligible candidate or is forced by a lock.
- Missing costs for disabled, unforced configurations that cannot enter the
  optimization are irrelevant.
- No fictitious fallback cost or silent penalty is introduced.

Consequently, every returned `OptimizationUnitOption` has a concrete total
cost.

### Preparation result and diagnostics

Preparation inspects all groups and returns all discovered diagnostics in one
result. Blocking diagnostics include at least:

- conflicting locked configurations;
- a locked member without an assignment;
- a forced configuration missing or technically invalid for a member;
- a forced configuration exceeding `max_utilization` for an unlocked member;
- no eligible configuration for a group;
- missing pile-head level;
- missing relevant cost data;
- missing analysis data needed to assess a member.

If any blocking diagnostic exists, no solver starts and no partial optimization
result is applied. This block applies only to optimization. Analysis, viewing,
manual edits, saving, and exporting remain available.

## Runtime architecture

Rust owns:

- grouping settings and proximity decisions;
- union-find and deterministic group construction;
- atomic group-assignment and lock-conflict decisions;
- optimization-unit preparation and diagnostics.

WASM and Tauri provide thin equivalent transport contracts. The frontend calls
the same Rust behavior in browser and desktop modes.

TypeScript owns:

- caching the derived partition for the current load-point geometry;
- request lifecycle and stale-response protection;
- disabling controls during an assignment request;
- applying a successful atomic patch to project history;
- localized transient notices;
- rendering the resulting existing pile symbols and tip-level regions.

The cached partition is runtime state, not project content. It can always be
reproduced from load points and the fixed Rust default.

## Verification

### Rust grouping tests

- empty input;
- singleton input;
- exact duplicate coordinates;
- distances immediately below, exactly at, and immediately above 1200 mm;
- a transitive chain whose endpoints are at least 1200 mm apart;
- multiple disconnected clusters;
- stable output for shuffled input;
- complete partition and unique membership.

### Rust assignment tests

- propagation to every unlocked member;
- locked member already matching the request;
- conflicting locked member;
- locked member without an assignment;
- no partial patch on conflict;
- technical validity is deliberately not consulted;
- active-plan data is the only plan data changed by the caller.

### Rust optimization-preparation tests

- singleton and multi-member units;
- common valid configuration aggregation;
- missing and invalid member options;
- maximum utilization and deterministic critical load-point tie-breaking;
- total group cost;
- enabled size/tip filtering;
- same and conflicting locked configurations;
- locked configuration overriding enabled filters;
- utilization-limit exemption only for already locked members;
- missing pile-head level and relevant catalog costs;
- all blocking diagnostics returned together;
- no global configuration-count filtering at unit level.

### Contract and frontend tests

- browser/WASM and desktop/Tauri parity;
- groups refresh only for changed load-point geometry;
- stale group and assignment responses are ignored;
- one selected member changes the complete group;
- multiple selected members change the union of their groups atomically;
- only the active pile plan changes;
- one undo restores the entire group;
- lock conflicts show an error `ActionNotice` and apply no change;
- selection remains individual;
- tip-level regions refresh after a successful assignment.

### Live-viewer acceptance check

Use the sample project on the development viewer:

1. Identify an automatically derived two-member group and six-member group.
2. Select one member and apply another configuration.
3. Verify that every member changes while selection remains individual.
4. Select members from two groups, apply one configuration, and verify that the
   union of both groups changes as one action.
5. Undo once and verify that all members are restored.
6. Lock one member to a conflicting configuration and verify that the next
   group assignment is blocked with a bottom-center error notice.
7. Verify that another pile plan remains unchanged.
8. Verify that tip-level regions update after a successful change.

## Alternatives considered

### Materialized distance graph plus DFS/BFS

This has the same all-pairs comparison cost but retains every edge. It is useful
only if the edges themselves must be visualized. The current phase needs the
partition, so retaining the graph adds memory and unnecessary coupling.

### Spatial grid or index

This can reduce average comparison cost on large projects, but adds geometric
edge cases and implementation complexity. The direct all-pairs union-find is
appropriate for the current project sizes and is easier to validate while the
grouping rule is still being evaluated.

### Integrating the current greedy optimizer

This would provide immediate end-to-end optimization behavior but couple the
new domain foundation to an optimizer likely to be replaced for #21. The
solver-independent `OptimizationUnit` boundary provides the useful preparation
without that dependency.

## Future extensions

A later project-format migration can persist grouping settings, enable/disable
automatic grouping, and introduce stored manual groups with explicit IDs and
source or purpose metadata. Plan-specific equality groups may then reuse the
same optimizer constraint without being confused with physical project-wide
pile-cap relations.

Viewer underlays, permanent conflict presentation, and optional group selection
remain presentation features over the same `LoadPointGroup` contract. A spatial
index can replace the all-pairs producer without changing consumers if measured
project sizes require it.
