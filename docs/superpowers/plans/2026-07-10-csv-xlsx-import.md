# CSV and XLSX Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept CSV or XLSX for load points, CPTs, and bearing capacities, then expose the shared Rust importer through WASM, Tauri, and the React project workflow.

**Architecture:** Rust converts either physical file format into a format-neutral table and passes that table to one of three fixed-schema role parsers. WASM and Tauri share one serialized import request, while React only assigns file roles, submits bytes, displays errors, and loads or saves IFCPP projects.

**Tech Stack:** Rust 2021, `csv`, `calamine`, Serde, WASM/`wasm-bindgen`, Tauri v2, React 19, TypeScript, Node test runner.

## Global Constraints

- Support `.csv` and `.xlsx`; do not support `.xls` in this milestone.
- Keep the fixed column order documented in `docs/superpowers/specs/2026-07-10-csv-xlsx-import-design.md`.
- File names may suggest a role but never determine or override the assigned role.
- Read the first non-empty XLSX worksheet and ignore empty rows.
- Keep import logic in Rust; do not duplicate parsing or domain validation in React.
- Import is atomic: retain the currently open project when any source fails.
- Preserve compatibility with existing IFCPP files by defaulting newly added provenance fields during deserialization.

---

## File Structure

- Create `crates/pile-plan-core/src/import/table.rs`: format-neutral cells and CSV/XLSX readers.
- Create `crates/pile-plan-core/src/import/roles.rs`: fixed-schema parsers and cross-source validation.
- Modify `crates/pile-plan-core/src/import.rs`: public source/request types and atomic project assembly.
- Modify `crates/pile-plan-core/src/lib.rs`: re-export the new import contract.
- Modify `crates/pile-plan-core/src/project.rs`: backward-compatible IFCPP provenance fields.
- Modify `crates/pile-plan-core/Cargo.toml`: add the `csv` parser dependency.
- Modify `crates/pile-plan-wasm/src/lib.rs`: accept the generic source request.
- Modify `apps/pile-plan-studio/src-tauri/src/main.rs`: add matching import and IFCPP commands.
- Modify `apps/pile-plan-studio/src/coreClient.ts`: one browser/desktop import contract.
- Modify `apps/pile-plan-studio/src/importFiles.ts`: format acceptance and filename-only role suggestions.
- Create `apps/pile-plan-studio/src-react/components/domain/ProjectImportPanel.tsx`: role assignment and import state.
- Create `apps/pile-plan-studio/src-react/components/domain/projectImport.css`: import panel layout.
- Create `apps/pile-plan-studio/src-react/components/domain/projectImportModel.ts`: pure frontend assignment/error helpers.
- Create `apps/pile-plan-studio/src-react/components/domain/projectImportModel.test.ts`: frontend import tests.
- Modify `apps/pile-plan-studio/src-react/components/template/backstage/Backstage.tsx`: host project callbacks and the domain import panel.
- Modify `apps/pile-plan-studio/src-react/App.tsx`: replace project state only after successful import; open and save IFCPP.
- Modify English and Dutch `src-react/i18n/locales/*/backstage.json`: import/open/save labels and errors.

---

### Task 1: Add Format-Neutral Table Readers

**Files:**
- Modify: `crates/pile-plan-core/Cargo.toml`
- Create: `crates/pile-plan-core/src/import/table.rs`
- Modify: `crates/pile-plan-core/src/import.rs`

**Interfaces:**
- Produces: `SourceFormat`, `TableCell`, `SourceTable`, and `read_source_table(file_name, format, bytes)`.
- Consumes: raw source bytes and the explicitly supplied format.

- [ ] **Step 1: Add failing reader tests**

Add tests in `table.rs` proving that CSV quoted fields parse correctly, empty rows disappear, XLSX selects the first non-empty sheet, and empty input returns `ImportError::EmptySource`.

```rust
#[test]
fn csv_reader_preserves_quoted_cells_and_skips_empty_rows() {
    let table = read_source_table(
        "loads.csv",
        SourceFormat::Csv,
        b"1,\"9,450\",4700,79\n\n",
    ).unwrap();
    assert_eq!(table.rows.len(), 1);
    assert_eq!(table.rows[0][1].as_text(), "9,450");
}
```

- [ ] **Step 2: Run the focused Rust test and confirm failure**

Run: `cargo test -p pile-plan-core import::table -- --nocapture`

