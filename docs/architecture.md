# Architecture

Open Pile Plan Studio follows the OpenAEC application model:

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

The right panel defaults to a single view. Its optional split view keeps load
points above a compact CPT pane, with independent scrolling and a draggable,
keyboard-accessible divider. The divider ratio is an application preference;
the chosen view and selections remain transient workspace state. Opening a CPT
or editing its selection keeps the split view active. Source tables have a close
button that returns to the active pile plan without changing selection or viewport.

Pile-option column visibility and order are application preferences, stored
separately for single-location and multiple-location selections. Defaults preserve
the existing columns; hidden columns do not participate in filtering or sorting.
Changing this layout does not change project content, undo history, or dirty state.

The Rust core is divided into feature modules rather than broad utility or
orchestration catch-alls. Its main grouped subsystems are:

- `import/` owns source profiles, table and RFEM parsing, project construction,
  and refresh reconciliation;
- `pile_options/` owns the advice index, option evaluation and aggregation,
  technical status, cost calculation, and batched option analysis;
- `optimization/` owns optimization-unit preparation, ILP solving and quick local improvement;
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

Pile options with a governing resistance of zero or less are insufficient,
not usable configurations. They retain the source resistance and governing CPT,
but have no utilization ratio. Missing selected-CPT data still takes precedence
as `missing_capacity_data`; a present nonpositive resistance is not missing data.
Default assignment and both optimizers consume this same core assessment.

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

IFCPP schema 5 stores the automatic load-point grouping settings, manual group
records, explicit separations of automatic groups, and the viewer's group-
visibility toggle. Effective groups and their shared Gabriel topology are
derived by Rust and remain transient. Manual grouping is accepted only when the
selected locations form a connected induced subgraph of that topology. Grouping
is transitively closed, so overlapping automatic and manual connections always
produce one optimization unit. Ungrouping a manual group removes its manual
record; ungrouping an automatic group adds an explicit separation record.

All ordinary marker, additive, and lasso selection expands to complete effective
groups. The member list in the right-panel selection header is the intentional
escape hatch for inspecting one location without changing the group. Assignments,
default choices, technical assessment, and optimization consume the same last
completed effective-group snapshot; a recalculation never exposes an interim
singleton partition.

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
when browser and desktop presentation scales differ. Whole-window and
display-scale changes preserve the project coordinate at the viewer centre;
panel and legend changes preserve the previous screen-position anchor. This
compensation is transient and does not alter the saved project viewport.

Within `components/domain/pile-plan-viewer/`, `PilePlanViewer.tsx` composes the
feature, `ViewerStage.tsx` owns the transformed stage and transparent marker
buttons, `ViewerDrawingSvg.tsx` owns one pointer-inert SVG for all project-
anchored drawing layers, and `viewerMarkerPresentation.ts` derives their
appearance and ordering. The region/group overlays, CPT connections, status
halos, pile/CPT symbols, labels, and selection/hover rings use the same
unrounded SVG coordinates. The HTML buttons retain pointer and keyboard input
without painting a second copy of each marker.
`useViewerPointerInteractions.ts` owns selection, hover, lasso, and pan input,
and `useViewerViewport.ts` owns the project transform, layout compensation,
grid drawing, and zoom commits. `viewerDomCoordinates.ts` is the single
browser-coordinate conversion boundary. The grid uses a viewport-sized canvas
outside the transformed marker stage; each world line is snapped independently
to the global physical-pixel lattice after projection, including the active CSS
scale and device-pixel ratio.

The viewer also separates application theming from project drawing semantics.
Panels, controls, and other application chrome use the active `--theme-*`
palette. The plan itself remains a white engineering canvas, so annotations
whose meaning must not change with the application theme use viewer-owned
colors. Load-point groups of at least two members are drawn from the union of
member circles, internal Gabriel edges, and fully enclosed topology faces. An
outside-only SVG morphology ring preserves concave and L-shaped silhouettes;
it is not a convex hull. Default contours are gray, the selected group contour
is orange, and conflicting assignments use a red contour plus a warning glyph,
so color is never the only conflict signal. These colors remain identical in
light and dark themes instead of inheriting themed text colors.
The orange group contour represents selection of every member. Inspecting one
member from the selection list instead leaves that member's orange ring and
shows the group once in gray, even when the global group display is off.
Hover highlights only the pointed-at member; clicking it selects the group.
Conflicting groups retain their red contour during partial inspection.

