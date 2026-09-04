# Canonical Pile Configurations and Multi-Load-Point Aggregation — Design

**Status:** Approved for implementation

**Created:** 2026-09-01

**Target:** Pile Plan Studio 0.3.0

**Primary issue:** [#30 Consolidate leaked engineering domain logic in the Rust core](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/30)

**Related issues:** [#29 Pile tip level precision](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/29), [#21 Spatially coherent optimization](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/21), [#28 Load-point grouping](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/28)

## Purpose

Establish the focused #30 foundation needed before physical pile-cap grouping
and the spatial optimizer. Rust becomes authoritative for pile-configuration
identity and cross-load-point option aggregation. TypeScript retains React
state orchestration, interaction, filtering, sorting, labels, and formatting.

The work removes the current runtime round-trip through raw strings such as
`"320|-18.5"`, corrects multi-selection utilization semantics, and provides a
reusable Rust aggregation primitive for the later `OptimizationUnit` model.

## Scope

This slice implements:

- one canonical `PileConfigurationKey` value object;
- a clear internal name, `pile_tip_level_mm`, for the integer millimetre PPN;
- Rust-only conversion from metre-valued PPN data to canonical identity;
- structured pile assignments throughout the TypeScript runtime;
- a pure Rust multi-load-point option aggregation function;
- thin and equivalent WASM and Tauri adapters;
- stale-safe cached multi-selection aggregation in the frontend;
- adaptive single- versus multi-selection pile-option columns.

## Non-goals

This slice does not:

- change the IFCPP schema or the serialized `pile_tip_level_m_key` field;
- decide whether PPN input should be restricted to 100 mm precision;
- migrate authoritative IFCPP parsing and normalization fully into Rust;
- complete the audit of active-configuration filtering;
- change cost-catalog normalization or import reconciliation;
- derive pile-cap groups or persist group settings;
- build `OptimizationUnit` or alter the greedy optimizer;
- implement #21;
- change legend precision or project export presentation;
- introduce an opaque configuration-ID registry.

## Ownership boundary

### Rust owns

- conversion from `pile_tip_level_m` to canonical integer millimetres;
- configuration equality, hashing, ordering, and deduplication;
- per-load-point validity, utilization, governing CPT, and FRd;
- cross-load-point status, maximum utilization, and critical location;
- deterministic aggregation ordering and tie-breaking;
- shared WASM/Tauri DTO semantics.

### TypeScript owns

- runtime storage of core-produced canonical value objects;
- React state, undo/redo, selection, and async request lifecycle;
- table layout, column visibility, filtering, sorting, labels, and formatting;
- navigation from a critical load point to its single-location detail view;
- browser persistence orchestration and the temporary legacy IFCPP adapter.

## Canonical configuration model

Move the configuration identity out of optimizer-oriented `analysis.rs` into a
focused shared module.

```rust
#[derive(Clone, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct PileConfigurationKey {
    pub pile_size_mm: u32,
    pub pile_tip_level_mm: i64,
}
```

The module exposes the only metre-to-identity conversion:

```rust
impl PileConfigurationKey {
    pub fn from_metres(pile_size_mm: u32, pile_tip_level_m: f64) -> Self;
    pub fn pile_tip_level_m(&self) -> f64;
}
```

`from_metres` preserves the existing rule
`round(pile_tip_level_m * 1000)`. The broader 100 mm policy remains #29.
Core input paths continue to reject or normalize invalid engineering numbers
at their existing boundaries; this refactor does not introduce a second
precision policy.

Every `PileConfigurationOption` returned by project analysis carries an
explicit canonical key in addition to its metre-valued PPN used for physical
display and calculations. All discrete core algorithms use the key.

## Runtime assignment model

Replace float-string assignment state:

```typescript
selectedPileOptionKeysByLoadPoint: Map<number, string>
```

with structured state:

```typescript
selectedPileConfigurationsByLoadPoint: Map<number, PileConfigurationKey>
```

All plan duplication, switching, history, recovery, import, export, optimizer,
legend, viewer, and region-topology paths carry the value object. TypeScript
may derive a one-way token from the two canonical integers for React keys,
table lookup, or `Map`/`Set` indexing. No token is parsed back into engineering
data, and no TypeScript path calls `Math.round(level * 1000)` to establish
configuration identity.

Value equality compares `pile_size_mm` and `pile_tip_level_mm`. Presentation
code may use a shared TypeScript equality/token helper because it operates on
already canonical integers; it must not accept metre-valued PPN input.

## Physical calculations and units

Integer millimetres are used for discrete configuration semantics:

- equality and hashing;
- deduplication and lookup;
- grouping and conflicts;
- optimization configuration limits;
- active-configuration identity;
- spatial PPN regions;
- deterministic sorting and tie-breaking.

Metres remain appropriate for physical values and presentation:

- imported bearing-capacity PPN values;
- pile-head level;
- pile length and cost;
- labels, tables, and exports while #29 remains open.

Functions such as pile-cost calculation accept a canonical configuration and
perform the local `pile_tip_level_mm / 1000.0` conversion inside Rust. The
pile-head level is not rounded to millimetres by this slice.

## IFCPP compatibility boundary

The runtime and new core contracts use `pile_tip_level_mm`. IFCPP schema 3
continues to read and write:

```json
{
  "pile_size_mm": 320,
  "pile_tip_level_m_key": -18500
}
```

The Rust project model and the temporary TypeScript project-file adapter map
this legacy field directly to and from the integer `pile_tip_level_mm`; no
floating-point conversion is involved. This preserves project exchange with
the parallel 0.2.x branch. The actual wire-field rename belongs to the later
authoritative IFCPP phase of #30, when both feature lines no longer need to
exchange projects.

## Multi-load-point aggregation

Add a pure core function:

```rust
pub fn aggregate_pile_options_for_load_points(
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
) -> Vec<AggregatedPileConfiguration>;
```

The output is the union of canonical configurations encountered across all
requested load points.

```rust
pub struct AggregatedPileConfiguration {
    pub configuration: PileConfigurationKey,
    pub pile_tip_level_m: f64,
    pub status: AggregatedPileConfigurationStatus,
    pub missing_load_point_ids: Vec<u32>,
    pub invalid_load_point_ids: Vec<u32>,
    pub maximum_utilization: Option<f64>,
    pub critical_load_point_id: Option<u32>,
    pub critical_governing_cpt_id: Option<u32>,
    pub critical_governing_frd_kn: Option<f64>,
}

```rust
pub enum AggregatedPileConfigurationStatus {
    Valid,
    Invalid,
    Missing,
}
```

### Status rules

- A load point is missing when the configuration is absent or its matching
  option reports missing selected-CPT capacity data.
- `Missing` wins when at least one requested load point is missing.
- Otherwise `Invalid` applies when at least one matching option has
  `is_option == false`.
- Otherwise the aggregate is `Valid`.
- Missing and invalid load-point IDs are sorted and deduplicated.

### Critical-location rules

- `maximum_utilization` is the maximum known utilization among matching
  options.
- `critical_load_point_id` identifies the option providing that maximum.
- Equal utilization is broken by the lowest load-point ID.
- Critical governing CPT and FRd are copied from that load point's option.
- If no matching option has a utilization, all critical fields are `None`.
- Average utilization is not part of the new contract.

### Ordering and complexity

- Aggregation indexes options by canonical key instead of repeatedly scanning
  float-valued arrays.
- Output sorts by ascending pile size and then descending PPN millimetres,
  matching existing deterministic presentation order.
- Input map and option order do not affect output.
- A one-load-point aggregate is behaviorally equivalent to the corresponding
  individual core option.

## Cross-runtime contract

Expose one request through WASM and Tauri:

```text
AggregatePileOptionsRequest
- options_by_load_point: map<load_point_id, pile options>
```

Both adapters deserialize, call the pure core function, and serialize the
result without implementing aggregation. Contract tests use the same fixture
and assert equivalent DTOs.

## Frontend lifecycle

Single selection does not trigger another core call. Project analysis already
produced and cached its authoritative options in
`pileOptionsByLoadPointId`; TypeScript maps those values directly to the table
presentation model.

For two or more explicitly selected load points:

1. sort the selected load-point IDs;
2. select only their cached option arrays;
3. build a cache key from the analysis-options identity/revision and IDs;
4. call the core aggregation adapter when the cache misses;
5. ignore a response whose generation no longer matches the current request;
6. publish only the latest completed aggregate;
7. show the existing inline loading state while no current aggregate exists.

The controller does not include automatically related future pile-cap members.
The earlier grouping design deliberately allows manual assignments without
prevalidating unselected group members.

## Adaptive pile-option table

For exactly one selected load point, keep:

```text
Symbol | Size | Tip | Status | Cost | Use | Governing CPT | FRd
```

For multiple explicitly selected load points, show:

```text
Symbol | Size | Tip | Status | Total cost | Max use | Critical load point
```

Rules:

- total cost is the existing core-produced unit cost multiplied by the number
  of explicitly selected locations;
- unknown unit cost remains unknown rather than becoming zero;
- maximum use and critical load point come from the aggregate DTO;
- the critical load point is an interactive link that opens the existing
  single-location view;
- filters and sorting operate on the currently visible semantic columns;
- bilingual strings are added for total cost, maximum use, critical load
  point, and aggregation failure/loading states.

## Error behavior

- A failed aggregation does not alter project content or cached engineering
  analysis.
- The current multi-selection table displays a localized inline failure state.
- Switching to a single selection immediately resumes the cached individual
  path.
- A later successful request clears the transient failure.
- No aggregate result is persisted to IFCPP or IndexedDB recovery content.

## Verification

### Rust core

- canonical conversion covers negative values and millimetre rounding edges;
- canonical equality, hashing, and ordering ignore raw float representation;
- IFCPP selected piles still serialize with `pile_tip_level_m_key` and
  round-trip to `pile_tip_level_mm`;
- aggregation covers valid, invalid, absent, and missing-capacity options;
- maximum utilization and lower-ID tie-breaking are deterministic;
- shuffled maps/options produce identical output;
- singleton aggregation matches individual core facts.

### WASM and Tauri

- both adapters accept the new key field and aggregation request;
- both return the same aggregate fixture shape;
- generated WASM bindings expose the new command.

### TypeScript

- project load/save keeps the legacy IFCPP integer field exactly;
- assignments remain structured through plan management, history, import,
  export, optimizer application, legend, viewer, and spatial topology;
- aggregation controllers cache completed results and reject stale responses;
- single selection performs no aggregation call;
- multi-selection columns show total cost, maximum use, and critical location;
- single-selection columns retain governing CPT and FRd;
- unknown costs, missing utilization, and aggregation failures remain explicit.

### Full gates

- `cargo test --workspace`;
- frontend `npm test`;
- frontend production `npm run build`;
- live browser verification of single selection, multi-selection, critical
  location navigation, assignment selection, tip-level regions, and project
  save/open compatibility.

## Follow-up sequence

After this slice:

1. derive project-wide `PileCapGroup` values from the fixed 1,200 mm rule;
2. add grouped assignment propagation;
3. build shared `OptimizationUnit` values using this aggregator;
4. attach the current greedy optimizer through a thin adapter;
5. complete the remaining #30 audit and migrations;
6. begin #21 on the consolidated Rust-domain foundation.
