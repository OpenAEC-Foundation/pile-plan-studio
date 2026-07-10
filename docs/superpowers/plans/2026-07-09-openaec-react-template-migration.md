# OpenAEC React Template Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a parallel React + OpenAEC template frontend for Pile Plan Studio, keep the current Vanilla TypeScript app usable, and swap only after feature parity.

**Architecture:** The existing Rust core and WASM package remain the calculation source of truth. A new parallel React entry is introduced inside `apps/pile-plan-studio` using the local OpenAEC `Tauri+React` template as the shell reference. Current pure TypeScript domain helpers may be reused during the port, but no new calculation implementation should be added in React.

**Tech Stack:** Tauri v2, Rust 2021, WASM through `wasm-pack`, Vite, TypeScript, React 19, OpenAEC template shell components, CSS custom properties, `react-i18next`, `@tauri-apps/plugin-store`.

## Global Constraints

- Follow the OpenAEC `Tauri+React` template as much as practical.
- Develop the React template version in parallel and swap once feature parity is reached.
- Use React for the frontend shell and domain UI.
- Keep Rust/WASM as the calculation core.
- Keep the browser preview as a development tool, backed by WASM.
- Include the project explorer on the left from the start; it may initially be empty.
- Copy or bundle fonts during implementation if needed.
- Postpone dark theme.
- Ignore the local stylebook folder in git.
- Preserve the current alpha functionality before adding new features.
- Do not add a second calculation implementation in TypeScript.
- Keep the current app runnable until the final swap task.

---

## File Structure

Current app:

- `apps/pile-plan-studio/src/main.ts`: current Vanilla TypeScript UI entry. Leave intact until the final swap.
- `apps/pile-plan-studio/src/styles.css`: current Vanilla TypeScript UI styling. Leave intact until the final swap.
- `apps/pile-plan-studio/src/*.ts`: existing domain helpers and tests. Reuse these where they are pure UI/domain helpers.
- `crates/pile-plan-core/src/*.rs`: calculation, project, import, IFCPP, and optimization core. Do not duplicate this logic in React.
- `crates/pile-plan-wasm/src/lib.rs`: WASM bridge to the Rust core.

New parallel React app:

- `apps/pile-plan-studio/src-react/main.tsx`: React entry.
- `apps/pile-plan-studio/src-react/App.tsx`: OpenAEC shell composition.
- `apps/pile-plan-studio/src-react/App.css`: app layout styles adapted from the template.
- `apps/pile-plan-studio/src-react/themes.css`: OpenAEC theme variables.
- `apps/pile-plan-studio/src-react/store.ts`: Tauri store helpers.
- `apps/pile-plan-studio/src-react/components/template/*`: copied/adapted OpenAEC shell components.
- `apps/pile-plan-studio/src-react/components/domain/*`: Pile Plan Studio domain components.
- `apps/pile-plan-studio/src-react/i18n/*`: English and Dutch locale setup.
- `apps/pile-plan-studio/index.react.html`: temporary React preview entry.
- `apps/pile-plan-studio/vite.config.ts`: Vite config with current app and React preview entries.
- `apps/pile-plan-studio/src-tauri/tauri.react.conf.json`: optional temporary Tauri config if desktop preview of the React app needs to run before swap.

---

### Task 1: Add The Parallel React Build Entry

**Files:**
- Modify: `apps/pile-plan-studio/package.json`
- Modify: `apps/pile-plan-studio/tsconfig.json`
- Create: `apps/pile-plan-studio/tsconfig.node.json`
- Create: `apps/pile-plan-studio/vite.config.ts`
- Create: `apps/pile-plan-studio/index.react.html`
- Create: `apps/pile-plan-studio/src-react/main.tsx`
- Create: `apps/pile-plan-studio/src-react/App.tsx`
- Create: `apps/pile-plan-studio/src-react/App.css`

**Interfaces:**
- Produces: `npm run dev:react` for browser preview of the parallel React app.
- Produces: `npm run build:react` for type checking and building the React entry.
- Consumes: existing `npm run dev`, `npm run build`, and `npm test` must remain valid for the current app.

