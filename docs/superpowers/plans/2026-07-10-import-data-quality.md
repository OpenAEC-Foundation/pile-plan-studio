# Import Data Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile CPT coordinates and bearing capacities during import, preserving useful incomplete data while rejecting ambiguous or invalid capacity rows.

**Architecture:** A pure Rust reconciliation function validates and normalizes parsed domain rows before project construction. It returns cleaned capacities plus structured summary data; project import converts that summary into IFCPP warnings and React renders the saved provenance after success.

**Tech Stack:** Rust 2021, Serde, WASM/Tauri shared core, React 19, TypeScript.

## Global Constraints

- Do not emit warnings for partially missing pile configurations.
- Keep CPTs without capacities so normal pile-option logic yields `Missing`.
- Ignore capacities for CPTs absent from the coordinate source.
- Collapse exact duplicate capacity keys; select the lowest FRD for conflicting duplicates and warn.
- Treat the capacity key as CPT ID, pile size, and millimetre-scaled tip level.
- Reject pile size zero; allow finite negative and zero FRD values.

---

### Task 1: Reconcile Imported Bearing Capacities

**Files:**
- Modify: `crates/pile-plan-core/src/import/roles.rs`
- Modify: `crates/pile-plan-core/src/import.rs`

**Interfaces:**
- Produces: `reconcile_imported_inputs(load_points, cpts, capacities) -> Result<ImportReconciliation, ImportError>`.
- `ImportReconciliation` contains cleaned capacities, ignored orphan row count/IDs, deduplicated row count, and CPT IDs without capacities.

- [ ] Add failing tests for orphan rows, CPTs without capacities, exact duplicates, lowest-FRD conflict resolution, zero size, finite negative FRD, and no missing-configuration warnings.
- [ ] Run `cargo test -p pile-plan-core import -- --nocapture` and confirm the new tests fail for the intended missing behavior.
- [ ] Implement reconciliation with a sorted capacity key and stable output order.
- [ ] Replace the existing unknown-CPT hard failure in both generic and compatibility import paths.
- [ ] Run `cargo fmt --all --check; cargo test -p pile-plan-core` and expect all tests to pass.

### Task 2: Store and Return Import Warnings

**Files:**
- Modify: `crates/pile-plan-core/src/import.rs`
- Modify: `crates/pile-plan-core/src/project.rs` only if a typed summary is required beyond existing warnings.
- Modify: `crates/pile-plan-core/src/analysis.rs` tests for the CPT-without-capacity `Missing` result.

**Interfaces:**
- Consumes: `ImportReconciliation` from Task 1.
- Produces: deterministic warning strings on the bearing-capacity `ProjectImportLogEntry`.

- [ ] Add a failing project-import assertion for the warning contents and cleaned capacity count.
- [ ] Add a failing analysis test showing that a selected CPT with no capacities makes candidate configurations `Missing`.
- [ ] Generate compact warnings for orphan rows, exact duplicates, and CPTs without capacities.
- [ ] Run `cargo test --workspace` and expect all Rust/WASM tests to pass.
- [ ] Commit the Rust behavior with `git commit -m "feat: reconcile incomplete import sources"`.

### Task 3: Show the Successful Import Summary

**Files:**
- Modify: `apps/pile-plan-studio/src/projectFile.ts`
- Modify: `apps/pile-plan-studio/src-react/components/domain/ProjectImportPanel.tsx`
- Modify: `apps/pile-plan-studio/src-react/App.tsx`
- Create or modify focused TypeScript tests beside the affected models.

**Interfaces:**
- Produces: `ImportSummary` derived from IFCPP inputs and import-log warnings.
- `onImportProject` returns the summary to `ProjectImportPanel` after successful atomic replacement.

- [ ] Add a failing model test for counts and persisted warnings.
- [ ] Implement pure summary extraction without duplicating Rust validation.
- [ ] Render imported counts and warnings in the open import panel; warnings use a non-error visual treatment.
- [ ] Run `npx tsc -p apps/pile-plan-studio/tsconfig.json --noEmit; npm test --prefix apps/pile-plan-studio`.
- [ ] Run `npm run build:react --prefix apps/pile-plan-studio` and inspect the live import panel for errors.
- [ ] Commit with `git commit -m "feat: show import reconciliation summary"`.
