# Loading Load Point Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show neutral grey load points while default pile choices are unresolved, then show configured symbols, yellow crosses for all-Missing options, or red crosses for complete but invalid options.

**Architecture:** Add a pure marker-state classifier beside the existing invalid-choice visual helper. Keep `defaultPileSelectionPending` true for the complete asynchronous default-selection operation and guard duplicate requests with a React ref. `PilePlanViewer` consumes the classifier and renders one of the existing pile symbol, a neutral dot, or a colour-coded cross.

**Tech Stack:** React, TypeScript, CSS, Node test runner, Rust/WASM-backed pile analysis.

## Global Constraints

- No new project data is persisted in IFCPP.
- Opened IFCPP projects preserve stored pile choices and do not run default initialization.
- Individual load-point markers use no spinner or animation.
- A cross appears only after calculation completes without a valid pile choice.

---

### Task 1: Classify unresolved and no-pile marker states

**Files:**
- Modify: `apps/pile-plan-studio/src/loadPointMarker.ts`
- Test: `apps/pile-plan-studio/src/loadPointMarker.test.ts`

**Interfaces:**
- Consumes: `PileConfigurationOption[] | undefined`, `isPending: boolean`, and `hasAnalysisError: boolean`.
- Produces: `getUnselectedLoadPointMarkerState(...)` returning `"pending" | "missing" | "invalid"`.

- [ ] **Step 1: Write failing classifier tests**

Add tests that assert pending and failed-unresolved input returns `pending`, all options with non-empty `missing_cpt_ids` return `missing`, and a completed set containing a complete invalid option returns `invalid`.

```ts
assert.equal(getUnselectedLoadPointMarkerState(undefined, true, false), "pending");
assert.equal(getUnselectedLoadPointMarkerState(undefined, false, true), "pending");
assert.equal(getUnselectedLoadPointMarkerState([missingOption], false, false), "missing");
assert.equal(getUnselectedLoadPointMarkerState([missingOption, invalidOption], false, false), "invalid");
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test apps/pile-plan-studio/src/loadPointMarker.test.ts`

Expected: FAIL because `getUnselectedLoadPointMarkerState` is not exported.

- [ ] **Step 3: Implement the pure classifier**

```ts
export type UnselectedLoadPointMarkerState = "pending" | "missing" | "invalid";

export function getUnselectedLoadPointMarkerState(
  options: PileConfigurationOption[] | undefined,
  isPending: boolean,
  hasAnalysisError: boolean,
): UnselectedLoadPointMarkerState {
  if (isPending || hasAnalysisError || !options) return "pending";
  if (options.length > 0 && options.every((option) => option.missing_cpt_ids.length > 0)) {
    return "missing";
  }
  return "invalid";
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test apps/pile-plan-studio/src/loadPointMarker.test.ts`

Expected: all marker tests PASS.

- [ ] **Step 5: Commit the classifier**

```text
git add apps/pile-plan-studio/src/loadPointMarker.ts apps/pile-plan-studio/src/loadPointMarker.test.ts
git commit -m "feat: classify unresolved load point markers"
```

### Task 2: Keep default selection pending until choices arrive

**Files:**
- Modify: `apps/pile-plan-studio/src-react/App.tsx`
- Test: `apps/pile-plan-studio/src-react/AppStartup.test.ts`

**Interfaces:**
- Consumes: existing `ProjectState.defaultPileSelectionPending`.
- Produces: an atomic state transition from pending to selected choices, guarded by `defaultSelectionRequestRef`.

- [ ] **Step 1: Write a failing source-contract test**

Assert that `App.tsx` contains a request ref, does not clear `defaultPileSelectionPending` before `chooseDefaultPileOptionsCore`, and clears it in both success and failure transitions.

```ts
assert.match(source, /defaultSelectionRequestRef/);
assert.doesNotMatch(source, /defaultPileSelectionPending: false,[\s\S]*?chooseDefaultPileOptionsCore/);
assert.match(source, /selectedPileOptionKeysByLoadPoint: choices,[\s\S]*?defaultPileSelectionPending: false/);
```

- [ ] **Step 2: Run the startup tests and verify RED**

Run: `node --test apps/pile-plan-studio/src-react/AppStartup.test.ts`

Expected: FAIL because pending is currently cleared before the async chooser resolves.

- [ ] **Step 3: Implement atomic default initialization**

Add a ref keyed by the active analysis request. Return early when the same request is already running. Set the ref before calling the core, then apply choices and clear pending together on success. On failure, clear pending, retain no choices, and set `analysisError`. Clear the request ref in `finally` only when it still refers to that request.