Expected: FAIL because the table types and reader do not exist.

- [ ] **Step 3: Add the dependency and reader implementation**

Add `csv = "1"` to `pile-plan-core/Cargo.toml`. Define:

```rust
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceFormat { Csv, Xlsx }

#[derive(Clone, Debug, PartialEq)]
pub enum TableCell { Empty, Text(String), Number(f64), Bool(bool) }

#[derive(Clone, Debug, PartialEq)]
pub struct SourceTable {
    pub sheet_name: Option<String>,
    pub rows: Vec<Vec<TableCell>>,
}

pub fn read_source_table(
    file_name: &str,
    format: SourceFormat,
    bytes: &[u8],
) -> Result<SourceTable, ImportError>;
```

Use `csv::ReaderBuilder::new().has_headers(false).flexible(true)` for CSV. For XLSX, iterate `sheet_names()` and return the first worksheet containing a non-empty row.

- [ ] **Step 4: Run formatting and focused tests**

Run: `cargo fmt --all --check; cargo test -p pile-plan-core import::table`

Expected: PASS.

- [ ] **Step 5: Commit the reader boundary**

```bash
git add crates/pile-plan-core/Cargo.toml Cargo.lock crates/pile-plan-core/src/import.rs crates/pile-plan-core/src/import/table.rs
git commit -m "feat: add CSV and XLSX source table readers"
```

---

### Task 2: Parse All Three Roles From Either Format

**Files:**
- Create: `crates/pile-plan-core/src/import/roles.rs`
- Modify: `crates/pile-plan-core/src/import.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**
- Consumes: `SourceTable` from Task 1.
- Produces: `parse_load_points`, `parse_cpts`, `parse_bearing_capacities`, and `validate_imported_inputs`.

- [ ] **Step 1: Add equivalent-format role tests**

For each role, construct a CSV table and an XLSX-derived table containing the same values and assert equal domain objects. Also add focused failures for a missing column, a non-finite value, duplicate load point/CPT IDs, and an unknown bearing-capacity CPT reference.

```rust
#[test]
fn load_points_are_equal_from_text_and_numeric_cells() {
    let text = table(vec![vec!["15", "9450", "4700", "79"]]);
    let numeric = numeric_table(vec![vec![15.0, 9450.0, 4700.0, 79.0]]);
    assert_eq!(parse_load_points(&text).unwrap(), parse_load_points(&numeric).unwrap());
}
```

- [ ] **Step 2: Run tests and confirm role parsing fails**

Run: `cargo test -p pile-plan-core import::roles -- --nocapture`

Expected: FAIL because the role parsers do not exist.

- [ ] **Step 3: Implement fixed-schema role parsers**

Implement these exact signatures:

```rust
pub fn parse_load_points(table: &SourceTable) -> Result<Vec<ProjectLoadPoint>, ImportError>;
pub fn parse_cpts(table: &SourceTable) -> Result<Vec<ProjectCpt>, ImportError>;
pub fn parse_bearing_capacities(
    table: &SourceTable,
) -> Result<Vec<ProjectBearingCapacity>, ImportError>;
pub fn validate_imported_inputs(
    load_points: &[ProjectLoadPoint],
    cpts: &[ProjectCpt],
    capacities: &[ProjectBearingCapacity],
) -> Result<(), ImportError>;
```

Keep header handling inside each parser. Accept a first row as a header only when its required ID cell is non-numeric; reject non-numeric values in later rows. Include source role, one-based row, and one-based column in structured errors.

- [ ] **Step 4: Replace old format-specific public parsers**

Retain `import_load_points_csv`, `import_cpts_xlsx`, and `import_bearing_capacities_xlsx` only as compatibility wrappers around `read_source_table` plus the role parser until all callers migrate.

- [ ] **Step 5: Run the full core suite**

Run: `cargo fmt --all --check; cargo test -p pile-plan-core`

Expected: PASS, including the existing sample-project import test.

- [ ] **Step 6: Commit role parsing**

```bash
git add crates/pile-plan-core/src/import.rs crates/pile-plan-core/src/import/roles.rs crates/pile-plan-core/src/lib.rs
git commit -m "feat: parse every import role from CSV or XLSX"
```

---

### Task 3: Build the Atomic Generic Project Import Contract

**Files:**
- Modify: `crates/pile-plan-core/src/import.rs`
- Modify: `crates/pile-plan-core/src/project.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**
- Produces: `ImportSource`, `ImportRole`, and `import_project_from_sources(project_name, sources)`.
- Consumes: exactly one source for each import role.

