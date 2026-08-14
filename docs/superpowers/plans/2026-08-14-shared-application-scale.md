# Shared Application Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give browser and desktop the same compact nominal 100% interface while keeping desktop application zoom and pile-plan viewer zoom independent.

**Architecture:** Apply the compact 0.8 design baseline through one root CSS class in both runtimes. Tauri WebView zoom then represents only the persisted user factor (100% maps to `1.0`), and the normal workspace waits until desktop settings and scale are ready. A small desktop-only overlay reports keyboard-driven application scale changes without reusing the plan-viewer status bar.

**Tech Stack:** React 19, TypeScript 6, CSS, Tauri 2 WebView API, Node test runner.

## Global Constraints

- The compact 80% presentation is the nominal 100% appearance in browser and desktop.
- Desktop application scale remains clamped to 50%-150% in 10-point steps.
- Browser `Ctrl+=`, `Ctrl+-`, and `Ctrl+0` remain native browser shortcuts.
- Desktop `Ctrl+=`, `Ctrl+-`, and `Ctrl+0` control only application scale.
- Plan viewport zoom remains project state and is the only percentage shown in the status bar.
- Failure to apply desktop WebView zoom must not prevent startup.
- No new runtime dependency is introduced.

---

### Task 1: Share the compact baseline across runtimes

**Files:**
- Modify: `apps/pile-plan-studio/src/domain/uiBaseline.ts`
- Modify: `apps/pile-plan-studio/src/domain/uiBaseline.test.ts`
- Modify: `apps/pile-plan-studio/src/CompactBaseline.test.ts`
- Modify: `apps/pile-plan-studio/src/App.css`
- Modify: `apps/pile-plan-studio/src/main.tsx`

**Interfaces:**
- Produces: `applyRuntimeBaseline(root?: ClassListTarget): void`, which always applies the shared `compact-application-baseline` root class.
- Preserves: `BROWSER_BASELINE_ZOOM = 0.8` for CSS geometry helpers and regression tests.

- [ ] **Step 1: Write failing baseline tests**

  Update the unit expectations so both browser and desktop initialization apply the same root class, and update the source-level CSS test to require:

  ```css
  html.compact-application-baseline {
    zoom: 0.8;
  }
  ```

- [ ] **Step 2: Run the focused tests and confirm failure**

  Run:

  ```powershell
  npm test -- --test-name-pattern="UI baseline geometry|compact application baseline"
  ```

  Expected: failure because the class is currently browser-only.

- [ ] **Step 3: Implement the shared root baseline**

  Replace runtime-dependent class toggling with unconditional application of `compact-application-baseline`, update `main.tsx`, and rename the CSS selector. Do not add a desktop-specific inverse or correction.

- [ ] **Step 4: Run the focused tests**

  Run the command from Step 2. Expected: pass.

- [ ] **Step 5: Commit the baseline change**

  ```powershell
  git add apps/pile-plan-studio/src/domain/uiBaseline.ts apps/pile-plan-studio/src/domain/uiBaseline.test.ts apps/pile-plan-studio/src/CompactBaseline.test.ts apps/pile-plan-studio/src/App.css apps/pile-plan-studio/src/main.tsx
  git commit -m "fix: share compact application baseline"
  ```

---

### Task 2: Make Tauri zoom purely relative

**Files:**
- Modify: `apps/pile-plan-studio/src/domain/interfaceScaleRuntime.ts`
- Modify: `apps/pile-plan-studio/src/domain/interfaceScaleRuntime.test.ts`

**Interfaces:**
- Produces: `applicationScaleFactor(scalePercent: number): number`.
- Preserves: `applyDesktopInterfaceScale(scalePercent, environment): Promise<boolean>`.
- Contract: `applicationScaleFactor(100) === 1`, `applicationScaleFactor(50) === 0.5`, and `applicationScaleFactor(150) === 1.5`.

- [ ] **Step 1: Write failing factor tests**

  Add direct assertions for 50%, 100%, 110%, and 150%, and change the injected `setZoom` assertion for 114% from `0.88` to `1.1` after normalization.

