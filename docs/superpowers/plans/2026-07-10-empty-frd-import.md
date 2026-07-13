# Empty FRD Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let project imports skip bearing-capacity rows with an empty FRD, persist an actionable warning, and let the omitted capacity produce existing `Missing` behavior.

**Architecture:** Add a diagnostic-bearing result to the Rust bearing-capacity parser while retaining the existing list-only compatibility function. Feed skipped-row diagnostics into the existing bearing-capacity import log; keep IFCPP capacities non-nullable and TypeScript free of import calculations.

**Tech Stack:** Rust, WASM, Tauri, React/TypeScript, Rust unit tests, Node tests.

## Global Constraints

- Only an actually empty FRD is recoverable.
- Empty CPT ID, tip, or size and non-empty invalid FRD values remain errors.
- At most ten physical row numbers appear in one warning.
- Import remains atomic for all hard errors.
- Omitted rows are represented through absent capacities, not nullable FRD values.

---

### Task 1: Parse Empty FRDs as Diagnostics

**Files:**
- Modify: `crates/pile-plan-core/src/import/roles.rs`
- Modify: `crates/pile-plan-core/src/import.rs`

**Interfaces:**
- Produces: `BearingCapacityParseResult { bearing_capacities, empty_frd_rows }`.
- Produces: `parse_bearing_capacities_with_diagnostics(&SourceTable) -> Result<BearingCapacityParseResult, ImportError>`.
- Preserves: `parse_bearing_capacities(&SourceTable) -> Result<Vec<ProjectBearingCapacity>, ImportError>`.

- [ ] **Step 1: Write failing tests**

Test that an empty FRD row is skipped, its physical row is recorded, `abc` remains an error, and a valid row for the same key remains available.

- [ ] **Step 2: Verify RED**

Run: `cargo test -p pile-plan-core import::tests::empty_frd -- --nocapture`

Expected: the empty FRD still returns `ImportError::InvalidValue`.

- [ ] **Step 3: Implement the diagnostic parser**

Before calling `cell_f64` for FRD, inspect the source cell with a helper that treats `TableCell::Empty` and whitespace-only text as empty. Push `row.number` and continue. Parse every non-empty value normally.

- [ ] **Step 4: Verify GREEN**

Run: `cargo test -p pile-plan-core`

Expected: all core tests pass.

- [ ] **Step 5: Commit**

```powershell
git add crates/pile-plan-core/src/import.rs crates/pile-plan-core/src/import/roles.rs
git commit -m "feat: skip empty FRD capacity rows"
```

---

### Task 2: Persist Bounded Import Warnings

**Files:**
- Modify: `crates/pile-plan-core/src/import.rs`
- Modify: `crates/pile-plan-core/src/import/roles.rs`
- Modify: `apps/pile-plan-studio/src/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm`

**Interfaces:**
- Consumes: `BearingCapacityParseResult` from Task 1.
- Produces: one warning containing source, optional worksheet, total count, up to ten rows, and omitted-row `Missing` meaning.

- [ ] **Step 1: Write failing warning tests**

Test generic CSV and XLSX-style imports, eleven omitted rows, warning persistence, and that the imported capacity list excludes omitted rows.

- [ ] **Step 2: Verify RED**

Run: `cargo test -p pile-plan-core import::tests::empty_frd -- --nocapture`

Expected: no persisted warning exists yet.

- [ ] **Step 3: Add warning composition**

Build a warning such as:

```text
Ignored 3 bearing-capacity rows with an empty FRD in capacities.xlsx > Sheet1 (rows 84, 91, 105). These configurations are treated as Missing.
```

For more than ten rows append `; and N more` inside the parentheses. Append this warning before reconciliation warnings.

- [ ] **Step 4: Run complete verification**

Run:

```powershell
cargo test --workspace
.\apps\pile-plan-studio\node_modules\.bin\tsc.cmd -p apps\pile-plan-studio\tsconfig.json --noEmit
npm test --prefix apps/pile-plan-studio
npm run build:react --prefix apps/pile-plan-studio
```

Expected: all tests and the production build pass.

- [ ] **Step 5: Commit**

```powershell
git add crates/pile-plan-core/src/import.rs crates/pile-plan-core/src/import/roles.rs apps/pile-plan-studio/src/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm
git commit -m "feat: warn about empty FRD rows"
```