- [ ] **Step 1: Add React dependencies and scripts**

  In `apps/pile-plan-studio/package.json`, add dependencies:

  ```json
  {
    "dependencies": {
      "@tauri-apps/api": "^2.11.1",
      "@tauri-apps/plugin-os": "^2.3.2",
      "@tauri-apps/plugin-store": "^2.4.2",
      "i18next": "^25.8.14",
      "i18next-browser-languagedetector": "^8.2.1",
      "react": "^19.2.4",
      "react-dom": "^19.2.4",
      "react-i18next": "^16.5.4"
    },
    "devDependencies": {
      "@tauri-apps/cli": "^2.11.4",
      "@types/react": "^19.2.14",
      "@types/react-dom": "^19.2.3",
      "@vitejs/plugin-react": "^5.1.4",
      "typescript": "^6.0.3",
      "vite": "^8.1.3"
    }
  }
  ```

  Add scripts without removing the current scripts:

  ```json
  {
    "dev:react": "vite --host 127.0.0.1 --config vite.config.ts index.react.html",
    "build:react": "npm run build:wasm && tsc -p tsconfig.json && vite build --config vite.config.ts"
  }
  ```

- [ ] **Step 2: Install dependencies**

  Run from `apps/pile-plan-studio`:

  ```powershell
  npm install
  ```

  Expected: `package-lock.json` updates and installation completes without dependency resolution errors.

- [ ] **Step 3: Enable React TypeScript**

  Update `apps/pile-plan-studio/tsconfig.json` so `compilerOptions` includes:

  ```json
  {
    "jsx": "react-jsx"
  }
  ```

  Update `include` to:

  ```json
  ["src", "src-react", "../../sample_project/*.json"]
  ```

- [ ] **Step 4: Add node config for Vite**

  Create `apps/pile-plan-studio/tsconfig.node.json`:

  ```json
  {
    "compilerOptions": {
      "composite": true,
      "skipLibCheck": true,
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "allowSyntheticDefaultImports": true,
      "strict": true
    },
    "include": ["vite.config.ts"]
  }
  ```

- [ ] **Step 5: Add Vite config**

  Create `apps/pile-plan-studio/vite.config.ts`:

  ```ts
  import { resolve } from "node:path";
  import { defineConfig } from "vite";
  import react from "@vitejs/plugin-react";

  export default defineConfig({
    plugins: [react()],
    clearScreen: false,
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: false,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
    build: {
      rollupOptions: {
        input: {
          vanilla: resolve(__dirname, "index.html"),
          react: resolve(__dirname, "index.react.html"),
        },
      },
    },
  });
  ```

- [ ] **Step 6: Add the React HTML entry**

  Create `apps/pile-plan-studio/index.react.html`:

  ```html
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Pile Plan Studio React Preview</title>
    </head>
    <body>
      <main id="root"></main>
      <script type="module" src="/src-react/main.tsx"></script>
    </body>
  </html>
  ```

- [ ] **Step 7: Add a minimal React app**

  Create `apps/pile-plan-studio/src-react/main.tsx`:

  ```tsx
  import React from "react";
  import ReactDOM from "react-dom/client";
  import App from "./App";
  import "./App.css";

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  ```

  Create `apps/pile-plan-studio/src-react/App.tsx`:

  ```tsx
  export default function App() {
    return (
      <div className="react-preview-shell">
        <header className="react-preview-header">Pile Plan Studio</header>
        <main className="react-preview-main">
          <aside className="react-preview-left">Project Explorer</aside>
          <section className="react-preview-workspace">OpenAEC React preview</section>
          <aside className="react-preview-right">Properties</aside>
        </main>
      </div>
    );
  }
  ```

  Create `apps/pile-plan-studio/src-react/App.css`:

  ```css
  html,
  body,
  #root {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  .react-preview-shell {
    display: grid;
    grid-template-rows: 40px 1fr;
    width: 100%;
    height: 100%;
    font-family: Inter, system-ui, sans-serif;
    color: #36363e;
    background: #fafaf9;
  }

  .react-preview-header {
    display: flex;
    align-items: center;
    padding: 0 12px;
    border-bottom: 1px solid #e7e5e4;
    font-weight: 700;
  }

  .react-preview-main {
    display: grid;
    grid-template-columns: 240px 1fr 360px;
    min-height: 0;
  }

  .react-preview-left,
  .react-preview-right {
    padding: 12px;
    border-color: #e7e5e4;
    background: #f5f5f4;
  }

  .react-preview-left {
    border-right: 1px solid #e7e5e4;
  }

  .react-preview-right {
    border-left: 1px solid #e7e5e4;
  }

  .react-preview-workspace {
    display: grid;
    place-items: center;
    min-width: 0;
  }
  ```