- [ ] **Step 2: Run the runtime test and confirm failure**

  ```powershell
  node --test src/domain/interfaceScaleRuntime.test.ts
  ```

  Run from `apps/pile-plan-studio`. Expected: the old 0.8 multiplication fails.

- [ ] **Step 3: Implement the relative factor**

  Remove the `BROWSER_BASELINE_ZOOM` import from the runtime and calculate:

  ```ts
  export function applicationScaleFactor(scalePercent: number): number {
    return normalizeInterfaceScale(scalePercent) / 100;
  }
  ```

  Pass that factor to Tauri `setZoom`.

- [ ] **Step 4: Run the focused test**

  Run the command from Step 2. Expected: pass.

- [ ] **Step 5: Commit the runtime correction**

  ```powershell
  git add apps/pile-plan-studio/src/domain/interfaceScaleRuntime.ts apps/pile-plan-studio/src/domain/interfaceScaleRuntime.test.ts
  git commit -m "fix: make desktop scale relative"
  ```

---

### Task 3: Stabilize desktop startup before workspace geometry is measured

**Files:**
- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/AppStartup.test.ts`
- Modify: `apps/pile-plan-studio/src/App.css`

**Interfaces:**
- Produces: an internal `userSettingsReady: boolean` startup gate.
- Consumes: `loadUserSettings(...)` and `applyDesktopInterfaceScale(...)`.
- Contract: browser can become ready immediately after loading preferences; desktop calls `applyDesktopInterfaceScale(settings.preferences.interfaceScalePercent)` before rendering `PilePlanWorkspace`.

- [ ] **Step 1: Add failing startup-order assertions**

  Extend `AppStartup.test.ts` to assert that the loaded desktop scale is awaited before the ready flag is set and that normal workspace rendering is guarded by readiness.

- [ ] **Step 2: Run the startup test and confirm failure**

  ```powershell
  node --test src/AppStartup.test.ts
  ```

  Expected: failure because the workspace currently mounts before asynchronous settings are applied.

- [ ] **Step 3: Add the startup gate**

  Initialize readiness to `false`. In the existing unified settings load effect:

  1. load settings;
  2. apply theme and language;
  3. when desktop, await the loaded scale through `applyDesktopInterfaceScale`;
  4. install settings and set readiness to `true` unless cancelled.

  Render a full-app neutral `app-startup-surface` until ready. Keep the existing scale-change effect for later preference edits. A failed Tauri call still resolves and therefore opens the app.

- [ ] **Step 4: Run startup and scale tests**

  ```powershell
  node --test src/AppStartup.test.ts src/domain/interfaceScaleRuntime.test.ts
  ```

  Expected: pass.

- [ ] **Step 5: Commit startup stabilization**

  ```powershell
  git add apps/pile-plan-studio/src/App.tsx apps/pile-plan-studio/src/AppStartup.test.ts apps/pile-plan-studio/src/App.css
  git commit -m "fix: apply desktop scale before workspace mount"
  ```

---

### Task 4: Show desktop application-scale feedback

**Files:**
- Create: `apps/pile-plan-studio/src/components/template/InterfaceScaleNotice.tsx`
- Create: `apps/pile-plan-studio/src/components/template/InterfaceScaleNotice.css`
- Create: `apps/pile-plan-studio/src/components/template/InterfaceScaleNotice.test.ts`
- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/AppShortcuts.test.ts`

**Interfaces:**
- Produces: `InterfaceScaleNotice({ notice, onExpire })`, where `notice` is `{ id: number; percent: number } | null`.
- Consumes: the next normalized percentage calculated by the desktop shortcut handler.
- Contract: each shortcut creates a new `id`, restarts a 1500 ms timer, renders `percent%`, and invokes `onExpire(id)` only for the matching notice.

- [ ] **Step 1: Write failing notice and shortcut tests**

  Test the component source/contract for `role="status"`, `aria-live="polite"`, the percentage text, timeout cleanup, and themed class names. Extend `AppShortcuts.test.ts` to require the notice update only in the already desktop-only zoom branch.

- [ ] **Step 2: Run focused tests and confirm failure**

  ```powershell
  node --test src/components/template/InterfaceScaleNotice.test.ts src/AppShortcuts.test.ts src/domain/appShortcuts.test.ts
  ```

  Expected: failure because the notice does not exist.

