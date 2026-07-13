# Batched Project Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Always start analysis for a newly imported project and reduce large-project startup time by returning pile options, selected CPTs, and CPT FRD rows through one indexed Rust request.

**Architecture:** Introduce a serializable batched analysis result in `pile-plan-core`, with one configuration list and capacity index shared across all requested load points. Expose this through identical WASM/Tauri contracts, then replace the React fan-out calls with one effect keyed by analysis-request object identity.

**Tech Stack:** Rust, serde, WASM, Tauri, React, TypeScript, Node test runner.

## Global Constraints

- Domain calculations remain in Rust.
- Full initialization returns all load-point results and all CPT FRD rows.
- Partial recalculation returns only requested load points and may omit FRD rows.
- A newly created revision-0 project must trigger analysis.
- Unrelated state changes must not retrigger analysis.
- Analysis errors must be visible instead of leaving permanent loading text.

---

### Task 1: Indexed Batched Rust Analysis

**Files:**
- Modify: `crates/pile-plan-core/src/analysis.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**
- Produces: `ProjectAnalysisResult { pile_options_by_load_point, selected_cpts_by_load_point, cpt_frd_rows_by_cpt_id }`.
- Produces: `build_project_analysis(load_points, cpts, capacities, settings_fn, manual_ids, include_cpt_frd_rows)`.

- [ ] Write failing tests proving full and partial batched results match existing focused functions.
- [ ] Run `cargo test -p pile-plan-core project_analysis -- --nocapture` and verify RED.
- [ ] Extract an `AnalysisIndex` containing unique configurations, capacity lookup, and grouped CPT rows.
- [ ] Calculate selected CPTs and options in one load-point loop using the shared index.
- [ ] Keep existing focused public functions as compatibility wrappers.
- [ ] Run `cargo test -p pile-plan-core` and verify GREEN.
- [ ] Commit with `git commit -m "feat: add indexed project analysis"`.

---

### Task 2: Unified WASM and Tauri Contract

**Files:**
- Modify: `crates/pile-plan-wasm/src/lib.rs`
- Modify: `apps/pile-plan-studio/src-tauri/src/lib.rs`
- Modify: `apps/pile-plan-studio/src/coreClient.ts`
- Modify: `apps/pile-plan-studio/src/coreImportContract.ts` or the nearest existing shared contract module if required.

**Interfaces:**
- Produces: `calculate_project_analysis` in WASM and Tauri.
- Produces: `calculateProjectAnalysisCore(input) -> Promise<ProjectAnalysisResult>` in TypeScript.

- [ ] Write failing Rust contract tests and TypeScript serialization tests for full and partial requests.
- [ ] Verify the tests fail because the batched command does not exist.
- [ ] Add one shared request shape with `include_cpt_frd_rows` and existing settings/manual maps.
- [ ] Convert Rust map results to frontend numeric-keyed `Map` values once at the client boundary.
- [ ] Run `cargo test --workspace`, TypeScript checking, and frontend tests.
- [ ] Commit with `git commit -m "feat: expose batched project analysis"`.

---

### Task 3: React Lifecycle and Error State

**Files:**
- Modify: `apps/pile-plan-studio/src-react/App.tsx`
- Modify: `apps/pile-plan-studio/src-react/domain/projectState.ts`
- Modify: `apps/pile-plan-studio/src-react/components/domain/RightPanel.tsx`
- Modify or create focused tests under `apps/pile-plan-studio/src-react`.
- Modify: `apps/pile-plan-studio/src/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm`

**Interfaces:**
- Consumes: `calculateProjectAnalysisCore` from Task 2.
- Produces: `analysisError: string | null` in project state.

- [ ] Write failing tests proving two distinct revision-0 request objects both trigger analysis and unchanged request identity does not.
- [ ] Write a failing view test for visible analysis errors.
- [ ] Replace the three-way `Promise.all` fan-out with one batched call.
- [ ] Depend on `projectState.analysisRequest` object identity, not only `.revision`.
- [ ] Request CPT FRD rows only when the current map is empty; merge partial load-point results and preserve existing FRD rows when omitted.
- [ ] Set and clear `analysisError`; show it in the right panel when options are unavailable.
- [ ] Run `cargo test --workspace`, TypeScript checking, `npm test`, and `npm run build:react`.
- [ ] Re-run the non-committed LIS WASM benchmark and compare with the 11.2-second baseline.
- [ ] Commit with `git commit -m "fix: batch React project analysis"`.