- [ ] **Step 8: Verify both app entries**

  Run:

  ```powershell
  npm test
  npx tsc --noEmit
  npm run build:react
  ```

  Expected: all existing tests pass, TypeScript passes, React build succeeds, current `index.html` remains unchanged.

- [ ] **Step 9: Commit**

  ```powershell
  git add apps/pile-plan-studio/package.json apps/pile-plan-studio/package-lock.json apps/pile-plan-studio/tsconfig.json apps/pile-plan-studio/tsconfig.node.json apps/pile-plan-studio/vite.config.ts apps/pile-plan-studio/index.react.html apps/pile-plan-studio/src-react
  git commit -m "chore: add parallel React app entry"
  ```

---

### Task 2: Copy And Adapt The OpenAEC Shell

**Files:**
- Create/Modify: `apps/pile-plan-studio/src-react/themes.css`
- Create/Modify: `apps/pile-plan-studio/src-react/store.ts`
- Create/Modify: `apps/pile-plan-studio/src-react/components/template/*`
- Create/Modify: `apps/pile-plan-studio/src-react/i18n/*`
- Modify: `apps/pile-plan-studio/src-react/App.tsx`
- Modify: `apps/pile-plan-studio/src-react/main.tsx`

**Interfaces:**
- Produces: `App` with title bar, ribbon, left project explorer, central workspace, right properties panel, and status bar.
- Consumes: OpenAEC template files from `OpenAEC-style-book-main/OpenAEC-style-book-main/project-templates/Tauri+React/src`.

- [ ] **Step 1: Copy required template files**

  Copy these from the local template into `src-react`:

  ```text
  themes.css
  store.ts
  components/TitleBar.tsx
  components/TitleBar.css
  components/StatusBar.tsx
  components/StatusBar.css
  components/Modal.tsx
  components/Modal.css
  components/ThemedSelect.tsx
  components/ThemedSelect.css
  components/ribbon/*
  components/backstage/*
  components/settings/*
  i18n/*
  ```

  Place them under `apps/pile-plan-studio/src-react/components/template` when they are generic shell components, and update imports accordingly.

- [ ] **Step 2: Replace template demo labels**

  In copied title/ribbon/backstage/i18n files, replace template app labels with:

  ```text
  Pile Plan Studio
  ```

  Remove or disable demo-only ribbon buttons that do not have a Pile Plan Studio action.

- [ ] **Step 3: Compose the shell**

  Update `apps/pile-plan-studio/src-react/App.tsx` to render:

  ```tsx
  import "./themes.css";
  import "./App.css";
  import TitleBar from "./components/template/TitleBar";
  import Ribbon from "./components/template/ribbon/Ribbon";
  import StatusBar from "./components/template/StatusBar";

  export default function App() {
    return (
      <div className="app-shell" data-testid="openaec-shell">
        <TitleBar />
        <Ribbon />
        <div className="app-content">
          <aside className="project-explorer" aria-label="Project explorer">
            <h2>Project</h2>
          </aside>
          <main className="workspace" aria-label="Pile plan workspace">
            <div className="workspace-placeholder">Pile plan viewer</div>
          </main>
          <aside className="properties-panel" aria-label="Properties">
            <h2>Properties</h2>
          </aside>
        </div>
        <StatusBar />
      </div>
    );
  }
  ```

  Adjust prop names to match the copied template components rather than forcing the exact snippet.