- [ ] **Step 1: Add failing project and compatibility tests**

Test mixed formats, missing/duplicate roles, atomic failure, provenance, and deserialization of an older IFCPP import-log entry without the new fields.

```rust
#[test]
fn imports_mixed_formats_and_records_provenance() {
    let project = import_project_from_sources("Mixed", sources()).unwrap();
    assert_eq!(project.import_log[0].source_format, Some(SourceFormat::Csv));
    assert_eq!(project.import_log[0].source_role, Some(ImportRole::LoadPoints));
    assert_eq!(project.import_log[0].schema_version.as_deref(), Some("fixed-1"));
}
```

- [ ] **Step 2: Run core tests and confirm failure**

Run: `cargo test -p pile-plan-core -- --nocapture`

Expected: FAIL because the generic source contract and provenance fields are absent.

- [ ] **Step 3: Implement the serialized source types**

```rust
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImportRole { LoadPoints, Cpts, BearingCapacities }

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ImportSource {
    pub role: ImportRole,
    pub file_name: String,
    pub format: SourceFormat,
    pub bytes: Vec<u8>,
}
```

Change project assembly to index all sources by role, reject missing or repeated roles, parse all three before creating `PilePlanProject`, then run `validate_imported_inputs`.

- [ ] **Step 4: Extend provenance without breaking old IFCPP files**

Add optional/defaulted fields to `ProjectImportLogEntry`:

```rust
#[serde(default)] pub source_role: Option<ImportRole>,
#[serde(default)] pub source_format: Option<SourceFormat>,
#[serde(default)] pub schema_version: Option<String>,
```

Record the actual file name, role, format, selected sheet, `fixed-1`, and warnings for each successful source.

- [ ] **Step 5: Run core and IFCPP tests**

Run: `cargo fmt --all --check; cargo test -p pile-plan-core`

Expected: PASS; existing `sample_project.ifcpp` still loads.

- [ ] **Step 6: Commit the project contract**

```bash
git add crates/pile-plan-core/src/import.rs crates/pile-plan-core/src/project.rs crates/pile-plan-core/src/lib.rs sample_project/sample_project.ifcpp
git commit -m "feat: add atomic generic project import contract"
```

Only stage `sample_project.ifcpp` if serialization intentionally updates it; do not rewrite it merely for formatting.

---

### Task 4: Share the Contract Through WASM, Tauri, and TypeScript

**Files:**
- Modify: `crates/pile-plan-wasm/src/lib.rs`
- Modify: `apps/pile-plan-studio/src-tauri/src/main.rs`
- Modify: `apps/pile-plan-studio/src/coreClient.ts`
- Create: `apps/pile-plan-studio/src/coreImportContract.test.ts`

**Interfaces:**
- Consumes: `ImportSource[]` from Task 3.
- Produces: `importProjectFromFilesCore({ projectName, sources }): Promise<IfcppProject>` for browser and desktop.

- [ ] **Step 1: Add failing boundary tests**

Test Rust request deserialization for mixed formats and TypeScript serialization of byte arrays for both runtime paths.

```ts
assert.deepEqual(toCoreImportSource(file), {
  role: "load-points",
  file_name: "loads.xlsx",
  format: "xlsx",
  bytes: new Uint8Array([1, 2, 3]),
});
```

- [ ] **Step 2: Run boundary tests and confirm failure**

Run: `cargo test -p pile-plan-wasm; npm test -- --test-name-pattern="core import contract"`

Expected: FAIL because the generic request is not wired.

- [ ] **Step 3: Replace the WASM request fields**

Use one request in WASM:

```rust
#[derive(Debug, Deserialize)]
pub struct ImportProjectRequest {
    pub project_name: String,
    pub sources: Vec<ImportSource>,
}
```

Pass it directly to the shared core importer.

- [ ] **Step 4: Add matching Tauri commands**

Add `import_project_from_files`, `read_ifcpp_project`, and `write_ifcpp_project` commands to `src-tauri/src/main.rs`. Return `Result<_, String>` and register all three in `tauri::generate_handler!`.

- [ ] **Step 5: Update the TypeScript client**

Define:

