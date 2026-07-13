# React Primary Frontend Migration

## Goal

Make the OpenAEC React application the single official frontend for Pile Plan
Studio. Remove the unused Vanilla TypeScript UI and end with one coherent
`src/` tree whose directory structure reflects current responsibilities rather
than the migration history.

## Current Situation

The application currently has two browser entries:

- `index.html` starts the old Vanilla TypeScript UI from `src/main.ts`;
- `index.react.html` starts the React UI from `src-react/main.tsx`.

The current `src/` directory mixes the old UI entry and styling with reusable
TypeScript contracts, Rust/WASM/Tauri adapters, viewer helpers, formatting, and
selection models. React imports these reusable modules, but it does not depend
on the old DOM-based UI itself.

## Target Structure

The final frontend uses one source root:

```text
apps/pile-plan-studio/
|-- index.html
|-- src/
|   |-- main.tsx
|   |-- App.tsx
|   |-- components/
|   |   |-- domain/
|   |   `-- template/
|   |-- domain/
|   |-- core/
|   |   `-- wasm/
|   |-- viewer/
|   |-- i18n/
|   |-- hooks/
|   |-- styles/
|   `-- store.ts
`-- src-tauri/
```

Responsibilities are divided as follows:

- `components/` contains React components and component-specific presentation
  models;
- `domain/` contains frontend project types, selection models, pile-option
  presentation models, optimization settings, and other framework-independent
  application state helpers;
- `core/` contains the thin client boundary to Rust through WASM or Tauri,
  import contracts, project serialization adapters, and generated WASM output;
- `viewer/` contains geometry, viewport interaction, symbols, marker visual
  models, and legend models;
- `i18n/`, `hooks/`, `styles/`, and `store.ts` retain their normal React
  application roles.

Rust under `crates/` remains the source of truth for calculations, import
validation, pile-option analysis, costs, and greedy optimization.

## Migration Strategy

### 1. Classify Existing Modules

Build an import-reachability inventory from the React entry, frontend tests,
WASM/Tauri adapters, and build configuration. Classify every current `src/`
module as one of:

- reusable application module to retain;
- generated WASM artifact to retain;
- Vanilla UI-only module to remove.

Do not decide based only on the current folder name. A module is removed only
when no retained production entry or retained test depends on it.

### 2. Establish The New `src/` Tree

Move the React application from `src-react/` into `src/`. Move retained modules
from the old `src/` into the target `domain/`, `core/`, or `viewer/` directory.
Update imports mechanically and keep behavior unchanged during this step.

Tests move with the modules they cover. Generated WASM output remains under the
frontend source tree so Vite can bundle it for browser operation.

### 3. Remove The Vanilla UI

Delete the old DOM-based entry, old application-wide UI stylesheet, and any
module proven to be reachable only from that entry. There will be no legacy
browser entry and no dormant duplicate frontend in the production repository.
Git history remains the reference if the old implementation is ever needed.

### 4. Make React Official

Update `index.html` to mount `src/main.tsx`. Configure Vite with one production
entry. The regular commands become authoritative:

- `npm run dev` starts the React browser application;
- `npm run build` type-checks and builds the React application;
- Tauri development and production builds use those same commands and entry;
- temporary `dev:react`, `build:react`, and `index.react.html` are removed.

The normal browser URL becomes `/`, not `/index.react.html`.

### 5. Update Documentation

Update the README and active architecture documentation to describe React as the
frontend, Rust as the calculation core, and WASM/Tauri as the two execution
adapters. Historical migration plans remain in `docs/superpowers/` as records
and do not need to be rewritten.

## Data Flow

React owns interaction and transient view state. It sends typed requests through
`core/` to the same Rust core in both browser and desktop environments. Rust
returns project analysis and optimization results; React maps those results to
viewer and panel presentation models. No calculation logic is introduced as
part of this migration.

IFCPP project behavior, import behavior, persisted pile selections, settings,
and the sample project remain unchanged.

## Error Handling

The migration must preserve the existing guarded asynchronous behavior:

- stale analysis or optimization responses cannot update a newly opened
  project;
- Rust/WASM/Tauri errors remain visible in the relevant React panel;
- project choices remain unchanged after a failed optimization;
- a failed import does not replace the current project.

Build or import-resolution errors encountered while moving modules are fixed at
the import boundary rather than hidden with compatibility aliases that preserve
the old directory layout.

## Testing And Verification

The migration is complete only when:

- no production entry references `src-react`, `index.react.html`, or
  `src/main.ts`;
- no Vanilla UI-only code remains;
- TypeScript compilation passes;
- all frontend tests pass from their new locations;
- the production Vite build succeeds with one HTML entry;
- all Rust and WASM tests pass;
- the browser opens the React app at `/` and completes sample-project analysis;
- a live greedy optimization completes without console errors;
- a Tauri development/build smoke check starts the same React frontend.

## Non-Goals

- Redesigning the React UI;
- changing IFCPP or import schemas;
- changing pile-option, CPT-selection, cost, or optimization algorithms;
- moving frontend presentation logic into Rust;
- preserving a separately runnable Vanilla frontend.
