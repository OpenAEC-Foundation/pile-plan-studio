# Architecture

Pile Plan Studio follows the OpenAEC application model:

- Rust contains the domain core: CPT selection, bearing-capacity checks, pile
  option calculation, cost calculation, and project data operations.
- Tauri exposes the Rust core to the desktop application through native
  commands.
- TypeScript is kept as the viewer layer: UI state, map interaction, rendering,
  formatting, symbols, and browser-specific presentation behavior.
- The frontend calls the Rust core through `@tauri-apps/api/core` commands when
  it runs inside Tauri.
- The browser build uses `crates/pile-plan-wasm`, a thin WebAssembly wrapper
  around the same Rust core. This keeps the Vite preview aligned with the
  desktop calculation model.

The guiding rule is that engineering decisions must be implemented and tested in
`crates/pile-plan-core` first. Frontend code may present results, but should not
be the source of truth for calculations.

## Frontend module boundaries

The React application is divided by responsibility rather than by runtime:

- `App.tsx` owns startup and installs `app/session/AppSession.tsx` only after
  the core and user settings are ready;
- `app/session/` composes the active application session, `app/derived-state/`
  owns asynchronous Rust-result snapshots and stale-request protection, and
  `app/project/` coordinates project lifecycle transitions;
- `core/*Client.ts` contains the platform adapters. `coreClient.ts` is the
  stable facade, and the project, analysis, and pile-plan clients choose the
  browser/WASM or desktop/Tauri transport without making engineering choices;
- `domain/` contains pure immutable application and presentation logic grouped
  by feature: `project/` (including `history/` and `recovery/`), `pile-plans/`
  (including `optimization/`), `pile-options/`, `legend/`, `cpt-selection/`,
  `source-data/`, `settings/`, and `workspace/`. Only the genuinely shared
  `formatting.ts` remains directly in `domain/`; and
- `components/domain/` owns feature views. Imports, pile-plan editing, project
  dialogs, source-data tables, the right panel, and the plan viewer are grouped
  under `imports/`, `pile-plans/`, `project/`, `source-data/`, `right-panel/`,
  and `pile-plan-viewer/`. Feature-specific models, tests, styles, and controls
  live with their owning view; only reusable view primitives live under
  `components/domain/shared/`.

These boundaries do not move engineering authority into React. CPT selection,
pile-option evaluation, capacity, cost, grouping, assignment, optimization, and
project validation remain authoritative in `crates/pile-plan-core`.

The Rust core is divided into feature modules rather than broad utility or
orchestration catch-alls. Its main grouped subsystems are:

- `import/` owns source profiles, table and RFEM parsing, project construction,
  and refresh reconciliation;
- `pile_options/` owns the advice index, option evaluation and aggregation,
  technical status, cost calculation, and batched option analysis;
- `optimization/` owns optimization-unit preparation and the greedy optimizer;
  and
- `tip_level_regions/` owns load-point topology, Gabriel-graph construction,
  bounded faces, and pile-tip-level region grouping.

Focused top-level modules retain concepts that do not benefit from another
directory layer, such as `cpt_selection.rs`, `load_point_groups.rs`,
`project.rs`, and `technical_assignment.rs`. A generic `analysis` or `spatial`
module is deliberately avoided because it would hide which feature owns the
behavior.

`PileOptionAnalysisResult` is the request-scoped result of
`build_pile_option_analysis`. It is not a persisted project entity and does not
represent every possible project analysis. It combines, for the requested load
points, the selected CPTs and the pile options calculated from those selections.
Callers may additionally request foundation-advice display rows grouped by CPT;
the optional field avoids preparing that presentation data when it is not
needed.

Foundation advice remains stored as flat rows keyed by CPT ID. The batch
orchestrator builds one internal index and reuses it for all requested load
points, so CPTs without advice remain representable without repeated full-row
searches during option calculation.

The detailed ownership audit, including explicit reasons for behavior that
remains in TypeScript, is maintained in
[`docs/domain-ownership.md`](domain-ownership.md).

Canonical project persistence follows one boundary in both runtimes:

```text
Open: IFCPP text -> Rust migration and validation -> canonical project
                 -> TypeScript hydration -> React state

Save: React project content -> TypeScript project draft -> Rust validation and
                              serialization -> IFCPP text
```

IndexedDB, undo/redo, and dirty-state tracking remain TypeScript application
infrastructure. IndexedDB stores Rust-serialized IFCPP text, restored text uses
the same Rust read path as an opened file, and undo/redo restores project-owned
content before Rust-derived analysis is recalculated.

Pile tip levels remain metre values in IFCPP exchange data and physical
calculations. The Rust core validates those values and produces exact integer
millimetre keys for identity, equality, ordering, and deduplication. WASM and
Tauri pass those keys through unchanged; TypeScript consumes them for discrete
state and applies locale-aware metre formatting only for presentation.

## Runtime Matrix

| Runtime | Core route | Best use |
| --- | --- | --- |
| Browser / Vite | Rust core compiled to WASM | Fast UI checks and web behavior |
| Desktop / Tauri | Native Rust commands | Final desktop behavior, file access, native integration |

Use the browser preview for most visual and interaction work. Use the desktop app
when testing anything that depends on Tauri, local file access, window behavior,
or native integrations.

## Viewer

The plan viewer uses a fixed, uniform project transform and keeps application
scale, layout compensation, and interactive plan zoom as separate layers. This
prevents markers and pointer interactions from drifting when panels resize or
when browser and desktop presentation scales differ.

Within `components/domain/pile-plan-viewer/`, `PilePlanViewer.tsx` composes the
feature, `ViewerStage.tsx` owns the ordered map layers,
`useViewerPointerInteractions.ts` owns selection, hover, lasso, and pan input,
and `useViewerViewport.ts` owns the project transform, layout compensation,
grid alignment, and zoom commits. `viewerDomCoordinates.ts` is the single
browser-coordinate conversion boundary.

The viewer also separates application theming from project drawing semantics.
Panels, controls, and other application chrome use the active `--theme-*`
palette. The plan itself remains a white engineering canvas, so annotations
whose meaning must not change with the application theme use viewer-owned
colors. Related load-point group rings therefore keep the same neutral dark
stroke in light and dark themes instead of inheriting a themed text color.

The implementation invariants, coordinate pipeline, regression symptoms, and
manual test procedure live beside the viewer code in
[`apps/pile-plan-studio/src/viewer/README.md`](../apps/pile-plan-studio/src/viewer/README.md).
