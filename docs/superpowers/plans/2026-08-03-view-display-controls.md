# View Display Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct View ribbon controls for marker scale, preferred utilization range, foreground ordering, live status-bar information, and a Rust-enforced optimization utilization ceiling.

**Architecture:** Rust owns IFCPP-persisted preferred-utilization and optimization settings and enforces the optimizer ceiling. TypeScript owns validated local viewer preferences, pure viewer visual helpers, and controlled React presentation. One marker scale feeds rendering and interaction geometry so symbols, hit areas, hover detection, and selection rings cannot drift apart.

**Tech Stack:** Rust, Serde, React, TypeScript, CSS, i18next, Tauri Store/browser localStorage, Node test runner.

## Global Constraints

- Symbol scale is one local preference from 10% through 200%, default 100%.
- Foreground is one local preference: `load-points` or `cpts`, default `load-points`.
- Preferred viewer utilization is project-persisted from 0% through 100%, default 0%-100%.
- Optimizer maximum utilization is independent, project-persisted from 0% through 100%, default 100%.
- Viewer utilization colors do not change technical pile-option status.
- Selected, inspected, editable, and hover-candidate objects remain above ordinary layer ordering.
- Lasso selection remains centre-based.
- The existing installer is outside this plan.

---

### Task 1: Rust Project Settings And Optimizer Ceiling

**Files:**
- Modify: `crates/pile-plan-core/src/project.rs`
- Modify: `crates/pile-plan-core/src/analysis.rs`
- Modify: `crates/pile-plan-core/src/ifcpp.rs`
- Modify: `crates/pile-plan-core/src/import.rs`
- Modify: `crates/pile-plan-core/src/import/refresh.rs`
- Modify: `crates/pile-plan-wasm/src/lib.rs`

**Interfaces:**
- Produces: `ViewerUtilizationSettings { minimum: f64, maximum: f64 }` with default `0.0..=1.0`.
- Extends: `GreedyOptimizationSettings` with `max_utilization: f64`, default `1.0` during deserialization.
- Consumes: the existing optimizer option lists and IFCPP project settings.

- [ ] **Step 1: Add failing Rust tests**

Add tests that deserialize legacy settings to the defaults, round-trip explicit viewer settings, accept options exactly at the optimizer maximum, reject options above it, and return no assignment when no option remains eligible.

- [ ] **Step 2: Verify the new tests fail**

Run: `cargo test -p pile-plan-core viewer_utilization -- --nocapture`

Run the named optimizer threshold tests directly when their module filter differs. Expected: compilation or assertion failure because the settings and filtering do not exist.

- [ ] **Step 3: Implement normalized Rust settings**

Add Serde defaults and a normalization function that clamps both viewer limits and `max_utilization` to `0.0..=1.0` and orders the viewer minimum/maximum. Ensure every default project constructor and import path supplies the new fields.

- [ ] **Step 4: Enforce the optimizer ceiling**

Filter target candidate options with:

```rust
option.is_option
    && option.missing_cpt_ids.is_empty()
    && option.utilization.is_some_and(|value| value <= settings.max_utilization)
```

Preserve current non-target and baseline behavior.

- [ ] **Step 5: Run Rust tests**

Run: `cargo test --workspace`

Expected: all Rust and WASM contract tests pass.

- [ ] **Step 6: Commit Task 1**

```powershell
git add crates/pile-plan-core crates/pile-plan-wasm
git commit -m "feat(core): add utilization display and optimization limits"
```

### Task 2: TypeScript Project Model And Local Viewer Preferences

**Files:**
- Create: `apps/pile-plan-studio/src/domain/viewerPreferences.ts`
- Create: `apps/pile-plan-studio/src/domain/viewerPreferences.test.ts`
- Modify: `apps/pile-plan-studio/src/core/projectTypes.ts`
- Modify: `apps/pile-plan-studio/src/core/projectFile.ts`
- Modify: `apps/pile-plan-studio/src/core/projectFile.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectState.ts`
- Modify: `apps/pile-plan-studio/src/domain/preferenceStore.ts`
- Modify: `apps/pile-plan-studio/src/domain/preferenceStore.test.ts`

**Interfaces:**
- Produces: `ViewerPreferences { symbolScalePercent: number; foregroundLayer: "load-points" | "cpts" }`.
- Produces: `normalizeViewerPreferences`, `loadViewerPreferences`, and `saveViewerPreferences` using the existing preference-store abstraction.
- Extends: loaded project settings with preferred utilization and optimizer maximum ratios.