```ts
export type ImportSourceInput = {
  role: ImportFileRole;
  fileName: string;
  format: "csv" | "xlsx";
  bytes: Uint8Array;
};

export async function importProjectFromFilesCore(input: {
  projectName: string;
  sources: ImportSourceInput[];
}): Promise<IfcppProject>;
```

Use WASM in the browser and `invoke` in Tauri. Make `readIfcppProjectCore` and `writeIfcppProjectCore` follow the same runtime selection.

- [ ] **Step 6: Verify all boundaries**

Run: `cargo fmt --all --check; cargo test --workspace; npx tsc -p apps/pile-plan-studio/tsconfig.json --noEmit; npm test --prefix apps/pile-plan-studio`

Expected: PASS.

- [ ] **Step 7: Commit runtime integration**

```bash
git add crates/pile-plan-wasm/src/lib.rs apps/pile-plan-studio/src-tauri/src/main.rs apps/pile-plan-studio/src/coreClient.ts apps/pile-plan-studio/src/coreImportContract.test.ts
git commit -m "feat: expose generic project import to web and desktop"
```

---

### Task 5: Make Frontend Assignment Format-Agnostic

**Files:**
- Modify: `apps/pile-plan-studio/src/importFiles.ts`
- Modify: `apps/pile-plan-studio/src/importFiles.test.ts`
- Create: `apps/pile-plan-studio/src-react/components/domain/projectImportModel.ts`
- Create: `apps/pile-plan-studio/src-react/components/domain/projectImportModel.test.ts`

**Interfaces:**
- Produces: accepted-format checks, filename-only role suggestions, complete assignment state, and grouped error presentation.
- Consumes: browser `File` objects without parsing their contents.

- [ ] **Step 1: Add failing assignment tests**

Cover CSV and XLSX for every recognizable role, unknown names returning no suggestion, manual assignments surviving subsequent suggestions, duplicate-file prevention, and completeness requiring exactly three distinct files.

```ts
assert.equal(inferImportFileRole("sonderingen.csv"), "cpts");
assert.equal(inferImportFileRole("draagvermogens.csv"), "bearing-capacities");
assert.equal(inferImportFileRole("belastinglocaties.xlsx"), "load-points");
assert.equal(inferImportFileRole("anything.csv"), null);
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test --prefix apps/pile-plan-studio -- --test-name-pattern="import file assignments|project import model"`

Expected: FAIL because CSV currently implies load points and the React model is absent.

- [ ] **Step 3: Implement extension and suggestion helpers**

Add `getImportFileFormat(name): "csv" | "xlsx" | null`. Infer role from semantic filename fragments first, independently of extension, and accept the result only when the extension is supported.

- [ ] **Step 4: Implement the pure React import model**

Expose functions to assign/unassign roles, detect one file in multiple roles, convert complete assignments into `ImportSourceInput[]`, and normalize thrown Rust/WASM errors into `{ source?: string; message: string }[]`.

- [ ] **Step 5: Run frontend tests**

Run: `npx tsc -p apps/pile-plan-studio/tsconfig.json --noEmit; npm test --prefix apps/pile-plan-studio`

Expected: PASS.

- [ ] **Step 6: Commit frontend import state**

```bash
git add apps/pile-plan-studio/src/importFiles.ts apps/pile-plan-studio/src/importFiles.test.ts apps/pile-plan-studio/src-react/components/domain/projectImportModel.ts apps/pile-plan-studio/src-react/components/domain/projectImportModel.test.ts
git commit -m "feat: support CSV and XLSX import assignments"
```

---

### Task 6: Build the React Import, Open, and Save Workflow

**Files:**
- Create: `apps/pile-plan-studio/src-react/components/domain/ProjectImportPanel.tsx`
- Create: `apps/pile-plan-studio/src-react/components/domain/projectImport.css`
- Modify: `apps/pile-plan-studio/src-react/components/template/backstage/Backstage.tsx`
- Modify: `apps/pile-plan-studio/src-react/App.tsx`
- Modify: `apps/pile-plan-studio/src-react/domain/projectState.ts`
- Modify: `apps/pile-plan-studio/src-react/i18n/locales/en/backstage.json`
- Modify: `apps/pile-plan-studio/src-react/i18n/locales/nl/backstage.json`
- Create: `apps/pile-plan-studio/src-react/components/domain/ProjectImportPanel.test.ts`

