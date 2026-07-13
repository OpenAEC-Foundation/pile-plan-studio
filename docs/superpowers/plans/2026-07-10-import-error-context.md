# Import Error Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every actionable import failure identify its source file and, where applicable, worksheet, row, named column, and record identifier.

**Architecture:** Keep source metadata and physical row numbers in `SourceTable`, then let the Rust role parsers create structured `ImportError` values carrying a `SourceLocation`. Format user-facing English messages only in `ImportError::Display`, so WASM, Tauri, and React receive one consistent message without duplicating validation logic.

**Tech Stack:** Rust, calamine, csv, WASM, Tauri, React/TypeScript, Rust unit tests and Node test runner.

## Global Constraints

- CSV and XLSX imports for load points, CPT coordinates, and bearing capacities are covered.
- Import remains atomic and stops at the first error.
- Empty values are displayed as `value is empty`, never as `''`.
- User-facing import messages remain English.
- Reconciliation warnings remain successful-import warnings.
- TypeScript must not duplicate Rust import validation or message formatting.

---

### Task 1: Preserve Source Locations in Parsed Tables

**Files:**
- Modify: `crates/pile-plan-core/src/import/table.rs`
- Modify: `crates/pile-plan-core/src/import.rs`

**Interfaces:**
- Produces: `SourceLocation { file_name, sheet_name, row, column, column_name }`
- Produces: `SourceRow { number, cells }`
- Produces: `SourceTable::location(row, column, column_name) -> SourceLocation`
- Consumes: existing `read_source_table(file_name, format, bytes)` API.

- [ ] **Step 1: Write failing tests for CSV and XLSX source metadata**

Add tests proving the table retains the filename, XLSX worksheet, and physical row number after blank rows. Use a small in-memory XLSX fixture following the existing calamine-compatible test-fixture pattern, and assert:

```rust
assert_eq!(csv.file_name, "loads.csv");
assert_eq!(csv.rows[1].number, 3);
assert_eq!(xlsx.file_name, "capacities.xlsx");
assert_eq!(xlsx.sheet_name.as_deref(), Some("Sheet1"));
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cargo test -p pile-plan-core import::tests::source_table -- --nocapture`

Expected: compilation failure because `SourceTable` has no `file_name` and rows have no `number`.

- [ ] **Step 3: Add structured source metadata**

Define the source types in `table.rs`:

```rust
#[derive(Clone, Debug, PartialEq)]
pub struct SourceLocation {
    pub file_name: String,
    pub sheet_name: Option<String>,
    pub row: Option<usize>,
    pub column: Option<usize>,
    pub column_name: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SourceRow {
    pub number: usize,
    pub cells: Vec<TableCell>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SourceTable {
    pub file_name: String,
    pub sheet_name: Option<String>,
    pub rows: Vec<SourceRow>,
}
```

Enumerate CSV records and Excel range rows before filtering empty rows, using `index + 1` as the physical source row. Add:

```rust
impl SourceTable {
    pub fn location(
        &self,
        row: Option<usize>,
        column: Option<usize>,
        column_name: Option<&'static str>,
    ) -> SourceLocation {
        SourceLocation {
            file_name: self.file_name.clone(),
            sheet_name: self.sheet_name.clone(),
            row,
            column,
            column_name,
        }
    }
}
```

Update test helpers and exports in `import.rs` to use `SourceRow` and export `SourceLocation`.

- [ ] **Step 4: Run focused and complete core tests**

Run: `cargo test -p pile-plan-core`

Expected: all core tests pass.

- [ ] **Step 5: Commit**

```powershell
git add crates/pile-plan-core/src/import.rs crates/pile-plan-core/src/import/table.rs
git commit -m "refactor: preserve import source locations"
```

---

### Task 2: Attach Context to Cell and Row Errors

**Files:**
- Modify: `crates/pile-plan-core/src/import.rs`
- Modify: `crates/pile-plan-core/src/import/roles.rs`

**Interfaces:**
- Consumes: `SourceTable`, `SourceRow`, and `SourceLocation` from Task 1.
- Produces: `ImportError::InvalidValue { location, value, expected }`.
- Produces: `ImportError::MissingCell { location }` and `ImportError::InvalidRow { location, actual_columns, expected_columns, role }`.

- [ ] **Step 1: Write failing parser tests for actionable messages**

Add separate tests for an empty FRD, invalid load-point coordinate, missing cell, and short row. Assert complete messages, including:

```rust
assert_eq!(
    error.to_string(),
    "capacities.csv, row 2, FRD (column 4): value is empty; expected a number."
);
```

For an XLSX-backed `SourceTable`, assert:

```rust
assert_eq!(
    error.to_string(),
    "capacities.xlsx > Sheet1, row 84, FRD (column 4): invalid value 'abc'; expected a number."
);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cargo test -p pile-plan-core import::tests::reports_ -- --nocapture`

Expected: assertions fail because current messages contain neither source nor cell location.

- [ ] **Step 3: Replace contextless parser errors**

Change parsing helpers to accept the table, source row, and column definition:

```rust
struct Column {
    number: usize,
    name: &'static str,
}

fn cell_f64(
    table: &SourceTable,
    row: &SourceRow,
    column: Column,
) -> Result<f64, ImportError>;

fn cell_u32(
    table: &SourceTable,
    row: &SourceRow,
    column: Column,
) -> Result<u32, ImportError>;
```

Use fixed role-specific names: load points `ID`, `X`, `Y`, `FED`; CPTs `ID`, `X`, `Y`; bearing capacities `CPT ID`, `Tip`, `Size`, `FRD`.

Replace `ImportError::MissingCell` and `InvalidValue` with variants containing `SourceLocation`. Format locations centrally:

```rust
fn write_location(formatter: &mut fmt::Formatter<'_>, location: &SourceLocation) -> fmt::Result {
    write!(formatter, "{}", location.file_name)?;
    if let Some(sheet) = &location.sheet_name {
        write!(formatter, " > {sheet}")?;
    }
    if let Some(row) = location.row {
        write!(formatter, ", row {row}")?;
    }
    if let Some(name) = location.column_name {
        write!(formatter, ", {name}")?;
    }
    if let Some(column) = location.column {
        write!(formatter, " (column {column})")?;
    }
    Ok(())
}
```

Render empty values separately and end all contextual messages with a period.

- [ ] **Step 4: Run core tests and verify GREEN**

Run: `cargo test -p pile-plan-core`

Expected: all core tests pass, including exact message assertions.

- [ ] **Step 5: Commit**

```powershell
git add crates/pile-plan-core/src/import.rs crates/pile-plan-core/src/import/roles.rs
git commit -m "feat: report import cell locations"
```

---

### Task 3: Improve File-Level and Cross-Row Validation Errors

**Files:**
- Modify: `crates/pile-plan-core/src/import.rs`
- Modify: `crates/pile-plan-core/src/import/roles.rs`
- Modify: `crates/pile-plan-core/src/import/table.rs`
- Test: `apps/pile-plan-studio/src-react/components/domain/ProjectImportPanel.test.tsx` if an existing component-test harness supports this component; otherwise use the existing non-DOM import error propagation test.

**Interfaces:**
- Consumes: structured source metadata from Tasks 1 and 2.
- Produces: contextual duplicate-ID, capacity-validation, malformed-file, worksheet, and source-assignment messages.
- Preserves: `onImportProject` rejection messages are displayed unchanged by `ProjectImportPanel`.

- [ ] **Step 1: Write failing tests for remaining error classes**

Add exact-message tests for:

```text
loads.csv, row 7, ID (column 1): duplicate load point ID 42; first defined at row 3.
capacities.xlsx > Sheet1, row 10, Size (column 3): value must be greater than zero.
broken.csv: invalid CSV data at row 4: <parser detail>.
broken.xlsx: invalid Excel workbook: <parser detail>.
empty.xlsx: workbook has no readable worksheet.
Missing import source for bearing capacities.
Multiple import sources assigned to CPTs: first.csv, second.xlsx.
```

Test message prefixes for third-party parser details whose exact wording can vary by dependency version.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cargo test -p pile-plan-core import::tests::reports_ -- --nocapture`

Expected: failures show current contextless validation and file-parser messages.

- [ ] **Step 3: Preserve rows through validation and format file errors**

Keep parsed domain records paired with source rows until validation completes, or build ID-to-location maps during parsing. Change duplicate validation to retain the first location:

```rust
let mut seen: HashMap<u32, SourceLocation> = HashMap::new();
if let Some(first) = seen.get(&id) {
    return Err(ImportError::DuplicateId {
        location: current,
        first_location: first.clone(),
        label,
        id,
    });
}
```

Validate pile size and finite FRD while parsing each capacity row, where its source location is still available. Prefix CSV and Excel reader errors with `file_name`. Replace debug-formatted import roles with user-facing labels from:

```rust
impl ImportRole {
    fn label(self) -> &'static str {
        match self {
            Self::LoadPoints => "load points",
            Self::Cpts => "CPTs",
            Self::BearingCapacities => "bearing capacities",
        }
    }
}
```

Include both filenames when duplicate role assignments exist.

- [ ] **Step 4: Verify Rust, WASM, and frontend behavior**

Run:

```powershell
cargo test --workspace
.\apps\pile-plan-studio\node_modules\.bin\tsc.cmd -p apps\pile-plan-studio\tsconfig.json --noEmit
npm test --prefix apps/pile-plan-studio
```

Expected: all Rust and frontend tests pass, with the import panel still displaying the core error string unchanged.

- [ ] **Step 5: Build the React/WASM application**

Run: `npm run build:react --prefix apps/pile-plan-studio`

Expected: Vite production build succeeds; the existing large-chunk warning is acceptable.

- [ ] **Step 6: Commit**

```powershell
git add crates/pile-plan-core/src/import.rs crates/pile-plan-core/src/import/roles.rs crates/pile-plan-core/src/import/table.rs apps/pile-plan-studio
git commit -m "feat: make import errors actionable"
```

