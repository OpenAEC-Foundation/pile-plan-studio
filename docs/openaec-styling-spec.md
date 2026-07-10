# OpenAEC Template Migration Spec

## Purpose

Move Pile Plan Studio toward the OpenAEC Foundation desktop application
standard by adopting the local `Tauri+React` template as much as practical.
This is no longer a CSS-only styling pass over the current Vanilla TypeScript
viewer. The target is a React + Tauri application shell with the existing Rust
and WASM calculation core preserved.

The app should keep its engineering focus: the pile plan viewer remains the
primary work surface, and the OpenAEC shell should make project operations,
settings, optimization, status feedback, and future file workflows feel like
one coherent desktop tool.

## Local References

The downloaded style book is available locally at:

- `OpenAEC-style-book-main/OpenAEC-style-book-main/`

This folder is reference material only and is ignored by git. Copy only the
template files, assets, tokens, or adapted code that are intentionally needed
inside the application.

Relevant reference files:

- `brandbook/DESIGN-SYSTEM.md`
- `brandbook/LAYOUTS.md`
- `project-templates/Tauri+React/README.md`
- `project-templates/Tauri+React/INTEGRATION.md`
- `project-templates/Tauri+React/COMPONENT-MANIFEST.md`
- `migratie-instructies.md`

## Direction

Use the OpenAEC `Tauri+React` template as the structural target:

- custom desktop title bar;
- ribbon toolbar;
- backstage view for project/file operations;
- resizable side panels;
- status bar;
- OpenAEC themes and design tokens;
- English and Dutch i18n structure;
- persistent user preferences through the Tauri store.

Pile Plan Studio supplies the domain components:

- pile plan viewer;
- load point and CPT panels;
- pile option tables;
- CPT, cost, and optimization settings;
- import and IFCPP workflows;
- sample project browser preview.

## Goals

1. Migrate the frontend from Vanilla TypeScript to React using the OpenAEC
   `Tauri+React` template as the base shell.
2. Preserve the existing Rust core as the source of calculation truth.
3. Keep the browser preview working through the Rust/WASM path.
4. Rebuild the current user-facing functionality as React domain components.
5. Use OpenAEC tokens, themes, typography, ribbon, backstage, panels, and
   status bar conventions where they fit.
6. Avoid introducing a second calculation implementation in TypeScript.

## Non-Goals

- No redesign of the Rust project model, IFCPP schema, or calculation rules in
  this migration.
- No new optimizer logic, CPT selection logic, or import behavior unless needed
  to reconnect existing behavior.
- No marketing landing page or hero screen.
- No attempt to make the local style book folder part of this repository.
- No direct IFC workflow integration in this step.

## Architecture

### Migration Strategy

Build the React + OpenAEC template version in parallel with the current
frontend. Keep the current app usable while the React version reaches feature
parity, then swap the active frontend once the viewer, panels, import/export,
and project state workflows are equivalent.

This avoids breaking the current alpha workflow while still allowing the new
app to follow the OpenAEC template cleanly instead of being constrained by the
Vanilla TypeScript layout.

### Shell

The OpenAEC template owns application chrome:

- `TitleBar` for window controls and quick access actions;
- `Ribbon` for grouped commands;
- `Backstage` for open/import/save/export/settings level actions;
- `StatusBar` for project state, selection count, zoom, and calculation status;
- left/right panels where useful, with the pile plan viewer as the central
  workspace.

For Pile Plan Studio, include the left project explorer from the start so the
layout matches the OpenAEC shell. It may initially be empty or contain only a
placeholder project tree. The right panel remains the main properties/settings
surface.

### Domain UI

The existing viewer and panels should be split into focused React components:

- `PilePlanWorkspace`
- `PilePlanViewer`
- `Legend`
- `RightPanel`
- `LoadPointPanel`
- `CptPanel`
- `CptSettingsPanel`
- `CostSettingsPanel`
- `OptimizationPanel`
- `ImportDialog`

The current behavior can be ported incrementally, but the target state should
avoid one large frontend file.

### Core Boundary

The core remains responsible for:

- project model and IFCPP read/write;
- Excel import parsing and validation;
- CPT selection;
- pile options;
- cost calculation;
- greedy optimization;
- derived summaries for selected load points and CPTs.

React is responsible for:

- rendering;
- user interaction;
- selection state;
- panel state;
- calling Tauri commands or WASM functions;
- presenting validation errors and status feedback.