**Interfaces:**
- Consumes: Task 4 core client and Task 5 assignment model.
- Produces: `createProjectStateFromIfcpp(project: IfcppProject): ProjectState`, atomic project replacement after import/open, IFCPP browser download, and desktop save.

- [ ] **Step 1: Add failing workflow tests**

Test that all three rows accept `.csv,.xlsx`, a bulk selection suggests assignments, roles remain editable, Import is disabled until complete, validation issues stay visible, and `onProjectLoaded` fires only after the importer resolves.

- [ ] **Step 2: Run focused React tests and confirm failure**

Run: `npm test --prefix apps/pile-plan-studio -- --test-name-pattern="ProjectImportPanel"`

Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Build the import panel**

Render three compact source rows with file name, role selector, replace/remove action, and status. Add one “Choose files” action accepting one or three files, a project-name input, grouped error output, and one Import command. Avoid nested cards and keep all parsing outside React.

- [ ] **Step 4: Connect Backstage callbacks**

Replace the template `ImportPanel` with `ProjectImportPanel`. Extend `BackstageProps` with:

```ts
onImportProject: (projectName: string, sources: ImportSourceInput[]) => Promise<void>;
onOpenProject: (file: File | string) => Promise<void>;
onSaveProject: (saveAs: boolean) => Promise<void>;
```

In browser mode use hidden file inputs and downloads. In Tauri use dialog/file commands, retaining the selected path for Save and prompting for Save As.

- [ ] **Step 5: Replace state atomically in App**

Extract the existing initialization body in `projectState.ts` into
`createProjectStateFromIfcpp(project: IfcppProject): ProjectState`; keep
`createInitialProjectState(text: string)` as a parsing wrapper around it.
Import/open into a temporary `IfcppProject`, apply saved default cost settings
only when the project lacks costs, and call `setProjectState` only after all
conversion succeeds. Trigger a full analysis revision for the new project.

- [ ] **Step 6: Update explorer and translations**

Show imported source file names, formats, row counts, and snapshot status from IFCPP provenance. Add concise English and Dutch labels for role assignment, supported formats, importing, validation failures, Open, Save, and Download IFCPP.

- [ ] **Step 7: Run React verification**

Run: `npx tsc -p apps/pile-plan-studio/tsconfig.json --noEmit; npm test --prefix apps/pile-plan-studio; npm run build:react --prefix apps/pile-plan-studio`

Expected: PASS.

- [ ] **Step 8: Commit the project workflow**

```bash
git add apps/pile-plan-studio/src-react apps/pile-plan-studio/src/coreClient.ts
git commit -m "feat: add React project import and IFCPP workflow"
```

---

### Task 7: End-to-End Browser and Desktop Verification

**Files:**
- Modify only files required by defects found during verification.

**Interfaces:**
- Consumes: the complete import workflow.
- Produces: a verified browser build and Tauri desktop build.

- [ ] **Step 1: Run the complete automated suite**

Run: `cargo fmt --all --check; cargo test --workspace; npx tsc -p apps/pile-plan-studio/tsconfig.json --noEmit; npm test --prefix apps/pile-plan-studio; npm run build:react --prefix apps/pile-plan-studio`

Expected: all commands exit 0.

- [ ] **Step 2: Verify all six browser combinations**

In the live React preview, import small fixtures covering CSV and XLSX for each role, including one mixed-format project. Confirm the project name, 3 source entries, viewer markers, CPT FRD rows, and pile options appear. Download IFCPP, reopen it, and confirm the same counts and source metadata.

- [ ] **Step 3: Verify failed import is atomic**

Open the sample project, attempt an import with an unknown CPT reference, and confirm grouped validation appears while the sample project remains visible and selectable.

- [ ] **Step 4: Verify the desktop workflow**

Run: `npm run tauri build --prefix apps/pile-plan-studio`

Expected: desktop build succeeds. Open the executable, import mixed CSV/XLSX sources, Save As `.ifcpp`, edit a pile choice, Save, close, reopen, and confirm the choice persists.

- [ ] **Step 5: Commit verification fixes**

If verification required changes, stage the explicit paths reported by
`git status --short`, for example:

```bash
git add apps/pile-plan-studio/src-react/App.tsx apps/pile-plan-studio/src-react/components/domain/ProjectImportPanel.tsx
git commit -m "fix: complete project import workflow verification"
```

If no changes were needed, do not create an empty commit.
