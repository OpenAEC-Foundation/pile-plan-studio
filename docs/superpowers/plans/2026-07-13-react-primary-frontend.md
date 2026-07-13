# React Primary Frontend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the parallel Vanilla/React frontend layout with one official React application under `apps/pile-plan-studio/src`.

**Architecture:** First classify and relocate the reusable TypeScript modules already consumed by React into `src/core`, `src/domain`, and `src/viewer`, while deleting only the DOM-based Vanilla entry and stylesheet. Then move the React tree into `src`, switch HTML/Vite/npm/Tauri to the single React entry, and verify browser and desktop builds against the unchanged Rust core.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tauri 2, Rust 2021, WASM/wasm-bindgen, Node test runner.

## Global Constraints

- End with one frontend source root: `apps/pile-plan-studio/src`.
- Do not preserve a runnable Vanilla frontend or compatibility aliases for the old paths.
- Do not change IFCPP schemas, import behavior, pile-option logic, CPT selection, costs, or optimization algorithms.
- Keep Rust under `crates/` as the calculation source of truth.
- Preserve browser operation through WASM and desktop operation through Tauri.
- Keep existing user-facing behavior unchanged during the migration.

---

### Task 1: Lock The Single-Entry Build Contract

**Files:**
- Create: `apps/pile-plan-studio/src-primary-entry.test.ts`
- Test: `apps/pile-plan-studio/src-primary-entry.test.ts`

**Interfaces:**
- Consumes: current `index.html`, `package.json`, `vite.config.ts`, and `src-tauri/tauri.conf.json`.
- Produces: a regression test requiring `src/main.tsx` as the only frontend entry and forbidding temporary React-preview commands.

- [ ] **Step 1: Write the failing source-contract test**

Create a Node test which reads the four configuration files and asserts:

```ts
assert.match(indexHtml, /src="\/src\/main\.tsx"/);
assert.doesNotMatch(indexHtml, /src\/main\.ts/);
assert.doesNotMatch(viteConfig, /index\.react\.html|vanilla:|react:/);
assert.doesNotMatch(packageJson, /dev:react|build:react/);
assert.match(tauriConfig, /"beforeDevCommand": "npm run dev"/);
assert.match(tauriConfig, /"beforeBuildCommand": "npm run build"/);
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --test apps/pile-plan-studio/src-primary-entry.test.ts
```

Expected: FAIL because `index.html` still loads `src/main.ts` and Vite still declares both entries.

- [ ] **Step 3: Leave production files unchanged**

This task establishes the migration boundary only. Production changes occur after the source tree has been reorganized.

- [ ] **Step 4: Commit the red contract test with the first green migration task**

Do not create a deliberately failing standalone commit. Include this test in the Task 3 commit after it passes.

---

### Task 2: Reorganize Retained Framework-Independent Modules

**Files:**
- Move to `apps/pile-plan-studio/src/core/`: `coreClient*`, `coreImportContract*`, `coreSerialization*`, `importFiles*`, `projectAnalysisResult.ts`, `projectFile*`, `projectTypes.ts`, and `wasm/`.
- Move to `apps/pile-plan-studio/src/domain/`: `activePileConfigurations*`, `cptSelectionTable*`, `formatting*`, `optimizationSettings*`, `optimizationSummary*`, `pileOptionAggregation*`, `pileOptionColumns*`, `pileOptionStatus*`, `pileOptionTable*`, `projectCostSummary*`, `rightPanelView*`, and `selectionState*`.
- Move to `apps/pile-plan-studio/src/viewer/`: `lassoSelection*`, `legend*`, `legendSelection*`, `loadPointMarker*`, `mapInteraction*`, `mapMarkerLayer*`, `panelLayout*`, `pileSymbols*`, `viewerGeometry*`, and `viewport*`.
- Remove after replacement: `apps/pile-plan-studio/src/main.ts`, `apps/pile-plan-studio/src/styles.css`.
- Modify: imports in all moved `.ts` and `.test.ts` files.
- Modify: `apps/pile-plan-studio/package.json` WASM output path.