- [ ] **Step 4: Import i18n and themes**

  In `src-react/main.tsx`, import the i18n config before rendering:

  ```tsx
  import "./i18n/config";
  ```

  Ensure `themes.css` loads before layout CSS.

- [ ] **Step 5: Verify shell build**

  Run:

  ```powershell
  npm run build:react
  ```

  Expected: React shell builds, no missing component imports, no unused demo components required by the build.

- [ ] **Step 6: Commit**

  ```powershell
  git add apps/pile-plan-studio/src-react apps/pile-plan-studio/package.json apps/pile-plan-studio/package-lock.json
  git commit -m "feat: add OpenAEC React shell"
  ```

---

### Task 3: Add A React Project State Adapter

**Files:**
- Create: `apps/pile-plan-studio/src-react/domain/projectState.ts`
- Create: `apps/pile-plan-studio/src-react/domain/projectState.test.ts`
- Modify: `apps/pile-plan-studio/src-react/App.tsx`

**Interfaces:**
- Produces: `createInitialProjectState(): ProjectState`
- Produces: `ProjectState` containing loaded project data, selected load point ids, selected CPT id, right panel mode, viewport, active pile sizes, active pile tip levels, filters, and sort state.
- Consumes: current helpers from `apps/pile-plan-studio/src/projectFile.ts`, `projectTypes.ts`, `selectionState.ts`, `viewport.ts`, `pileOptionTable.ts`, and `optimizationSettings.ts`.

- [ ] **Step 1: Write the state test**

  Create `src-react/domain/projectState.test.ts`:

  ```ts
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { createInitialProjectState } from "./projectState";

  describe("createInitialProjectState", () => {
    it("loads the sample project and selects the first load point", () => {
      const state = createInitialProjectState();

      assert.ok(state.loadPoints.length > 0);
      assert.ok(state.cpts.length > 0);
      assert.equal(state.selectedLoadPointIds.length, 1);
      assert.equal(state.selectedLoadPointIds[0], state.loadPoints[0].id);
      assert.equal(state.rightPanelMode, "load-point");
    });
  });
  ```

- [ ] **Step 2: Add the adapter**

  Create `src-react/domain/projectState.ts`:

  ```ts
  import sampleProjectText from "../../../../sample_project/sample_project.ifcpp?raw";
  import { createEmptyPileOptionFilters } from "../../src/pileOptionTable";
  import { loadIfcppProjectData } from "../../src/projectFile";
  import type { LoadedProjectData } from "../../src/projectFile";
  import type { RightPanelMode } from "../../src/selectionState";
  import type { Viewport } from "../../src/viewport";

  export type ProjectState = LoadedProjectData & {
    selectedLoadPointIds: number[];
    selectedCptId: number | null;
    rightPanelMode: RightPanelMode;
    viewport: Viewport;
    pileOptionFilters: ReturnType<typeof createEmptyPileOptionFilters>;
  };

  export function createInitialProjectState(): ProjectState {
    const projectData = loadIfcppProjectData(sampleProjectText);
    return {
      ...projectData,
      selectedLoadPointIds: projectData.loadPoints[0] ? [projectData.loadPoints[0].id] : [],
      selectedCptId: null,
      rightPanelMode: "load-point",
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      pileOptionFilters: createEmptyPileOptionFilters(),
    };
  }
  ```

- [ ] **Step 3: Render sample counts in the shell**

  In `App.tsx`, call `createInitialProjectState()` and render:

  ```tsx
  <span>{state.loadPoints.length} load points</span>
  <span>{state.cpts.length} CPTs</span>
  ```

  Put this in the status bar or central placeholder so the React shell proves it can load the sample project.

- [ ] **Step 4: Add the React tests to the test command**

  Update package script:

  ```json
  "test": "node --test src/*.test.ts src-react/**/*.test.ts"
  ```