The implementation invariants, coordinate pipeline, regression symptoms, and
manual test procedure live beside the viewer code in
[`apps/pile-plan-studio/src/viewer/README.md`](../apps/pile-plan-studio/src/viewer/README.md).

## ILP optimization

The Plan ribbon exposes one Optimize button that opens the Optimization panel.
Run and Quick improve remain in the panel; ILP terminology is confined to method
explanations rather than user-facing titles. The side panel contains
the optimizer settings and plan-specific results. The retired greedy optimizer,
its ribbon group and its native/WASM commands have been removed.
Rust `optimization/ilp/` owns preparation, the shared sparse linear model, typed solver
execution, cost reference caching, cap relaxation and independent
assignment validation. `tip_level_regions/optimization_unit_graph.rs` contracts
the original Gabriel graph without multiplying edges or rebuilding across gaps.

A browser Worker owns its WASM session. Tauri owns one background job with atomic
cancellation and retains the session between runs. `app/optimization/` rejects
stale results; `domain/pile-plans/ilp-optimization/` installs a validated result
immutably as one history change. Stop never installs a partial result.

New projects start with unlimited tip-level, size and configuration counts
(empty limit fields); importing source data does not turn catalog counts into limits.
Saved project limits remain unchanged when reopening a project.
IFCPP settings contain optional `ilp_optimization`; Rust normalizes absent data
from the legacy optimizer with a 5% budget, tip/size weights 1/1 and an unlimited total
configuration count. Target/save/boundary
choices and in-flight results remain transient. Completed plan results are stored
in optional `pile_plans[].ilp_result` (solution, diagnostics, settings, currency and
a versioned content fingerprint). Older plans omit this field. The canonical
project schema is version 5; versions 1–4 migrate on read.
The persisted coherence switch defaults to enabled for older projects. Disabling
it runs only the cost phase; a zero transition objective also skips the spatial
solve. A bounded local improvement of the reference supplies a validated fallback
before the spatial ILP. Only the exact solve (or a zero-score lower-bound proof)
can establish spatial optimality. Applying a result preserves the workspace selection.
The [early performance measurements](designs/2026-09-18-ilp-performance.md) are
a historical record. The current solver and additive weights are described below.

### Native ILP solver

The `pile-plan-core/native-highs` feature is enabled by default for native builds
and by the Tauri shell. Browser WASM disables native default features.
`model.rs` and its small internal `linear_model.rs` builder produce one integer
CSR matrix, exposed through `IlpSolverModel`. There is no secondary Rust solver
or modeling-library dependency. Native HiGHS and browser highs-js consume the
same formulation, with complete initial values for assignment and auxiliary columns.

`highs_backend.rs` encapsulates native callbacks and cooperative interruption;
HiGHS uses one thread with parallel solving off. The browser Worker loads the
pinned `highs` package and its locally bundled WASM asset only on its first run.
`highsBrowserSolver.ts` handles numeric solver transport, warm starts, finite-bound
filtering, status classification and disposal. The WASM session calls this adapter
synchronously through a scoped callback; phase orchestration, deadlines, reference
caching, cap diagnosis and all engineering validation remain in Rust. A candidate
from JavaScript is checked against the matrix, integral domains and independent
assignment validation before it can become a live plan. Solver progress is throttled
to 400 ms, while improved solutions are forwarded immediately. An expired deadline
or missing primal solution never establishes optimality. Temporary HiGHS instances
are disposed even when a callback fails; the Worker retains its Rust cache between
completed runs. Browser stop/cancel terminates the Worker, retaining or discarding
the last validated snapshot respectively.