**Interfaces:**
- Produces: `src/core/coreClient.ts`, `src/core/projectTypes.ts`, `src/domain/selectionState.ts`, `src/viewer/viewport.ts`, and corresponding colocated tests.
- Preserves: all current exports and runtime behavior; only import paths and physical ownership change.

- [ ] **Step 1: Move files into responsibility directories**

Use mechanical filesystem moves. Preserve file names and test colocation. Move generated WASM from `src/wasm` to `src/core/wasm`.

- [ ] **Step 2: Repair imports within retained modules**

Use explicit relative imports based on the new directories. Examples:

```ts
// src/domain/optimizationSettings.ts
import { pileConfigurationKey } from "../domain/activePileConfigurations.ts";
import type { GreedyOptimizationSettings } from "../core/projectTypes.ts";

// src/core/coreClient.ts
import type { PileCostSettings } from "./projectTypes.ts";
import initWasm from "./wasm/pile-plan-wasm/pile_plan_wasm.js";

// src/viewer/legend.ts
import type { BearingCapacity } from "../core/projectTypes.ts";
```

Prefer a same-directory `./module.ts` import when both files live in the same responsibility directory.

- [ ] **Step 3: Update the WASM build destination**

Change `build:wasm` in `package.json` to:

```json
"build:wasm": "wasm-pack build ../../crates/pile-plan-wasm --target web --out-dir ../../apps/pile-plan-studio/src/core/wasm/pile-plan-wasm && node ../../tools/allow_wasm_package.mjs"
```

- [ ] **Step 4: Remove only the Vanilla UI entry and stylesheet**

Delete `src/main.ts` and `src/styles.css`. Do not remove a retained module merely because it originated in the old directory.

- [ ] **Step 5: Run retained module tests**

Run:

```powershell
node --test apps/pile-plan-studio/src/core/*.test.ts apps/pile-plan-studio/src/domain/*.test.ts apps/pile-plan-studio/src/viewer/*.test.ts
```

Expected: all relocated tests PASS.

---

### Task 3: Move React Into The Official `src` Root

**Files:**
- Move: all contents of `apps/pile-plan-studio/src-react/` to `apps/pile-plan-studio/src/`.
- Modify: all imports under `apps/pile-plan-studio/src/`.
- Modify: `apps/pile-plan-studio/tsconfig.json`.
- Remove: empty `apps/pile-plan-studio/src-react/`.

**Interfaces:**
- Consumes: Task 2 paths under `src/core`, `src/domain`, and `src/viewer`.
- Produces: official React entry `src/main.tsx`, application shell `src/App.tsx`, and the complete React component tree.

- [ ] **Step 1: Move the React tree without changing behavior**

Move `App.tsx`, `main.tsx`, React styles, `components/`, `hooks/`, `i18n/`, React project state, and store files into `src/`. Place React project state under `src/domain/projectState.ts`; keep component presentation models with their components.

- [ ] **Step 2: Update imports to the responsibility paths**

Representative replacements:

```ts
import { greedyOptimizeCore } from "./core/coreClient.ts";
import type { PileCostSettings } from "./core/projectTypes.ts";
import { switchRightPanelMode } from "./domain/selectionState.ts";
import { optionKey } from "./components/domain/rightPanelModel.ts";
```

Component imports that previously used `../../../src/...` must point to `../../core/...`, `../../domain/...`, or `../../viewer/...` according to ownership.

- [ ] **Step 3: Update TypeScript source inclusion**

Set `tsconfig.json` to:

```json
"include": ["src", "../../sample_project/*.json"],
"exclude": ["src/**/*.test.ts"]
```

- [ ] **Step 4: Verify TypeScript and frontend tests**

Run:

```powershell
apps\pile-plan-studio\node_modules\.bin\tsc.cmd --noEmit -p apps\pile-plan-studio\tsconfig.json
npm test --prefix apps/pile-plan-studio
```

Expected: TypeScript exits `0`; all frontend tests PASS from `src/`.

---

### Task 4: Switch HTML, Vite, npm, And Tauri To React

**Files:**
- Modify: `apps/pile-plan-studio/index.html`
- Modify: `apps/pile-plan-studio/vite.config.ts`
- Modify: `apps/pile-plan-studio/package.json`
- Verify: `apps/pile-plan-studio/src-tauri/tauri.conf.json`
- Remove: `apps/pile-plan-studio/index.react.html`
- Test: `apps/pile-plan-studio/src-primary-entry.test.ts`