- [ ] **Step 5: Verify**

  Run:

  ```powershell
  npm test
  npm run build:react
  ```

  Expected: state adapter test passes and React preview builds.

- [ ] **Step 6: Commit**

  ```powershell
  git add apps/pile-plan-studio/package.json apps/pile-plan-studio/src-react
  git commit -m "feat: connect React shell to sample project state"
  ```

---

### Task 4: Port The Viewer Skeleton And Legend

**Files:**
- Create: `apps/pile-plan-studio/src-react/components/domain/PilePlanWorkspace.tsx`
- Create: `apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.tsx`
- Create: `apps/pile-plan-studio/src-react/components/domain/Legend.tsx`
- Create: `apps/pile-plan-studio/src-react/components/domain/viewer.css`
- Create: `apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.test.ts`
- Modify: `apps/pile-plan-studio/src-react/App.tsx`
- Modify: `apps/pile-plan-studio/src-react/domain/projectState.ts`

**Interfaces:**
- Produces: `PilePlanWorkspace({ state, onStateChange })`
- Produces: `PilePlanViewer({ state, onStateChange })`
- Produces: `Legend({ state, onStateChange })`
- Consumes: existing helpers `viewerGeometry.ts`, `viewport.ts`, `legend.ts`, `legendSelection.ts`, `mapMarkerLayer.ts`, `loadPointMarker.ts`, `pileSymbols.ts`.

- [ ] **Step 1: Write a rendering test for the viewer skeleton**

  Create `PilePlanViewer.test.ts` with a pure props-level test:

  ```ts
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { createInitialProjectState } from "../../domain/projectState";

  describe("PilePlanViewer inputs", () => {
    it("has load points, CPTs, and bounds available for rendering", () => {
      const state = createInitialProjectState();
      assert.ok(state.loadPoints.length > 0);
      assert.ok(state.cpts.length > 0);
      assert.ok(state.bounds.maxX > state.bounds.minX);
      assert.ok(state.bounds.maxY > state.bounds.minY);
    });
  });
  ```

- [ ] **Step 2: Create `PilePlanWorkspace`**

  Render the legend above the viewer and keep total cost/zoom near the toolbar/status area:

  ```tsx
  import type { ProjectState } from "../../domain/projectState";
  import Legend from "./Legend";
  import PilePlanViewer from "./PilePlanViewer";
  import "./viewer.css";

  type Props = {
    state: ProjectState;
    onStateChange: (nextState: ProjectState) => void;
  };

  export default function PilePlanWorkspace({ state, onStateChange }: Props) {
    return (
      <section className="pile-plan-workspace">
        <Legend state={state} onStateChange={onStateChange} />
        <PilePlanViewer state={state} onStateChange={onStateChange} />
      </section>
    );
  }
  ```

- [ ] **Step 3: Create `Legend`**

  Use `getLegendItems`, `toggleActivePileConfiguration`, and `toggleLegendSelectionFilter` from existing helpers. Keep behavior equivalent to the current app: size and tip toggles remain visible, inactive items are dimmed, and shift-click selection filters remain highlighted.

- [ ] **Step 4: Create `PilePlanViewer`**

  Port only static rendering first:

  - render SVG or HTML markers for load points;
  - render CPTs as inverted triangles;
  - render selected load point marker outline;
  - render governing CPT highlight if available from state;
  - use `projectPoint` and `getProjectBounds` helpers.

  Do not port pan/zoom/lasso in this task.

- [ ] **Step 5: Replace the workspace placeholder**

  In `App.tsx`, render:

  ```tsx
  <PilePlanWorkspace state={state} onStateChange={setState} />
  ```

- [ ] **Step 6: Verify**

  Run:

  ```powershell
  npm test
  npm run build:react
  ```

  Open React preview and manually verify that load points and CPTs appear.

- [ ] **Step 7: Commit**

  ```powershell
  git add apps/pile-plan-studio/src-react
  git commit -m "feat: port pile plan viewer skeleton to React"
  ```

---

### Task 5: Port Viewer Interactions