Where browser preview needs calculations, it should call the WASM build of the
same Rust core. The desktop app should call Tauri commands backed by the same
core modules.

## Template Adoption Rules

- Keep the template shell structure unless there is a clear Pile Plan Studio
  reason to simplify it.
- Replace demo ribbon tabs with project-specific tabs.
- Every ribbon button must have a real action or be hidden until available.
- Keep OpenAEC theme variables and use domain tokens for pile/CPT data colors.
- Do not use OpenAEC amber for pile tip colors or other data encodings.
- Keep the local stylebook folder ignored; copy adapted files into the app only
  when they become part of Pile Plan Studio.

## Proposed Ribbon Structure

### Project

- Open project
- Import from Excel
- Save
- Save as
- Download IFCPP / export where relevant

### Plan

- Load point information
- CPT information
- CPT settings
- Cost settings
- Optimization settings

### Optimize

- Run greedy optimization
- Optimize all load points
- Optimize selected load points
- Reset/clear selected piles if needed later

### View

- Fit project
- Zoom controls
- Toggle legend groups
- Show/hide side panels

This structure can be refined during implementation, but it gives each current
workflow a natural OpenAEC home.

## Migration Phases

### Phase 1: Prepare The React Template Shell

- Create a parallel React + Vite frontend based on the OpenAEC template.
- Bring in the required OpenAEC template shell files.
- Configure package dependencies and TypeScript.
- Keep existing Tauri and Rust workspace structure intact where possible.
- Include the left project explorer shell from the start, even if it is empty.
- Copy or bundle font assets during implementation if needed for reliable
  packaging; otherwise use the template font loading approach during
  development.
- Confirm the app opens with a minimal React shell.

### Phase 2: Connect Rust/WASM Project Loading

- Keep the current sample project path working.
- Connect React state to the existing Rust/WASM project payload.
- Verify that project data, settings, selections, costs, and optimization data
  still roundtrip through the existing core route.

### Phase 3: Port The Viewer

- Port canvas/SVG viewer rendering into React.
- Preserve pan, zoom, click selection, shift selection, lasso selection, legend
  toggles, CPT selection, and governing CPT highlighting.
- Keep performance acceptable before adding additional visual polish.

### Phase 4: Port Panels And Tables

- Port the right-panel modes:
  - load point pile options;
  - CPT information;
  - CPT settings;
  - cost settings;
  - optimization settings.
- Preserve sorting, filtering, compact table widths, and multi-load-point
  common option behavior.

### Phase 5: Port Import And IFCPP Commands

- Move import/open/save/download UI into OpenAEC backstage or project ribbon
  actions.
- Keep browser preview fallback for sample project use.
- Keep desktop file dialogs in Tauri.

### Phase 6: OpenAEC Visual QA

- Apply OpenAEC tokens and theme variables consistently.
- Verify light theme first.
- Postpone dark theme until after the alpha workflow is stable.
- Compare against the template screenshots and style book guidance.

## Testing

Automated verification should include:

- Rust tests for project model, IFCPP, import, calculations, and optimization;
- WASM build verification;
- TypeScript type checking;
- React component tests where they protect important behavior;
- production build;
- Tauri build before alpha packaging.

Manual verification should cover:

- sample project opens in browser preview;
- sample project opens in desktop app;
- load point selection and multi-selection;
- CPT selection and CPT table;
- pile option filtering and sorting;
- legend toggles;
- optimizer with restricted size/tip toggles;
- import from the three current source files;
- save/open IFCPP roundtrip;
- right panel resizing.

## Risks

- A full React/template migration is larger than a styling pass and can disrupt
  stable viewer behavior.
- The viewer is interaction-heavy; porting it should be done before cosmetic
  refinements so regressions are visible early.
- OpenAEC shell patterns add useful structure, but unnecessary demo features
  from the template should be removed.
- Duplicating calculations during migration would make correctness harder to
  reason about; the Rust core must remain the single source of truth.

## Decisions

- Follow the OpenAEC `Tauri+React` template as much as practical.
- Develop the React template version in parallel and swap once feature parity is
  reached.
- Use React for the frontend shell and domain UI.
- Keep Rust/WASM as the calculation core.
- Keep the browser preview as a development tool, backed by WASM.
- Include the project explorer on the left from the start; it may initially be
  empty.
- Copy or bundle fonts during implementation if needed.
- Postpone dark theme.
- Ignore the local stylebook folder in git.
- Preserve the current alpha functionality before adding new features.
