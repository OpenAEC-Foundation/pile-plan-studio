# Import Error Context Design

## Goal

Make import failures actionable by identifying the source file and, where applicable, the worksheet, row, column name, and column number that caused the failure.

## Scope

This change covers CSV and XLSX imports for load points, CPT coordinates, and bearing capacities. Import remains atomic and stops at the first error. Collecting multiple errors in one pass is explicitly deferred.

## Source Context

Every parsed `SourceTable` retains:

- source file name;
- worksheet name for XLSX sources;
- source row numbers, including rows skipped as empty;
- the import role and fixed column definitions used by the role parser.

Cell-related errors use this context and follow a consistent format:

`Bearing capacities.xlsx > Sheet1, row 84, FRD (column 4): value is empty; expected a number.`

CSV errors omit the worksheet segment. Empty strings are described as `value is empty` instead of displaying `''`.

## Errors Covered

Source context is added to:

- invalid numeric and integer values;
- missing cells and rows with too few columns;
- invalid pile sizes and non-finite FRD values;
- duplicate load-point and CPT identifiers, including both relevant rows where available;
- malformed CSV and XLSX input;
- missing or unreadable worksheets;
- missing or duplicate source assignments for an import role.

Validation errors that combine data from multiple files identify the relevant source and record identifier. Reconciliation warnings remain warnings and continue to appear in the successful import summary.

## Architecture

`SourceTable` becomes the owner of immutable source metadata and row locations. Role parsers attach a structured source location to `ImportError` rather than constructing ad-hoc messages. `ImportError` remains the boundary type shared by the Rust core, WASM, Tauri, and the React import panel; its `Display` implementation produces the user-facing English message.

The UI continues to display the message returned by the core. This avoids duplicating import knowledge or message formatting in TypeScript.

## Testing

Rust tests cover:

- an empty numeric CSV cell with file, row, and named column;
- an invalid numeric XLSX cell with file, worksheet, row, and named column;
- a missing cell;
- a short row;
- duplicate identifiers with source rows;
- invalid capacity values with source location;
- file-level CSV, XLSX, worksheet, and source-assignment errors.

Existing reconciliation and end-to-end import tests must continue to pass. Frontend tests only need to prove that core messages are shown unchanged because message construction belongs to Rust.
