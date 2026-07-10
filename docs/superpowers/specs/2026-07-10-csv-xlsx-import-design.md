# CSV and XLSX Import Design

## Goal

Pile Plan Studio must accept either CSV or XLSX files for each of its three
input roles: load points, CPTs, and bearing capacities. The selected role, not
the file name, determines how a file is interpreted. This keeps the alpha
workflow consistent while retaining the current fixed source schemas.

## Scope

The alpha supports `.csv` and `.xlsx`. The older `.xls` format, automatic
column mapping, and interactive column mapping are outside this change.

Each source uses a fixed column order:

| Role | Columns |
| --- | --- |
| Load points | ID, X coordinate (mm), Y coordinate (mm), FED (kN) |
| CPTs | ID, X coordinate (mm), Y coordinate (mm) |
| Bearing capacities | CPT ID, pile tip level (m), pile size (mm), FRD (kN) |

CSV and XLSX versions of the same source data must create equivalent project
objects. XLSX imports read the first non-empty worksheet. Empty rows are
ignored. The existing header behavior for each source remains supported; the
role parser, rather than the table reader, decides whether a row is a header.

## Architecture

### Source description

Every selected file is represented by:

- its explicit import role;
- its original file name;
- its detected format (`csv` or `xlsx`);
- its bytes.

File names may be used by the frontend to suggest a role, but they are never a
requirement and do not override the user's assignment.

### Table readers

The Rust core provides one reader per physical format:

- the CSV reader decodes text and splits it with a proper CSV parser;
- the XLSX reader uses `calamine` and selects the first non-empty worksheet.

Both readers return the same format-neutral table representation. Cells retain
enough type information for the role parsers to accept numeric spreadsheet
cells and textual CSV values consistently.

### Role parsers

Three independent role parsers convert a format-neutral table into IFCPP
domain objects:

- load point parser;
- CPT parser;
- bearing capacity parser.

These parsers own column counts, numeric conversion, row-level errors, and
domain validation. They do not read files or inspect extensions. This boundary
allows later header-based or manual column mapping without replacing the file
readers.

### Shared runtime path

Tauri and WASM expose the same import request model and call the same Rust core
functions. The React frontend only collects files, assigns roles, displays
validation results, and loads the resulting IFCPP project. It contains no
duplicate parsing logic.

## Validation and errors

Import is atomic: no project is created if any required source fails.

Errors identify the source role and, where applicable, the row and column.
Validation covers:

- unsupported extensions;
- unreadable or empty files and workbooks;
- missing worksheets;
- insufficient columns;
- invalid or non-finite numeric values;
- duplicate load point IDs;
- duplicate CPT IDs;
- bearing capacity rows that reference unknown CPT IDs.

The importer may collect multiple validation issues before returning them so
the user can correct a source in one pass. Unexpected parser failures remain a
single general import error with the source file identified.

## IFCPP provenance

For each successful source, the IFCPP import history records:

- original file name;
- assigned role;
- source format;
- import timestamp;
- fixed schema version used by the parser;
- warnings and assumptions produced during import.

The imported domain data remains embedded in IFCPP. Browser projects therefore
do not depend on continued access to the original local files.

## React import workflow

The React import dialog accepts one or three files at a time. It suggests roles
from recognizable names, lets the user change every assignment, and requires
exactly one file for each role before import can start. Each file picker accepts
both CSV and XLSX.

After Rust/WASM validation succeeds, the resulting IFCPP project replaces the
current project and the Project Explorer shows the three imported sources. On
failure, the existing project remains open and the dialog displays the grouped
validation issues.

## Tests

Rust unit tests cover every role with both CSV and XLSX fixtures. Equivalent
fixtures must produce equal domain objects. Additional tests cover empty files,
invalid cells, duplicate IDs, unknown CPT references, and atomic failure.

WASM and Tauri boundary tests verify that both runtimes deserialize the generic
source request and return the same IFCPP structure. Frontend tests cover role
suggestion, manual reassignment, accepted extensions, completeness checks, and
display of grouped errors.

The existing sample project remains an end-to-end import fixture. Its source
files can stay in their current formats; small in-memory fixtures prove all six
role-and-format combinations without duplicating the full sample dataset.

## Delivery order

1. Introduce the format-neutral Rust source and table models.
2. Refactor existing parsers to consume format-neutral tables.
3. Add the missing CSV and XLSX combinations and validation.
4. Update WASM, Tauri, and TypeScript request contracts.
5. Build the React import/open/save workflow on the shared contract.
6. Verify browser import, desktop import, IFCPP download, and desktop save.