The UI retains validated snapshots for stop-and-use-best; normal cancellation and
stale-context rejection remain separate. Local-only is a transient run parameter,
not an IFCPP schema change. Live previews project the best validated spatial
assignment into the workspace and explorer, at most once per second. Each snapshot
is derived from the original run state, so a new-plan preview keeps one stable ID.
The preview is runtime-only: save/recovery and history continue to use the real
project. Completion or stop-and-use-best commits once; cancel, stale input, worker
failure and disposal discard the preview. Viewer interactions strip preview plan
fields before updating selection or viewport. Selection changes do not change the
captured optimization targets. The run owns a fixed source and destination plan;
viewing a different plan does not cancel it or redirect subsequent snapshots.
Completing a background run preserves the viewed plan. The sidebar separates the
named ongoing run from the viewed plan's saved result. A stale historical result
remains visible with an explicit warning after assignment or engineering-input
changes; changing future optimizer settings alone does not invalidate it.
Cancellation stays in the running/stopping state until the transport acknowledges
completion, preventing a new run while native HiGHS is still stopping.
Plan editing is disabled during the run; relevant
engineering-input changes still cancel it. The solver runs independently of drawing
and tip-level-region updates.

Native development requires a C++ toolchain, CMake and libclang (for bindgen).
Windows builds should use a short `CARGO_TARGET_DIR` to avoid MSBuild path limits.
For this checkout, the repository-level `target` directory works. Set
`CMAKE_GENERATOR="Visual Studio 17 2022"` if CMake selects an unavailable VS version,
and `LIBCLANG_PATH` to the directory containing libclang.dll. CMake must be on PATH.
These are build-time dependencies; HiGHS is linked statically into the desktop app.

To exercise the production backend with an exported request:
`cargo run -p pile-plan-core --features native-highs --example ilp_run_request -- request.json output.json 600000`.
The feature is also enabled by default. The example emits progress snapshots as JSONL;
an optional fourth argument requests cancellation after that many milliseconds.

Neighbor differences use two nonnegative weights: tip level and pile size. An edge
that differs in both receives the sum, so there is no joint-difference variable
or interaction constraint in the model. The local improvement heuristic and result
validation use the same additive score. Current project settings omit the retired
`both_milli` field; historical plan results preserve it only as read-only metadata
alongside their original score. Older requests cannot override the additive rule.

Numeric optimization fields use the shared themed stepper, including decimal
percentages and weights. Decimal drafts accept a point or comma; arrow buttons
and up/down keys change the displayed value by one within its allowed bounds.

The ILP sidebar keeps run controls and the compact result together above its
settings. Independent disclosure sections remember their expanded state in the
application-wide user settings, outside project history and IFCPP content. Target locations and
configuration limits start expanded; result details and neighbor weights start
collapsed. Single-choice settings remain directly visible without disclosure headers. Solution proof, blocking status and corrective actions remain visible. Detailed
diagnostic messages have their own disclosure, closed initially for each outcome,
with message and affected-location counts. Single-choice rows use prominent labels
without disclosure headers.

Blocked ILP results summarize the affected locations above the messages. When
the core reports solvable targets, a shortcut enables skipping unsolvable units
for the next run, preserving the current selection and target scope.

The ILP save-as-new-plan choice and editable name share a Save as disclosure.
Its expansion state is an application preference (initially collapsed); the draft
name is transient. An untouched or empty name uses the next localized
Optimization/Optimalisatie number. The run captures the name once, using it for
both live previews and the committed plan; updating an existing plan preserves
that plan's name.

Candidate configurations and utilization/cost settings have separate disclosures,
initially collapsed. ILP candidate sources are all available, active legend and
custom selection. The optional `custom_configurations` setting stores exact
size/tip-level pairs in the IFCPP project and defaults to an empty list for older
projects. Rust selects the candidate domain from this list in custom mode; the
frontend matrix only edits the list. Empty custom lists never mean unrestricted.
Existing lock behavior still fixes locked groups independently of candidate filters.
Legacy optimizer settings are consumed only during project migration, then
discarded; saved projects contain only the current ILP settings.

The candidate matrix row/column headers toggle all available pairs for one tip
level or size, with an indeterminate checkbox for partial selections. Each group
toggle is one settings change and does not create unavailable size/level pairs.