**Interfaces:**
- Produces: `/` as the single browser URL and the same entry for Tauri.

- [ ] **Step 1: Make `index.html` mount React**

Use:

```html
<main id="root"></main>
<script type="module" src="/src/main.tsx"></script>
```

Keep the title `Pile Plan Studio` without a preview suffix.

- [ ] **Step 2: Simplify Vite to one entry**

Remove `resolve` and the multi-entry `rollupOptions`. Retain the React plugin, server settings, and ignored Tauri watch path.

- [ ] **Step 3: Make regular npm scripts authoritative**

Remove `dev:react` and `build:react`. Keep:

```json
"dev": "vite --host 127.0.0.1",
"build": "npm run build:wasm && tsc -p tsconfig.json && vite build --config vite.config.ts"
```

Update `test` to `node --test src/**/*.test.ts src-primary-entry.test.ts`.

- [ ] **Step 4: Remove the temporary preview HTML**

Delete `index.react.html`.

- [ ] **Step 5: Verify the entry contract and production build**

Run:

```powershell
node --test apps/pile-plan-studio/src-primary-entry.test.ts
npm run build --prefix apps/pile-plan-studio
```

Expected: contract test PASS; Vite emits one `dist/index.html`; build exits `0`.

- [ ] **Step 6: Commit the source migration**

```powershell
git add apps/pile-plan-studio
git commit -m "refactor: make React the primary frontend"
```

---

### Task 5: Update Active Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/alpha-design.md`
- Modify: `docs/openaec-styling-spec.md`

**Interfaces:**
- Produces: current documentation that describes one React frontend and no parallel migration state.

- [ ] **Step 1: Update README commands and architecture**

Document `npm run dev`, root URL `/`, `npm run build`, Tauri, React UI, Rust core, and WASM/Tauri adapters. Remove instructions that require `index.react.html` or `dev:react`.

- [ ] **Step 2: Mark the parallel migration as completed**

In active direction documents, state that React is now the official frontend. Preserve historical rationale but remove wording that says the app is still waiting to swap.

- [ ] **Step 3: Check stale active references**

Run:

```powershell
rg -n "index\.react\.html|dev:react|build:react|parallel React|swap once" README.md docs/alpha-design.md docs/openaec-styling-spec.md
```

Expected: no instructions describe the temporary preview as current behavior.

- [ ] **Step 4: Commit documentation**

```powershell
git add README.md docs/alpha-design.md docs/openaec-styling-spec.md
git commit -m "docs: document React as the primary frontend"
```

---

### Task 6: Full Verification And Live Handoff

**Files:**
- Verify only.

**Interfaces:**
- Confirms: one React frontend works in browser and desktop against the unchanged Rust core.

- [ ] **Step 1: Verify no obsolete production paths remain**

Run:

```powershell
Test-Path apps/pile-plan-studio/src-react
Test-Path apps/pile-plan-studio/index.react.html
rg -n "src-react|index\.react\.html|src/main\.ts" apps/pile-plan-studio -g "!node_modules" -g "!dist"
```

Expected: both paths are absent and no production configuration references them.

- [ ] **Step 2: Run all automated verification**

Run:

```powershell
npm test --prefix apps/pile-plan-studio
npm run build --prefix apps/pile-plan-studio
cargo fmt --all --check
cargo test --workspace
```

Expected: all commands exit `0`.

- [ ] **Step 3: Verify the live browser at `/`**

Open `http://127.0.0.1:<port>/`, confirm sample analysis completes, open Optimization, run the greedy optimizer, and confirm the summary appears without console errors.

- [ ] **Step 4: Verify Tauri uses the same entry**

Run a Tauri build smoke check:

```powershell
npm run tauri --prefix apps/pile-plan-studio -- build --debug
```

Expected: the build completes and bundles the single React `dist/index.html`.

- [ ] **Step 5: Commit any verification-only configuration correction**

Only if a platform configuration correction was required, commit it separately as:

```powershell
git commit -m "fix: complete React frontend switchover"
```