- [ ] **Step 1: Add failing TypeScript tests**

Test defaults, clamping to 10-200, integer snapping, invalid foreground fallback, preference persistence, legacy IFCPP defaults, and explicit IFCPP round-trip.

- [ ] **Step 2: Verify the tests fail**

Run from `apps/pile-plan-studio`:

```powershell
node --test src/domain/viewerPreferences.test.ts src/core/projectFile.test.ts src/domain/preferenceStore.test.ts
```

Expected: missing-module/type or failed-default assertions.

- [ ] **Step 3: Implement the local preference model**

Normalize symbol scale with `Math.round(clamp(value, 10, 200))`; accept only the two foreground values. Store preferences under one stable application key so both browser and desktop paths use the existing persistence fallback.

- [ ] **Step 4: Extend TypeScript project loading and saving**

Map Rust ratio fields to `ProjectState`, default legacy projects to `0.0`, `1.0`, and `1.0`, and emit the explicit fields when saving IFCPP.

- [ ] **Step 5: Run focused tests and TypeScript**

Run:

```powershell
node --test src/domain/viewerPreferences.test.ts src/core/projectFile.test.ts src/domain/preferenceStore.test.ts
npx tsc -p tsconfig.json --noEmit
```

- [ ] **Step 6: Commit Task 2**

```powershell
git add apps/pile-plan-studio/src/domain apps/pile-plan-studio/src/core
git commit -m "feat(project): persist utilization and viewer preferences"
```

### Task 3: Utilization Visuals, Shared Marker Scale, And Layer Ordering

**Files:**
- Create: `apps/pile-plan-studio/src/viewer/utilizationVisual.ts`
- Create: `apps/pile-plan-studio/src/viewer/utilizationVisual.test.ts`
- Modify: `apps/pile-plan-studio/src/viewer/loadPointMarker.ts`
- Modify: `apps/pile-plan-studio/src/viewer/loadPointMarker.test.ts`
- Modify: `apps/pile-plan-studio/src/viewer/mapMarkerLayer.ts`
- Modify: `apps/pile-plan-studio/src/viewer/mapMarkerLayer.test.ts`
- Modify: `apps/pile-plan-studio/src/viewer/hoverCandidates.ts`
- Modify: `apps/pile-plan-studio/src/viewer/hoverCandidates.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanViewer.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/viewer.css`

**Interfaces:**
- Produces: `getUtilizationVisual(utilization, range, missing)` returning neutral/red/green/missing state and a clamped intensity.
- Produces: layer helpers that accept the foreground preference while preserving interactive priorities.
- Consumes: `ViewerPreferences.symbolScalePercent` as the single scale for CSS and hover radii.

- [ ] **Step 1: Add failing pure-helper tests**

Test inclusive range boundaries, red/green direction, exact full intensity at 50 percentage points, missing precedence, scale-derived radii, and both foreground orders.

- [ ] **Step 2: Verify helper tests fail**

Run:

```powershell
node --test src/viewer/utilizationVisual.test.ts src/viewer/loadPointMarker.test.ts src/viewer/mapMarkerLayer.test.ts src/viewer/hoverCandidates.test.ts
```

- [ ] **Step 3: Implement pure viewer helpers**

Keep status calculation independent from preferred-range styling. Return CSS variables rather than embedding presentation rules in React.

- [ ] **Step 4: Wire one marker scale into rendering and interaction**

Set `--viewer-symbol-scale` on the viewer root. Derive every marker/ring/cross dimension with `calc(base * var(--viewer-symbol-scale))`. Pass scaled visual radii into `createHoverMarkerIndex`; include the scale in memoization dependencies so the index rebuilds immediately.

- [ ] **Step 5: Apply foreground and utilization CSS states**

Use opaque light red/green overlay colors suitable for the permanently light viewer. Keep yellow missing styling and selection/hover rings above these fills. Ordinary z-index values respond to the preference; selected/editable/hover values remain invariant.

- [ ] **Step 6: Run viewer tests**

Run:

```powershell
node --test src/viewer/*.test.ts src/components/domain/PilePlanViewer.test.ts
```

- [ ] **Step 7: Commit Task 3**