```ts
const defaultSelectionRequestRef = useRef<AnalysisRequest | null>(null);

if (defaultSelectionRequestRef.current === analysisRequest) return;
defaultSelectionRequestRef.current = analysisRequest;

chooseDefaultPileOptionsCore(request)
  .then((choices) => setProjectState((current) => ({
    ...current,
    selectedPileOptionKeysByLoadPoint: choices,
    defaultPileSelectionPending: false,
    analysisError: null,
  })))
  .catch((error) => setProjectState((current) => ({
    ...current,
    defaultPileSelectionPending: false,
    analysisError: error instanceof Error ? error.message : String(error),
  })))
  .finally(() => {
    if (defaultSelectionRequestRef.current === analysisRequest) {
      defaultSelectionRequestRef.current = null;
    }
  });
```

- [ ] **Step 4: Run the startup tests and verify GREEN**

Run: `node --test apps/pile-plan-studio/src-react/AppStartup.test.ts`

Expected: all startup tests PASS.

- [ ] **Step 5: Commit the lifecycle fix**

```text
git add apps/pile-plan-studio/src-react/App.tsx apps/pile-plan-studio/src-react/AppStartup.test.ts
git commit -m "fix: keep default pile selection pending"
```

### Task 3: Render neutral dots and colour-coded crosses

**Files:**
- Modify: `apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.tsx`
- Modify: `apps/pile-plan-studio/src-react/components/domain/viewer.css`
- Test: `apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.test.ts`

**Interfaces:**
- Consumes: `getUnselectedLoadPointMarkerState`, `state.defaultPileSelectionPending`, `state.analysisError`, and options per load point.
- Produces: `.is-pending`, `.has-missing-options`, and `.has-invalid-options` marker classes.

- [ ] **Step 1: Write failing viewer tests**

Add source/CSS assertions for classifier use, the three classes, a neutral-dot element, a yellow cross rule, and a red cross rule.

```ts
assert.match(source, /getUnselectedLoadPointMarkerState/);
assert.match(source, /load-point-pending/);
assert.match(css, /\.load-point-marker\.is-pending/);
assert.match(css, /\.load-point-marker\.has-missing-options \.load-point-empty/);
assert.match(css, /\.load-point-marker\.has-invalid-options \.load-point-empty/);
```

- [ ] **Step 2: Run the viewer tests and verify RED**

Run: `node --test apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.test.ts`

Expected: FAIL because pending dots and cross status classes do not exist.

- [ ] **Step 3: Implement marker rendering**

For load points without a selected option, classify their state. Render a `load-point-pending` span for `pending`; otherwise retain the cross and add the matching missing/invalid class. Apply no warning background to the pending marker.

```tsx
const unselectedState = selectedOption ? null : getUnselectedLoadPointMarkerState(
  state.pileOptionsByLoadPointId.get(loadPoint.id),
  state.defaultPileSelectionPending,
  state.analysisError !== null,
);
```

Use a light-grey filled circle with a grey outline for `.load-point-pending`, yellow stroke for `.has-missing-options .load-point-empty`, and red stroke for `.has-invalid-options .load-point-empty`.

- [ ] **Step 4: Run viewer and full frontend tests**

Run: `node --test apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.test.ts`

Expected: focused tests PASS.

Run: `npm test --prefix apps/pile-plan-studio`

Expected: all frontend tests PASS.

- [ ] **Step 5: Commit marker rendering**

```text
git add apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.tsx apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.test.ts apps/pile-plan-studio/src-react/components/domain/viewer.css
git commit -m "feat: show neutral markers while pile options load"
```

### Task 4: Final verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified browser and desktop-compatible frontend behaviour.

- [ ] **Step 1: Run TypeScript and frontend verification**

Run: `apps\pile-plan-studio\node_modules\.bin\tsc.cmd --noEmit -p apps\pile-plan-studio\tsconfig.json`

Expected: exit code 0.

Run: `npm test --prefix apps/pile-plan-studio`

Expected: all tests PASS.

- [ ] **Step 2: Run shared-core regression tests**

Run: `cargo test --workspace`

Expected: all Rust and WASM tests PASS.

- [ ] **Step 3: Verify the live sample**

Open `http://127.0.0.1:5180/index.react.html`, reload the sample, and confirm unresolved load points are briefly neutral grey before the configured symbols and final yellow/red crosses appear. Confirm no console errors occur.