**Files:**
- Modify: `apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.tsx`
- Modify: `apps/pile-plan-studio/src-react/components/domain/viewer.css`
- Create: `apps/pile-plan-studio/src-react/components/domain/viewerInteractions.test.ts`

**Interfaces:**
- Consumes: `mapInteraction.ts`, `lassoSelection.ts`, `selectionState.ts`, `viewport.ts`.
- Produces: React event handlers for pan, zoom around cursor, click select/deselect, shift-click add/remove, and shift-drag lasso.

- [ ] **Step 1: Write interaction tests for reused pure helpers**

  Create `viewerInteractions.test.ts`:

  ```ts
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { addLoadPointsToSelection, selectLoadPoint } from "../../../src/selectionState";

  describe("React viewer selection behavior", () => {
    it("can toggle a selected load point through shared selection helpers", () => {
      const base = {
        selectedLoadPointId: 1,
        selectedLoadPointIds: [1],
        selectedCptId: null,
        rightPanelMode: "load-point" as const,
      };

      const next = addLoadPointsToSelection(base, [1], { toggle: true });
      assert.deepEqual(next.selectedLoadPointIds, []);
    });

    it("clears the selected CPT when a different load point is selected", () => {
      const base = {
        selectedLoadPointId: 1,
        selectedLoadPointIds: [1],
        selectedCptId: 64,
        rightPanelMode: "cpt" as const,
      };

      const next = selectLoadPoint(base, 2);
      assert.equal(next.selectedCptId, null);
      assert.deepEqual(next.selectedLoadPointIds, [2]);
    });
  });
  ```

- [ ] **Step 2: Add pan and zoom**

  In `PilePlanViewer`, attach:

  - `onWheel` to call `zoomViewportAtPoint`;
  - pointer down/move/up for left-button pan;
  - click detection threshold so a drag does not select.

- [ ] **Step 3: Add selection behavior**

  Implement:

  - normal click on load point selects only that load point;
  - shift-click toggles membership of the clicked load point;
  - click on empty viewer clears selected load points and selected CPT;
  - Escape clears selected load points and selected CPT.

- [ ] **Step 4: Add lasso behavior**

  Implement shift-drag rectangle and select all load points inside it using `getPointIdsInRectangle`.

- [ ] **Step 5: Verify**

  Run:

  ```powershell
  npm test
  npm run build:react
  ```

  Manual verification:

  - cursor-centered zoom works;
  - left-button pan works;
  - shift-click toggles load point selection;
  - shift-drag lasso selects multiple load points;
  - Escape clears selection.

- [ ] **Step 6: Commit**

  ```powershell
  git add apps/pile-plan-studio/src-react
  git commit -m "feat: port viewer interactions to React"
  ```

---

### Task 6: Port Right Panel Modes And Tables

**Files:**
- Create: `apps/pile-plan-studio/src-react/components/domain/RightPanel.tsx`
- Create: `apps/pile-plan-studio/src-react/components/domain/LoadPointPanel.tsx`
- Create: `apps/pile-plan-studio/src-react/components/domain/CptPanel.tsx`
- Create: `apps/pile-plan-studio/src-react/components/domain/CptSettingsPanel.tsx`
- Create: `apps/pile-plan-studio/src-react/components/domain/CostSettingsPanel.tsx`
- Create: `apps/pile-plan-studio/src-react/components/domain/OptimizationPanel.tsx`
- Create: `apps/pile-plan-studio/src-react/components/domain/rightPanel.css`
- Create: `apps/pile-plan-studio/src-react/components/domain/rightPanel.test.ts`
- Modify: `apps/pile-plan-studio/src-react/App.tsx`

**Interfaces:**
- Produces: four always-visible right-panel mode buttons: Load point, CPTs, CPT settings, Cost settings, plus Optimization as a fifth if the current app needs it visible.
- Consumes: `pileOptionTable.ts`, `pileOptionAggregation.ts`, `pileOptionStatus.ts`, `cptSelectionTable.ts`, `rightPanelView.ts`, `optimizationSettings.ts`, `optimizationSummary.ts`, `projectCostSummary.ts`.

