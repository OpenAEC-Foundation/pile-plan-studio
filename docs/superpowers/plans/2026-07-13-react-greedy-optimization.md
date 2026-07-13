# React Greedy Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the existing greedy optimization workflow into the React/OpenAEC frontend using the existing Rust/WASM core.

**Architecture:** Add a pure optimization panel model for target selection, limit clamping, request preparation, and result application. Add an Optimization right-panel component and route both panel and ribbon commands through one async handler in `App.tsx`. Keep Rust as the optimization source of truth.

**Tech Stack:** React 19, TypeScript, Rust, WASM, Tauri v2, Node test runner.

## Global Constraints

- Do not add a new optimization algorithm.
- Legend toggles are the only enabled size/tip configuration source.
- Use simple numeric inputs and simple clamping; do not port slider auto-mode behaviour.
- Preserve choices outside the target scope.
- Do not change pile choices when optimization fails.

---

### Task 1: Pure React optimization model

**Files:**
- Create: `apps/pile-plan-studio/src-react/components/domain/optimizationPanelModel.ts`
- Create: `apps/pile-plan-studio/src-react/components/domain/optimizationPanelModel.test.ts`

**Interfaces:**
- Produce `OptimizationPanelSettings`, `clampOptimizationPanelSettings`, `getOptimizationTargetIds`, `buildOptimizationBaselineOptions`, and `applyOptimizationChoices`.
- Consume existing `buildGreedyOptimizationSettings`, `summarizeOptimizationRun`, `deriveActivePileConfigurations`, and project option types.

- [ ] Write failing tests for simple clamping, all/selected targets, whole-plan baselines, omitted target clearing, unchanged non-targets, summary counts, and active legend cleanup.
- [ ] Run `node --test apps/pile-plan-studio/src-react/components/domain/optimizationPanelModel.test.ts` and verify failure because the model is absent.
- [ ] Implement the smallest pure functions satisfying those tests.
- [ ] Re-run the focused tests and verify all pass.
- [ ] Commit with `feat: add React optimization model`.

### Task 2: Optimization panel and fixed tab

**Files:**
- Create: `apps/pile-plan-studio/src-react/components/domain/OptimizationPanel.tsx`
- Modify: `apps/pile-plan-studio/src-react/components/domain/RightPanel.tsx`
- Modify: `apps/pile-plan-studio/src-react/components/domain/rightPanel.css`
- Modify: `apps/pile-plan-studio/src/selectionState.ts`
- Test: `apps/pile-plan-studio/src-react/components/domain/RightPanel.test.ts`

**Interfaces:**
- Extend `RightPanel` props with an optimization command callback and optimization run state.
- Add `optimization-settings` as a permanent fifth panel tab.
- Panel emits settings changes through `onStateChange` and starts runs through `onRunOptimization`.

- [ ] Write failing source tests for the fifth tab, explanation, scopes, three numeric inputs, Run command, disabled state, summary, and error display.
- [ ] Run the focused test and verify RED.
- [ ] Implement the panel, fixed tab, and restrained OpenAEC-aligned CSS.
- [ ] Run focused and full frontend tests and verify GREEN.
- [ ] Commit with `feat: add React optimization panel`.

### Task 3: Async command and ribbon integration

**Files:**
- Modify: `apps/pile-plan-studio/src-react/App.tsx`
- Modify: `apps/pile-plan-studio/src-react/components/template/ribbon/Ribbon.tsx`
- Test: `apps/pile-plan-studio/src-react/AppStartup.test.ts`
- Test: `apps/pile-plan-studio/src-react/components/template/ribbon/Ribbon.test.ts`

**Interfaces:**
- `App.tsx` produces `runGreedyOptimization` using `greedyOptimizeCore`.
- Ribbon receives `onOpenOptimizationSettings`, `onRunOptimization`, and `optimizationDisabled`.
- Successful results atomically update choices, active legend sets, settings, and summary; failures only update error state.

- [ ] Write failing tests for enabled ribbon callbacks and one guarded Rust/WASM optimizer call path.
- [ ] Run focused tests and verify RED.
- [ ] Implement the shared async command and wire panel/ribbon callbacks.
- [ ] Run focused and full frontend tests and verify GREEN.
- [ ] Commit with `feat: connect React greedy optimization`.

### Task 4: Verification

**Files:**
- Verify only.

- [ ] Run local TypeScript with `apps\pile-plan-studio\node_modules\.bin\tsc.cmd --noEmit -p apps\pile-plan-studio\tsconfig.json`.
- [ ] Run `npm test --prefix apps/pile-plan-studio`.
- [ ] Run `cargo fmt --all --check` and `cargo test --workspace`.
- [ ] In the live React viewer, open Optimization, run against active configurations, and verify choices and summary update without console errors.