```powershell
git add apps/pile-plan-studio/src/viewer apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx apps/pile-plan-studio/src/components/domain/PilePlanViewer.test.ts apps/pile-plan-studio/src/components/domain/viewer.css
git commit -m "feat(viewer): add scalable symbols and utilization styling"
```

### Task 4: View Ribbon, Optimization Slider, And Live Status Bar

**Files:**
- Create: `apps/pile-plan-studio/src/components/template/ribbon/RangeControl.tsx`
- Create: `apps/pile-plan-studio/src/components/template/ribbon/RangeControl.test.ts`
- Modify: `apps/pile-plan-studio/src/components/template/ribbon/Ribbon.tsx`
- Modify: `apps/pile-plan-studio/src/components/template/ribbon/Ribbon.test.ts`
- Modify: `apps/pile-plan-studio/src/components/template/ribbon/Ribbon.css`
- Modify: `apps/pile-plan-studio/src/components/domain/OptimizationPanel.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/OptimizationPanel.test.ts`
- Modify: `apps/pile-plan-studio/src/components/template/StatusBar.tsx`
- Modify: `apps/pile-plan-studio/src/components/template/StatusBar.test.ts`
- Modify: `apps/pile-plan-studio/src/components/template/StatusBar.css`
- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/ribbon.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/ribbon.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/common.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/common.json`

**Interfaces:**
- `Ribbon` consumes controlled viewer preferences and preferred-range values and emits focused callbacks.
- `OptimizationPanel` writes `max_utilization` only.
- `StatusBar` consumes `{ totalCost, missingCostCount, zoomPercent }`.

- [ ] **Step 1: Add failing component contract tests**

Test that View is an active tab, controls expose 10-200 and 0-100 ranges, dual handles remain ordered, foreground uses a segmented control, optimizer exposes maximum utilization, status bar renders live values, and both languages contain labels.

- [ ] **Step 2: Verify component tests fail**

Run:

```powershell
node --test src/components/template/ribbon/*.test.ts src/components/template/StatusBar.test.ts src/components/domain/OptimizationPanel.test.ts
```

- [ ] **Step 3: Implement the controlled View ribbon**

Add `view` to `TABS`. Render direct groups for symbol scale, dual preferred range, and foreground. Keep controls compact, stable in size, and responsive without nested cards.

- [ ] **Step 4: Implement optimizer and status controls**

Use a 0-100 slider mapped to ratio storage for optimization. Derive current costs with `summarizeProjectCosts` and zoom from `state.viewport.scale * 100`; pass both to `StatusBar` so they update with project state.

- [ ] **Step 5: Wire local preference persistence**

Load viewer preferences once during application startup. Save only after normalized values change. Apply them without marking the IFCPP project dirty; preferred range and optimizer maximum do mark the project dirty.

- [ ] **Step 6: Run component, translation, and startup tests**

Run:

```powershell
node --test src/components/**/*.test.ts src/AppStartup.test.ts
npx tsc -p tsconfig.json --noEmit
```

- [ ] **Step 7: Commit Task 4**

```powershell
git add apps/pile-plan-studio/src
git commit -m "feat(ui): add direct viewer display controls"
```

### Task 5: Full Verification And Documentation

**Files:**
- Modify if needed: `README.md`
- Modify if needed: `docs/known-limitations.md`
- Modify: `RELEASE_NOTES.md` only when preparing the next release, not during feature implementation.

**Interfaces:**
- Consumes the complete implementation from Tasks 1-4.
- Produces a verified featurebranch ready for review.

- [ ] **Step 1: Run all automated verification**

```powershell
cargo test --workspace
cd apps\pile-plan-studio
npm test
npx tsc -p tsconfig.json --noEmit
npm run build
```

- [ ] **Step 2: Run visual verification**

Start the local React preview only for verification. Check desktop and narrow widths, 10%/100%/200% marker scales, click and hover overlap selection, utilization range colors, both foreground modes, optimizer threshold behavior, live cost, and live zoom. Stop the preview afterward.

- [ ] **Step 3: Check repository hygiene**

Run:

```powershell
git diff --check
git status --short
```

Confirm unrelated untracked files remain untouched and generated WASM files match the Rust source.

- [ ] **Step 4: Commit any focused documentation updates**

```powershell
git add README.md docs
git commit -m "docs: describe viewer display controls"
```