- [ ] **Step 1: Write panel model test**

  Create `rightPanel.test.ts`:

  ```ts
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { createInitialProjectState } from "../../domain/projectState";
  import { aggregatePileOptionsForLoadPoints } from "../../../src/pileOptionAggregation";

  describe("React right panel data", () => {
    it("can aggregate pile options for the selected load points", () => {
      const state = createInitialProjectState();
      const selectedId = state.selectedLoadPointIds[0];
      assert.equal(typeof selectedId, "number");

      const aggregated = aggregatePileOptionsForLoadPoints([
        [
          {
            pile_size_mm: 290,
            pile_tip_level_m: -17.5,
            isOption: true,
            governing_cpt_id: 64,
            governing_frd_kn: 693,
            utilization: 0.72,
            missing_cpt_ids: [],
          },
        ],
      ]);

      assert.equal(selectedId, state.loadPoints[0].id);
      assert.equal(aggregated.length, 1);
      assert.equal(aggregated[0].isOption, true);
    });
  });
  ```

- [ ] **Step 2: Add `RightPanel`**

  Render mode buttons at the top and switch the body by `state.rightPanelMode`.

- [ ] **Step 3: Port load point pile options**

  Port:

  - pile option rows;
  - symbol column without header text;
  - columns in order: Symbol, Size, Tip, Status, Cost, Use/Use (Avg), Governing, FRD min;
  - filter menus with multi-column filters;
  - sorting;
  - Missing status and dash values for missing/not-ok FRD and use;
  - applying a clicked pile option to all selected load points.

- [ ] **Step 4: Port CPT panel**

  Port:

  - single selected CPT FRD table;
  - multi-load-point selected CPT union list;
  - clickable CPT references from load point tables;
  - return behavior through the always-visible mode buttons.

- [ ] **Step 5: Port settings panels**

  Port:

  - CPT selection settings, including manual selection edit/save;
  - cost settings with persisted default costs;
  - optimization settings with sliders and active legend toggles.

- [ ] **Step 6: Verify**

  Run:

  ```powershell
  npm test
  npm run build:react
  ```

  Manual verification:

  - right panel can shrink to the current minimum;
  - Cost remains visible and Notes is absent;
  - multi-selection common options match the current app;
  - selected CPT data appears when a CPT is clicked.

- [ ] **Step 7: Commit**

  ```powershell
  git add apps/pile-plan-studio/src-react
  git commit -m "feat: port right panel workflow to React"
  ```

---

### Task 7: Port Project Actions, Import, Save, And Download

**Files:**
- Create: `apps/pile-plan-studio/src-react/components/domain/ImportDialog.tsx`
- Create: `apps/pile-plan-studio/src-react/components/domain/importDialog.css`
- Modify: `apps/pile-plan-studio/src-react/components/template/backstage/*`
- Modify: `apps/pile-plan-studio/src-react/components/template/ribbon/*`
- Modify: `apps/pile-plan-studio/src-react/domain/projectState.ts`

**Interfaces:**
- Consumes: `importFiles.ts`, `projectFile.ts`, `coreClient.ts`.
- Produces: React actions for opening sample project, importing three source files, saving/downloading IFCPP, and showing import validation messages.

- [ ] **Step 1: Add import dialog state**

  Extend `ProjectState` with:

  ```ts
  isImportDialogOpen: boolean;
  importMessage: string | null;
  ```

- [ ] **Step 2: Port import file assignment UI**

  Reuse:

  - `emptyImportFileAssignments`;
  - `inferImportFileAssignments`;
  - `areImportFileAssignmentsComplete`;
  - `importProjectFromFilesCore`.

  UI must allow selecting three files at once and assigning each file to a role.

- [ ] **Step 3: Wire project ribbon/backstage commands**

  Add real handlers:

  - Import from Excel opens `ImportDialog`;
  - Save uses Tauri command path where available;
  - Download IFCPP uses browser download path in browser preview;
  - Open project uses Tauri dialog where available.

