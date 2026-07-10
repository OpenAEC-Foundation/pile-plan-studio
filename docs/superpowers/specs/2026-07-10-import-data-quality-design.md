# Import Data Quality Design

## Goal

Pile Plan Studio should import useful project data when the CPT coordinate and
bearing-capacity sources are not perfectly aligned, while rejecting ambiguous
or physically invalid values. Recoverable inconsistencies are summarized as
warnings and stored in IFCPP provenance.

## Rules

### Bearing capacities without CPT coordinates

The CPT coordinate source defines which CPTs belong to the project. Bearing
capacity rows referencing another CPT ID are removed before the project is
created. Import continues and records one summarized warning containing:

- the number of removed rows;
- the number of affected CPT IDs;
- the sorted affected CPT IDs.

### CPT coordinates without bearing capacities

CPTs without any remaining bearing-capacity rows stay in the project. They
remain available to automatic and manual CPT selection. The import records one
warning listing the affected CPT IDs.

When such a CPT is selected for a load point, the existing pile-option logic
marks the affected configurations as `Missing`. A CPT without any capacity
rows therefore makes every considered configuration `Missing` for that load
point.

### Duplicate bearing capacities

The unique key for a bearing-capacity row is:

`CPT ID + pile size + pile tip level`

Tip levels are compared using the core's millimetre-scaled integer key to avoid
floating-point comparison noise.

- Exact duplicates with the same FRD are reduced to one row and summarized in
  a warning.
- Duplicate keys with different FRD values are ambiguous and block import.

### Invalid values

Import is blocked for:

- non-finite numeric values;
- pile size equal to zero;
- FRD below zero;
- duplicate load-point IDs;
- duplicate CPT IDs;
- empty sources or rows with insufficient columns.

`FRD = 0` remains valid because it unambiguously represents no available
resistance. Load values at or below zero are retained for now; support and
interpretation of tensile loads is outside this validation step.

## Warning placement

Warnings produced while reconciling CPTs and capacities are attached to the
bearing-capacity entry in `project.import_log`. Existing provenance fields and
the fixed schema version remain unchanged. The React import panel shows the
warnings after a successful import, and they remain available after saving and
reopening the IFCPP project.

The importer does not enumerate partially missing pile configurations. Those
remain part of normal pile-option evaluation and appear as `Missing` where
relevant.

## Import summary

After a successful import, the UI shows a compact summary with:

- imported load-point, CPT, and bearing-capacity counts;
- ignored orphan bearing-capacity row count;
- deduplicated bearing-capacity row count;
- CPT IDs without any bearing capacities;
- all generated warning messages.

The currently open project is replaced only after reconciliation and all hard
validation checks succeed.

## Tests

Rust tests cover:

- orphan capacity rows are removed and summarized;
- CPTs without capacities are retained and summarized;
- selecting a CPT without capacities produces `Missing` pile options;
- exact duplicate capacity rows collapse to one;
- conflicting duplicate capacity rows block import;
- zero pile size and negative FRD block import;
- missing configurations are not emitted as import warnings.

Frontend tests cover rendering the successful import summary and keeping the
summary available without treating warnings as errors.

