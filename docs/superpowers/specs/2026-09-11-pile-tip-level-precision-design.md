# Canonical pile-tip-level precision — Design

**Status:** Approved in design discussion; awaiting written review

**Created:** 2026-09-11

**Primary issue:** [#29 Define consistent pile tip level precision and
rounding](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/29)

**Related issues:** [#30 Consolidate leaked engineering domain logic in the
Rust core](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/30),
[#21 Optimize for spatially coherent pile
configurations](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/21)

## Purpose

Establish one explicit precision and equality policy for pile-tip levels across
source import, project validation, analysis, configuration identity, active
legend values, filtering, display, and persistence.

The Rust core already derives a canonical integer-millimetre key by rounding a
metre value. The application must now reject physical submillimetre input at
its boundaries, use the resulting millimetre value for every discrete identity
decision, and display every accepted value without hiding meaningful digits.

This is a prerequisite for the spatial optimizer in #21. A spatial objective
must not treat two visually identical levels as different configurations or
merge two distinct accepted levels because different subsystems use different
equality rules.

## Precision policy

Pile-tip levels have whole-millimetre precision:

- the canonical identity is a signed integer number of millimetres;
- metre input is valid when it can be represented as a whole millimetre;
- insignificant decimal-to-binary floating-point noise is tolerated;
- a physical submillimetre fraction is invalid and is never silently rounded;
- non-finite values and values outside the signed integer range are invalid;
- metres are retained for engineering calculations, exchange fields, and
  presentation, but not for equality, hashing, grouping, or filtering.

The floating-point tolerance exists only to accept the machine representation
of decimal whole-millimetre values. It must be several orders of magnitude
smaller than one millimetre and must not make a genuinely submillimetre value
valid.

No 100 mm grid is imposed. The tracked sample project has a smallest distinct
tip-level interval of 250 mm but contains levels ending in `.25 m` and `.75 m`.
Restricting values to one decimal place would therefore alter or reject valid
current project data.

## Domain ownership and architecture

Rust is the sole authority for validating and canonicalizing pile-tip levels.
A focused core module owns:

- checked conversion from metres to signed integer millimetres;
- conversion from canonical millimetres back to metres;
- structured precision errors containing the rejected value and its context;
- canonical comparison, ordering, and deduplication through
  `PileConfigurationKey`.

`PileConfigurationKey` remains:

```rust
pub struct PileConfigurationKey {
    pub pile_size_mm: u32,
    pub pile_tip_level_mm: i64,
}
```

The unchecked rounding helper is no longer a public way to establish identity
from untrusted metre input. Boundary operations validate first and downstream
algorithms consume canonical keys or already validated values.

TypeScript may compare, copy, and derive tokens from core-produced integer
keys. It must not establish tip-level identity by comparing raw metre values or
by independently rounding metres.

## Validation boundaries

### CSV and XLSX source import

Foundation-advice parsing validates every pile-tip-level cell after numeric and
unit parsing and before bearing-capacity reconciliation. Source preview returns
a blocking structured diagnostic with:

- a stable diagnostic code;
- the number of invalid rows;
- every invalid source row number and original value;
- a fallback English message for non-UI consumers.

The interface renders Dutch and English explanations from the structured
diagnostic. Full import runs the same validation again so preview cannot be
bypassed and a changed source cannot introduce invalid values between preview
and import.

The operation remains atomic. No inputs, plans, selections, assignments,
groups, legend mappings, or import-log entries are changed when any invalid
tip level exists.

### IFCPP read and write

Rust IFCPP reading validates every persisted pile-tip-level representation
after supported schema migration and before returning a project. This includes
at least:

- bearing-capacity tip levels;
- per-plan active tip levels;
- stored tip-level legend values;
- legacy project-level active and legend values encountered during migration.

Canonical integer configuration keys must themselves deserialize as integers.
The project writer runs the same semantic validation and cannot serialize an
invalid project.

Before an external or browser-recovered IFCPP project replaces application
state, a thin WASM or Tauri route passes the complete project through the Rust
parser and validator. The frontend may continue mapping the validated project
to React state through the existing adapter until the broader authoritative
IFCPP work in #30. No precision rule is duplicated in that adapter.

Invalid IFCPP input is rejected without modifying either the file or the
currently open project. This semantic validation does not require a schema
version bump.

### Core calculation and topology entry points

Public core operations that can receive metre-valued bearing capacities from
runtime callers validate them before deriving configuration keys. Analysis,
aggregation, grouping, optimization, and tip-level-region topology then use the
canonical integer keys. This prevents programmatic WASM or Tauri callers from
bypassing the source and IFCPP boundaries. Invalid input produces a structured
error; it must not panic or return a partially calculated result.

## Duplicate and collision behavior

Existing bearing-capacity duplicate reconciliation continues to own duplicates
that are already valid at whole-millimetre precision.

Values with a physical submillimetre fraction fail precision validation before
reconciliation. If several such values would previously have rounded to one
millimetre key, each offending source row is represented in the diagnostic;
they are not silently merged or resolved by selecting one capacity.

Positive and negative zero canonicalize to the same zero-millimetre level.

## Runtime identity and filtering

All discrete pile-tip-level decisions use canonical millimetres, including:

- active pile-plan tip levels;
- legend lookup and legend-conflict detection;
- legend selection filters;
- used-configuration discovery;
- optimizer candidate catalogs and active-legend candidate selection;
- selected assignments and multi-selection aggregation;
- connected tip-level-region grouping;
- deterministic sorting and deduplication.

Metre arrays may remain in the IFCPP schema for readability and compatibility,
but they are validated and converted to millimetre keys before comparison. The
application must not rely on `Array.includes` or strict equality between raw
floating-point metre values for these decisions.

## Presentation

One locale-aware frontend formatter presents accepted pile-tip levels with the
minimum number of digits required and at most three decimal places:

- `-18 m`;
- `-18.5 m` in English and `-18,5 m` in Dutch;
- `-18.25 m` in English and `-18,25 m` in Dutch;
- `-18.525 m` in English and `-18,525 m` in Dutch.

The shared formatter is used by the legend, legend editor, right-side
properties, pile-option tables, optimization results, viewer labels, and other
derived tip-level labels. Interpreted source tables preserve the same accepted
precision and never show fewer digits than required to distinguish canonical
values.

Unrelated quantities retain their existing formatting. Coordinates,
utilization, loads, costs, and the pile-head level do not inherit this policy.

## Error presentation

The concise Dutch source-import form is equivalent to:

> Puntniveau -18,5004 m op rij 27 heeft een nauwkeurigheid kleiner dan 1 mm.
> Gebruik maximaal drie decimalen in meters.

The English form conveys the same information. When multiple rows fail, the
preview shows the total and a bounded, deterministic list of examples while
retaining the complete structured diagnostic for tests and non-visual clients.

An IFCPP-open error identifies the invalid field or project section and value.
No message suggests that the value was repaired or rounded.

## Compatibility

IFCPP schema version 4 remains current. Valid projects from supported schema
versions 1 through 4 continue to open and normalize through the existing
migration path.

Projects containing physical submillimetre tip levels are rejected rather than
rewritten. Automatic repair would be ambiguous because rounding can merge
configuration identity, legend activation, assignments, and bearing-capacity
rows. The original file remains available for correction at its source.

The sample project remains valid. Its `.25 m` and `.75 m` values provide a
regression against accidentally enforcing a 100 mm grid.

## Runtime contracts

The Rust validation result is exposed through thin equivalent WASM and Tauri
adapters. Transport fields carry the original metre value, canonical context,
and source location needed for presentation; adapters do not calculate
precision themselves.

Browser and desktop calls must accept and reject identical fixtures. The
frontend converts only field naming and error presentation.

## Verification

### Rust unit tests

- integral metre, decimetre, centimetre, and millimetre values are accepted;
- positive and negative values canonicalize symmetrically;
- accepted values convert back to the expected metre value;
- insignificant binary floating-point noise is accepted;
- genuine positive and negative submillimetre values are rejected;
- `NaN`, positive infinity, and negative infinity are rejected;
- values outside the signed millimetre range are rejected;
- canonical ordering and deduplication remain deterministic.

### Import and IFCPP tests

- CSV and XLSX preview report all invalid source rows deterministically;
- full import rejects the same invalid rows without partial mutation;
- valid `.25 m` and `.75 m` source values remain unchanged;
- IFCPP versions 1 through 4 accept valid whole-millimetre values;
- IFCPP read and write reject invalid persisted values;
- a rejected open preserves the active project;
- browser recovery safely rejects an invalid recovery record;
- valid projects round-trip without changing canonical levels.

### Frontend and contract tests

- active values, legend lookup, filters, conflicts, and optimizer candidates
  compare canonical millimetres;
- no production TypeScript code derives tip-level identity by rounding metres;
- English and Dutch formatting cover zero through three decimal places;
- import and project-open diagnostics are localized from shared structured
  data;
- WASM and Tauri validation contracts return equivalent results;
- translation-key coverage remains complete.

### Full verification

Run the complete Rust workspace tests, frontend tests, and production browser
build. In the browser preview, inspect sample-project levels ending in whole,
half, quarter, and three-decimal metre values where available. Verify
legend labels, legend editing, selection filters, pile-option details,
optimization summaries, source tables, and error presentation.

## Out of scope

- enforcing a 100 mm or other coarser grid;
- arbitrary submillimetre engineering precision;
- automatic repair or rounding of invalid project files;
- manually editing pile-tip levels in the interface;
- changing pile-head-level precision;
- introducing IFCPP schema version 5;
- completing the broader IFCPP normalization and domain-ownership audit in
  #30;
- changing the greedy optimizer or implementing #21.

## Alternatives rejected

### Store every physical tip level as an integer domain type

Replacing every metre-valued field with an integer would provide stronger type
safety but would touch physical calculations, transport DTOs, and the project
format far beyond the precision defect. Boundary validation plus canonical
integer identity provides the required guarantee with less migration risk.

### Enforce a 100 mm grid

The current sample data contains quarter-metre levels that do not lie on a
100 mm grid relative to zero. This rule would reject or alter current valid
data without an engineering requirement that justifies doing so.

### Correct only formatting and frontend equality

Presentation-only changes would leave Rust callers and import reconciliation
able to silently merge submillimetre values. Precision is an engineering data
invariant and therefore belongs in the shared core.