- [ ] **Step 4: Verify**

  Run:

  ```powershell
  npm test
  npm run build:react
  ```

  Manual verification:

  - import dialog opens;
  - three-file role assignment works;
  - imported project appears in the React viewer;
  - download IFCPP creates a file in browser preview.

- [ ] **Step 5: Commit**

  ```powershell
  git add apps/pile-plan-studio/src-react
  git commit -m "feat: port project import and IFCPP actions to React"
  ```

---

### Task 8: Add React Tauri Preview And Final Swap

**Files:**
- Modify: `apps/pile-plan-studio/index.html`
- Modify: `apps/pile-plan-studio/package.json`
- Modify: `apps/pile-plan-studio/src-tauri/tauri.conf.json`
- Modify: `apps/pile-plan-studio/src-tauri/Cargo.toml` only if template plugins require registration.
- Modify: `apps/pile-plan-studio/src-tauri/src/main.rs` or `lib.rs` only if template plugins require registration.

**Interfaces:**
- Produces: `npm run dev` starts the React app after the swap.
- Produces: Tauri desktop build uses the React app after the swap.
- Keeps: the old Vanilla TypeScript files until at least one release candidate build confirms parity.

- [ ] **Step 1: Add Tauri plugin setup if needed**

  If `@tauri-apps/plugin-store` is used by the copied OpenAEC shell, add the matching Rust plugin dependency and initialize it in Tauri.

  Expected Rust-side registration:

  ```rust
  .plugin(tauri_plugin_store::Builder::new().build())
  ```

  Add only plugins that are actually used.

- [ ] **Step 2: Switch `index.html` to React**

  Change:

  ```html
  <main id="app"></main>
  <script type="module" src="/src/main.ts"></script>
  ```

  to:

  ```html
  <main id="root"></main>
  <script type="module" src="/src-react/main.tsx"></script>
  ```

- [ ] **Step 3: Update scripts**

  In `package.json`, make:

  ```json
  "dev": "vite --host 127.0.0.1",
  "build": "npm run build:wasm && tsc && vite build"
  ```

  continue to work with the React entry. Keep `dev:vanilla` and `build:vanilla` temporarily if useful:

  ```json
  "dev:vanilla": "vite --host 127.0.0.1 index.html",
  "build:vanilla": "npm run build:wasm && tsc && vite build index.html"
  ```

- [ ] **Step 4: Verify browser and desktop**

  Run:

  ```powershell
  npm test
  npm run build
  npm run tauri build
  ```

  Expected:

  - all tests pass;
  - production frontend builds;
  - desktop executable builds;
  - app opens to the OpenAEC React shell;
  - sample project loads.

- [ ] **Step 5: Manual parity checklist**

  Verify:

  - initial sample project view;
  - load point click selection;
  - shift-click and lasso multi-selection;
  - pan and cursor-centered zoom;
  - CPT selection and FRD table;
  - governing CPT highlight;
  - pile option table filters and sort;
  - applying pile option to multiple load points;
  - legend toggles;
  - greedy optimization with restricted active sizes/tips;
  - total cost display;
  - import from three files;
  - download IFCPP;
  - right panel resizing.

- [ ] **Step 6: Commit**

  ```powershell
  git add apps/pile-plan-studio
  git commit -m "feat: switch Pile Plan Studio to OpenAEC React shell"
  ```

---

## Self-Review

- Spec coverage: covered parallel migration, OpenAEC shell, left project explorer, Rust/WASM boundary, browser preview, postponed dark theme, import/export, viewer, panels, and final swap.
- Placeholder scan: no implementation step relies on an unspecified future placeholder; some snippets explicitly say to adapt prop names to copied template components where the exact local API is determined by copied files.
- Type consistency: `ProjectState`, `createInitialProjectState`, `PilePlanWorkspace`, `PilePlanViewer`, `Legend`, and `RightPanel` are introduced before use.
- Scope: the plan is intentionally split into feature-parity tasks. It does not add new product features beyond the migration.