- [ ] **Step 3: Implement the notice**

  Add the non-interactive fixed top-right component. Use active theme variables for background, border, and text. In the shortcut handler, publish the computed next percentage after updating settings. Do not show the notice for settings-dialog previews or viewer wheel zoom.

- [ ] **Step 4: Run focused tests**

  Run the command from Step 2. Expected: pass.

- [ ] **Step 5: Commit desktop feedback**

  ```powershell
  git add apps/pile-plan-studio/src/components/template/InterfaceScaleNotice.tsx apps/pile-plan-studio/src/components/template/InterfaceScaleNotice.css apps/pile-plan-studio/src/components/template/InterfaceScaleNotice.test.ts apps/pile-plan-studio/src/App.tsx apps/pile-plan-studio/src/AppShortcuts.test.ts
  git commit -m "feat: show desktop application scale"
  ```

---

### Task 5: Preserve viewer semantics and document scale responsibilities

**Files:**
- Create: `apps/pile-plan-studio/src/viewer/README.md`
- Modify: `docs/architecture.md`
- Modify: `apps/pile-plan-studio/src/components/template/StatusBar.test.ts`
- Modify: `apps/pile-plan-studio/src/ScaledGeometryIntegration.test.ts`

**Interfaces:**
- Documents: compact baseline, desktop application factor, plan viewport zoom, CSS layout scale, pointer normalization, and layout-anchor compensation.
- Preserves: `StatusBar.zoomPercent = projectState.viewport.scale * 100`.

- [ ] **Step 1: Strengthen regression assertions**

  Assert that the status bar still receives `projectState.viewport.scale * 100`, and that shared compact baseline helpers remain used by pointer and panel-resize paths rather than WebView-factor constants.

- [ ] **Step 2: Run the regression tests**

  ```powershell
  node --test src/components/template/StatusBar.test.ts src/ScaledGeometryIntegration.test.ts src/viewer/viewerGeometry.test.ts src/viewer/panelLayout.test.ts
  ```

  Expected: pass unless a stale runtime-specific assumption is discovered; update only assertions contradicted by the approved design.

- [ ] **Step 3: Move detailed viewer guidance beside the code**

  Add `src/viewer/README.md` with the coordinate and scaling invariants. Reduce `docs/architecture.md` to a short viewer overview and a link to that README.

- [ ] **Step 4: Run the full frontend verification**

  From `apps/pile-plan-studio`:

  ```powershell
  npm test
  npm run build
  ```

  Expected: all tests pass and Vite production build succeeds.

- [ ] **Step 5: Commit regression coverage and documentation**

  ```powershell
  git add apps/pile-plan-studio/src/viewer/README.md docs/architecture.md apps/pile-plan-studio/src/components/template/StatusBar.test.ts apps/pile-plan-studio/src/ScaledGeometryIntegration.test.ts
  git commit -m "docs: clarify application and viewer scale"
  ```

---

### Task 6: Build and smoke-test the desktop application

**Files:**
- Verify: `apps/pile-plan-studio/src-tauri/tauri.conf.json`
- Build output: `target/release/pile-plan-studio.exe` or the configured workspace target equivalent.

**Interfaces:**
- Produces: a fresh local Windows desktop executable for user testing.

- [ ] **Step 1: Run the complete test suite once more**

  ```powershell
  npm test
  ```

  Expected: pass.

- [ ] **Step 2: Build the Tauri executable**

  From `apps/pile-plan-studio`:

  ```powershell
  npm run tauri build -- --no-bundle
  ```

  Expected: a successful release executable without rebuilding installers.

- [ ] **Step 3: Locate and report the executable**

  Resolve the generated `.exe` path under the configured Cargo target directory and provide it as a clickable absolute file link.

- [ ] **Step 4: Manual smoke-test checklist**

  Verify nominal 100% desktop appearance against browser 100%, then test `Ctrl+=`, `Ctrl+-`, `Ctrl+0`, the temporary top-right percentage, lasso alignment, marker selection, panel resizing, CPT labels, viewer wheel zoom, and that the status bar changes only for viewer zoom.

