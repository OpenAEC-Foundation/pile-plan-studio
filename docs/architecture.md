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

Shared browser/desktop request and response models live in the core's
`transport_requests.rs`. WASM and Tauri deserialize the same types; adapters
retain their own command entry points and transport conversion. These models
contain wire fields only, with engineering behavior in the feature modules.

The guiding rule is that engineering decisions must be implemented and tested in
`crates/pile-plan-core` first. Frontend code may present results, but should not
be the source of truth for calculations.

`AppSession` composes runtime features. Pile-option cost batching lives in
`app/derived-state/pileOptionCosts.ts`, with its cancellable React effect in
`usePileOptionCosts.ts`; only Rust calculates individual costs. The explorer
labels missing costs explicitly with a theme-aware text badge. When costs are
missing and the known subtotal is zero, it displays an unknown total (—), while
a complete, genuinely zero-cost plan still displays zero. MCP snapshot
freshness is coordinated by `app/mcp/useMcpDerivedState.ts`, which reuses the
shared snapshot gate for groups, technical assignment, and group conflicts.
Viewer and right-panel group conflicts use the displayed plan's assignments
during optimization previews; MCP keeps using the stored project. Outdated
conflicts are hidden while a different assignment set is assessed. Returning
to a completed assessment invalidates any intervening in-flight assessment.
`app/derived-state/useProjectTechnicalAssignment.ts` prepares the effective
pile options and gates Rust assessment on completed upstream analysis and the
current CPT preview. Its preparation and error precedence are isolated in
`projectTechnicalAssignment.ts`; engineering assessment remains in Rust.

`app/project/pileAssignmentController.ts` coordinates manual pile assignment
and removal through the Rust group-assignment evaluator. It captures the active
plan, assignment map, effective groups and lock signature, and checks them again
after evaluation and inside the history update. `usePileAssignment.ts` supplies
live callbacks and invalidates pending requests on unmount; `AppSession` provides
the history commit and translated notices. All accepted changes are installed
immutably in one history step, including group-expanded changes and removals.

Manual grouping, ungrouping and reset of grouping overrides are coordinated by
`app/project/groupEditController.ts` and its React adapter `useGroupEdit.ts`.
They reuse the Rust preview and edit evaluators, reject concurrent edits and
stale source/settings snapshots, and commit copied grouping records with the
appropriate selection and history action. Group edits preserve pile assignments;
conflicts remain visible through the Rust-derived assessment.

Lock-editing state transitions live in `domain/pile-plans/loadPointLockEditing.ts`,
beside the per-plan lock helpers. Entry snapshots the transient selection; cancel
restores it; apply installs the detached draft in the active plan. AppSession
dispatches draft changes as runtime updates and applies locks as one project
commit, so unchanged locks do not add an undo step.

`app/project/newPilePlanController.ts` coordinates fresh-plan creation from the
full technical option set through Rust's default-choice evaluator. It rejects
concurrent starts and stale analysis, CPT-preview, group, cost or active-plan
inputs before committing one plan. `useNewPilePlan.ts` supplies live session
callbacks and cancels installation when the session unmounts.

`app/derived-state/cptSelectionPreview.ts` runs the transient manual CPT preview;
`useCptSelectionPreview.ts` binds its lifetime to the draft and source/settings
references. It uses the existing Rust pile-option analysis client. Cancellation
and captured-input guards prevent late results from installing a preview,
while base options and project assignments remain unchanged. Explicit automatic
resets remove overrides from preview input and display the returned Rust CPT
selections; further manual edits use those selections.

The CPT editor captures per-location effective selections when opened. A
transient location picker scopes table rows, viewer CPT toggles, nearest-only
selection and automatic reset without changing the selected load-point group.
Usage counts expose their actual members and open a member directly in this
editor. Navigating between members retains one shared draft and shows which
locations will change. CPT ownership and technical assessment remain per load
point; the union displayed for a group does not become every member's selection.

`app/project/manualCptEditController.ts` sends only effective changes and
explicit resets through Rust's existing manual-CPT bulk validator. It guards
the draft and project inputs before and during the immutable history commit.
Valid changes commit in one undo step and request analysis only for changed
locations; blocked or stale batches commit nothing. Nearest-only and automatic
reset are staged until Save, and Cancel discards all staged changes. Saving an
unchanged or genuinely reverted selection retains its original automatic/manual
mode and does not change project history, dirty state or analysis requests.
Explicit automatic reset removes an override even if its effective CPT set is
unchanged. Empty manual selections stay distinct from automatic selection.
These UI-specific no-op rules do not filter explicit MCP manual writes.
Manual choices stay attached to their locations after ungrouping and apply
across all pile plans. The edit snapshot, focus and previews are runtime state;
the IFCPP schema is unchanged.

Import panels keep their form state and present the existing immutable draft
models in `domain/imports/`. Both the views and runtime import that pure logic.
`app/import/projectImportPreviewController.ts` coordinates source-file
reads and Rust previews independently per project role;
`pilePlanImportPreviewController.ts` handles pile-plan previews against the
current project inputs and configuration catalog. Their React hooks invalidate
pending work on unmount. Request identity is captured before file reads, so a
late read, result or error cannot replace a newer preview or a changed context.
Preview updates remain transient; final import validation stays in Rust.
`app/import/projectImportRequest.ts` prepares the selected source bytes and
project properties using the same readiness model as the import panel.
Advice files use immutable source identities, per-sheet selections, and a
joint project preview. `adviceImportPreviewController.ts` rejects stale file,
selection, mode, and project-context results. Rust `import/` owns discovery,
column-table parsing, exact conflict detection before orphan filtering, and
refresh merging. `preview_project_import_files` uses the same merge rules as
final import on WASM and native. Preview is read-only project context.

Advice provenance stores durable `advice_id` and normalized `capacity_keys` in
existing import-log `profile_details`. Shared identical keys retain all owners;
replacing one owner preserves values owned by another. CPT refresh remaps these
keys. Incomplete historical provenance is represented as one combined legacy
advice. Explicit append/replace operations preserve unrelated sources; legacy
requests without operations retain their previous whole-advice replacement
semantics. No IFCPP schema bump is required.

Behavior tests cover request preparation and preview timing; source inspections
remain for view conventions.

## Desktop MCP connection

MCP project writes are narrowed against their published schemas into a typed
operation before dispatch to the write adapters. The operation name determines
the argument type; bulk proposals reuse the core transport models. Rust still
validates engineering rules, and the session dispatcher enforces editing
permission and the current project instance and revision.

`app/mcp/connectionController.ts` owns connection status, startup cancellation,
and disposal of the import/file sessions belonging to each connection.
`useMcpConnection.ts` publishes that lifecycle to React. A replacement listener
waits for the previous stop and any cancelled startup to complete, so delayed
native cleanup cannot stop the replacement connection.

The desktop app can expose the open project to a local MCP client after the
user enables the AI connection in Settings. Tauri owns the fixed loopback HTTP
listener, per-session bearer token, request limits, and request correlation.
Its accept loop dispatches bounded concurrent requests so one slow core call
does not hold later MCP calls at the TCP listener.
The webview's `app/mcp/` code owns MCP tool discovery and uses the current
`AppSession` project state. It calls the existing Rust core clients for current
cost calculations and group assessment. Editing requires a separate session
toggle. Write calls carry an expected project instance and revision, use the
same project operations and Rust group assignment rules as the interface,
and commit through project history. Bulk writes are validated as a whole by
the Rust core, then committed once, so all changed locations share one Undo
entry. No separate copy of the project is opened.

`app/mcp/projectSession.ts` builds the project-facing session for each connection:
source imports, file operations, pile-plan imports, dispatcher, and read snapshots.
It reads live project/settings/derived-state getters and captures the current
project instance and revision for snapshot freshness checks. Each import/file
adapter shares the active-session and editing-permission check. Disposing this
session clears both import transaction stores and invalidates its file operations.
`AppSession` supplies the existing atomic installation callbacks, including
refresh history, replacement paths, save signatures, navigation, and dirty state.

`app/mcp/sessionDispatcher.ts` connects protocol requests to live session state,
validated writes, optimizer controls, and the import/file sessions. `AppSession`
supplies current-state getters and atomic history or navigation callbacks. The
dispatcher rechecks edit permission and snapshot freshness after write validation
and verifies installed content before returning success.

MCP reads do not enter undo history or dirty state. The browser build has no
listener. See [MCP connection](mcp.md) for user-facing connection steps and
settings edit contracts. Automatic CPT rule edits, grouping settings and project
cost-catalog edits use focused Rust evaluators via the same WASM/native core
wrappers; accepted MCP batches commit one immutable project change and Undo
entry. Manual CPT overwrite is explicit, group settings never reconcile pile
assignments, and used pile-size cost rows cannot be removed.

The cost editor and MCP tools share `preparePileCostCatalogEdit` in
`app/project/projectEditOperations.ts`. Loading cost defaults and merging
defaults into a new imported project also pass their proposed changes through
this Rust validator. Accepted edits enter history once; rejected rows do not
change project content. TypeScript retains preference precedence and input drafts.

Project-owned optimization settings, per-plan active configurations, visual
legend styles, project properties, and targeted source edits use a shared
Rust evaluator over the current `ProjectDocumentDraft`. It returns a canonical
validated project only after the complete edit passes; TypeScript maps that
result into immutable project content and commits it once. Source deletions
prune dependent references, reconcile activation and groups, invalidate old
optimizer summaries, and schedule new technical analysis. The evaluator is
available through both Tauri and WASM, although only desktop has an MCP
listener.

`app/project/projectEditOperations.ts` adapts this evaluator to the live
project state for both MCP and the project-information and legend editors.
The legend editor evaluates appearance and active configurations before one
history commit, so its combined action is one Undo step. UI edits reject a
stale project revision before committing. The optimization panel still keeps
its per-field draft interaction in the interface; MCP applies a complete
settings object through the Rust evaluator.

MCP optimization controls call the same `useIlpOptimization` coordinator as
the panel. A start call validates the active plan and explicit target IDs,
returns a run ID before the solver finishes, and reuses the Tauri native Rust
optimizer. Stop and Cancel address that exact run ID. Progress and terminal
outcomes remain transient; only a solved plan is committed through project
history. The personal run-duration preference belongs to app settings, while
an MCP call may override it or explicitly request no limit for one run.

Excel foundation-advice discovery and final parsing share a Rust layout
classifier and profile resolver. Size matrices cannot fall back to the
positional standard-table parser. Bare numeric size headings use millimetres;
matrices with generic first headings require an explicit Sizes in columns
choice (`needs-profile`) before parsing. Typed diagnostics retain the source
location, raw value and expected meaning; the interface translates them into
messages with recovery actions and keeps the profile choice and primary reason
visible. Joint preview distinguishes unavailable counts from a validated zero
result. These rules also apply to append/replace operations and do not
reinterpret stored project advice.

MCP source import is a transient transaction in `app/mcp/`: the webview stages
bounded UTF-8 CSV chunks, then calls the existing Rust preview and complete
import/refresh clients. The standard-table CSV contract is exposed by the
Rust import module through one native command. Validation holds the candidate
project in memory and reports diagnostics without changing IFCPP, Undo, or
dirty state. Apply checks the captured project marker again. Refresh commits
one history entry; new-project import uses the app's replacement path and
refuses to replace unsaved content. Staged data is cleared when the MCP bridge
stops or the transaction expires. The browser has no MCP listener, while its
ordinary import UI still uses the same Rust import clients through WASM.

`app/mcp/sourceImportOperations.ts` owns the source preview, Rust import/refresh
calls, validation summary, and guarded application of a staged result.
`AppSession` supplies live state and permission getters and atomic installation
callbacks. New-project imports recheck lifecycle, edit permission, project
marker, and unsaved content after cost defaults have been validated.

Existing pile-plan CSV import has a separate transient MCP transaction. Rust
supplies the standard-table format contract and parses the uploaded CSV against
the current load points, CPTs, and configuration catalog. The webview stages
bounded chunks and reports paged diagnostics; applying a validated patch also
passes assignment changes through Rust's group and lock batch validator. The
new plan, any project-wide manual CPT changes, and analysis invalidation commit
as one history entry. The transaction is tied to a project revision and is
discarded when the bridge stops.

`app/mcp/pilePlanImportOperations.ts` coordinates Rust preview, group and lock
batch validation, and guarded installation through the session. It rejects
group-expanded assignments outside the import patch and verifies the committed
project before reporting success. The new plan and shared CPT edits remain one
history entry.

Both import transactions share an apply lock acquired before asynchronous
content-digest checks. They recheck transaction lifetime and project identity
after the digest, preventing concurrent or discarded transactions from applying.
The lock is released after failure so a valid transaction can be retried.

Desktop file operations use the app's existing IFCPP reader/writer and
CSV/XLSX export clients. MCP starts a native file dialog asynchronously and
polls a short-lived operation ID so the dialog never holds an HTTP request.
The operation checks the project revision after each await and before writing;
the response exposes a basename but no local path.
`app/mcp/projectFileOperations.ts` wires the native
dialogs, validated file opening, serialization, and save callbacks to the shared
project-file lifecycle runner. `AppSession` supplies current state and installs
opened projects or records successful saves.

Export reads an explicit plan ID without changing the viewed plan. Two-plan comparison reads immutable
plan state and uses the Rust cost calculator before returning paged assignment
and lock differences.

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

The right panel defaults to a single view. Its optional split view keeps pile
options above a compact CPT pane, with independent scrolling and a draggable,
keyboard-accessible divider. The divider ratio is an application preference;
the chosen view and selections remain transient workspace state. Opening a CPT
or editing its selection keeps the split view active. Source tables have a close
button that returns to the active pile plan without changing selection or viewport.

Pile-option column visibility and order are application preferences, stored
separately for single-location and multiple-location selections. Defaults preserve
the existing columns; hidden columns do not participate in filtering or sorting.
Changing this layout does not change project content, undo history, or dirty state.
One permanent selection overview sits above the pile-options, CPT and combined
content, with one location list and navigation control in every view. The list
has no column headers and defaults to four rows before scrolling. A draggable,
keyboard-accessible separator adjusts the visible row count from one to twelve;
double-click restores four rows. The heading collapses/expands the overview.
Row count and collapsed state are application preferences, independent of project
history and dirty state. Members of the
effective Rust-derived groups appear together with a clickable group label in
the left rail; clicking that label selects the complete group. Locations follow
default Mark numbering order: descending Y rows bounded to 1 mm,
then ascending X, with ID resolving coincident positions. A group occupies the
position of its first member in that order; its members follow the same row
order and remain contiguous. The presentation order is cached for the immutable
load-point source and shared with Previous/Next navigation. The list includes
unselected group members as context and highlights the actual selection. The
group label is also accented when every member is selected. A row click inspects
one location; pile options and CPT edits follow that same selection in both
panels and the viewer. Load-point coordinates remain available in the hover
panel. FEd labels and force values use shared aligned
grid tracks across all groups. The list scrolls the first selected member into
view when selection or group context changes. The former group-selection banner
is replaced by these inline labels; assignment-conflict notices remain separate.
The current group/multiselection remains as transient navigation context while
inspecting its members. The shared overview offers Previous/Next in the displayed
group order, both inside and outside editing. Selecting outside this context
replaces it; clearing the selection clears the context. The compact arrow control
sits beneath the list, alongside an Entire selection action. The CPT content
provides its edit actions beneath this shared block. Navigating through the list during CPT
editing captures newly visited locations without losing earlier draft changes.
Save validates and commits all changed locations together; Cancel discards the
entire draft. Zero changed locations is plain text; the changed-location details
only expand when there are actual member links. Automatic reset and Only nearest
are also available outside editing and validate/commit directly without exposing
an intermediate draft. Viewer point/background/lasso selection and switching to
Pile options finish editing by saving first; the requested UI transition runs
inside the successful guarded commit. Failed or stale saves keep the editor and
selection intact. Source selection and shared-list navigation can still change
edit targets without discarding staged changes.
The CPT batch client normalizes Rust's absent CPT IDs to explicit `null` across
WASM and native transport: this means automatic selection, whereas an explicit
empty array means a deliberately empty manual selection.
Optional columns default to hidden, including when older saved layouts are
normalized. Single selection offers FEd in addition to the existing columns.
Multiple selection also offers governing resistance (R_c;net;d min), governing
CPT and FEd for each configuration's critical load point, as identified by Rust
aggregation (maximum utilization). These critical metrics remain unavailable
when capacity data is incomplete; single-location FEd remains available because
it comes directly from the load point.

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

UI typography is defined on the document body so menus and dialogs outside the
main app shell inherit the same bundled Inter font. Native form controls inherit
that font as well. Secondary and muted text colors are opaque theme tokens with
at least 4.5:1 contrast against the base, raised, and surface backgrounds in every
theme. Text sizes and the shared application scale remain independent of these
typography and contrast choices.

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

In `size-color-tip-region` legend mode, pile-option tables preserve the
size-colored symbol and add a tip-level color swatch beside the numeric tip
level. Both single-location and aggregated rows use the shared activation
presentation, independently of viewer region visibility. Inactive tip levels
use neutral gray and retain the inactive text label; absent legend colors also
fall back to neutral gray. Text keeps the application theme's readable color,
while the swatch retains the exact project legend color. Other encoding modes
retain their existing symbol and color presentation.

The Selection overview retains an explicit transient inspection context in
selection state. Navigating or inspecting a member keeps this context. Clicking
a member of a selected group or multiselection in the viewer inspects that member;
clicking another context member moves the focus. Clicking outside the context or
making a new source-table, legend, modifier, or lasso selection replaces it. The overview and viewer derive
the same ordered context from the core groups. Context members outside the active
selection have dashed gray rings on the drawing; hover and focus remain orange.
The overview shows both active and context counts while inspecting. These rings
do not add action targets, saved content, or undo steps. Context is discarded when
the load-point source changes.

Excel and CSV share an explicit, ordered column layout with stable field keys
independent from user captions. `export_columns.rs` validates layouts and projects
typed records, including size notation/templates, units and literal cells. Normal
layout and numbering/code options are application preferences. Default captions
follow the interface language and selected output units; edited captions and
imported source names remain explicit. The column list holds exported columns
only, with drag grips, keyboard reordering and per-row removal. Newly added
captions receive a free numeric suffix, retained when default captions change
language. The editor uses bounded lists/settings and reserves preview space;
while column/code recalculation is pending, it presents the previous table for
the same plan/source context with busy state and export disabled. It never
exports that cached presentation. Failed sheet/header interpretation retains
its controls so users can correct the choice. The original
unconfigured API/MCP writers retain their original seven-column contract.
Configured dimension notation renders square sizes as `290x290` and round sizes
as `Ø290`; unassigned values stay empty. Ordinary pile-plan import accepts numeric
and equal square dimensions; custom captions can be mapped through its shared
source-column editor. This does not alter project pile shapes.

Pile-plan import uses the same file-first, collapsed Preview/Import settings
editor as project sources. `pile_plan_import/source.rs` inspects and parses mapped
CSV/XLSX tables with original row/column diagnostics, while `matching.rs` resolves
ID-only, X/Y-only and guarded combined matches. Optional table settings and
location decisions extend the existing request without changing IFCPP content.
Unmapped categories preserve values; mapped blank action cells retain explicit
clear semantics. Preview includes source rows with optional geometry and matching
results; unknown source positions and distances remain absent.

The shared location editor has an import mode with file/project labels, skip
rather than add/remove actions, and an importer-provided core evaluator. Its list
retains unlocated rows; the canvas filters them out and can highlight a linked
project partner. Review completion concerns source rows only. Ambiguous/conflicting
rows require reassignment or explicit skipping before the UI enables Import.
Legacy superseded rows become skipped rows in the same matching result. Confirming
review remains transient; final import uses the existing core group/lock validation
and creates one new plan in one undo step.

Source refresh, pile-plan import and change-table export expose the editor through
the same visible `LocationMatchingEntry` section: summary, review button and
automatic matching tolerance. Source refresh requires confirmed associations
before Apply. An explicit nearest bulk action uses `reconcile_locations` in all
three workflows, considering free coordinate pairs beyond automatic tolerance
while preserving confirmed links and skips. Import rows without coordinates
remain available for manual association; no positions are inferred for them.

The editor owns transient undo/redo snapshots of validated mappings, tolerance
and selection. These are separate from project history and discarded on Cancel.
Its automatic action applies the edited tolerance only to remaining free pairs,
preserving existing links and explicit added/removed/skipped choices; confirmation
passes mapping and tolerance to the destination together. Both layers use the
terms import locations and project locations. Rust supplies review row order via
the existing pile-numbering algorithm; presentation prefers available Marks and
places unlocated rows last. Navigation follows this order and pans the existing
viewport to the next selected location at its current scale. Explicit Show in
plan retains zoom-to-selection behavior.

Only automatic continuation or history restoration requests viewport focus;
direct map/list picks leave pan and zoom untouched. The active editor registers
its transient history with the matching surface so the existing title-bar
Undo/Redo buttons operate on mapping snapshots, then return to project history
when the editor closes. Tolerance and matching actions share a compact tool strip;
its information icon shows help immediately on hover or keyboard focus.

`ApplicationTooltip` is the shared application help layer. It adapts existing
title text and explicit data-tooltip help to immediate hover/focus popups,
temporarily suppresses native titles while preserving accessible names and
descriptions, and dismisses on Escape, scrolling or resize. Popups use theme
colors and the application layout scale and are rendered outside clipped panels.
Source import previews use a separate scroll class from full source viewers;
only import previews have a bounded height. Foundation-advice source views pair
pressure and tension resistance columns by CPT/size/tip without a direction
column. Load sources show tension demand in one column (known zero stays zero,
missing values show a dash with import-state help). These are presentation views
of the original core inputs, without changing their stored records.

`export_context.rs` evaluates an optional validated project draft and explicit destination
plan for configured exports. It reuses Rust pile-option and cost calculations for
optional resistance, utilization (numeric percent), governing CPT, per-pile cost,
length and technical-status columns. Incomplete capacity assessments leave
resistance/utilization/governing CPT empty; costs and length have independent
availability. Each technical-status column can retain localized standard text or map the five internal assessment states to user-defined text/codes; empty custom strings produce empty cells. These per-column preferences do not alter engineering facts. Historical source status cells without a known core state remain source values and are never decoded from their displayed text. Unconfigured seven-column writers keep their existing contract.

Proposal inclusion is an export preference. Enabling it appends a missing Export-ID column; entering a non-empty proposal code appends its missing column. These actions preserve the existing column order and never add duplicates; column removal remains available. Export-ID and proposal-code output fields are available only with proposal inclusion enabled. Disabling inclusion removes both columns; original-location provenance remains independently available. Older preferences are normalized accordingly. The Export-ID editor explains its numbering and distinction from location IDs and Mark. Original members are replaced with
fixed core-generated schematic positions and equal indicative demand per pile.
A proposal row has no original location ID. Numeric Export IDs start above the
maximum original project ID and follow sorted source-member sets and core pattern
order; original IDs remain reserved. Original-locations and optional proposal-code
columns retain provenance. Spatial Mark uses the exported positions independently
of viewer symbol compression. The panel, preview and proposal filename suffix
identify this as indicative, without RFEM recalculation.

Change tables force replaced source rows to removed and proposal rows to added,
even at coincident positions. When source IDs are unavailable, an ambiguous relationship to original project positions is resolved in a separate matching review before replacement is applied. These rows cannot be linked by automatic, manual
or bulk matching; ordinary rows retain the existing workflow. Removed source
metadata remains historical, while active project rows receive current facts.
External new tables can use Export ID as row identity without treating it as an
original project location.

`export_rules.rs` owns optional spatial Mark ordering and tip-level code rules;
`export_table.rs` writes the typed scalar table used by previews and CSV/XLSX.

Revision X/Y columns accept `coordinate_source` (`old_within_tolerance` or `new`).
The default preserves the previous coordinates of a linked location when its
Euclidean matching distance is at or below the revision tolerance. Outside that
range and for added rows, current coordinates are used; removed rows retain their
existing location. Each column chooses independently, so old and new X/Y can be
exported together. Formatting applies the column unit or the inherited source
unit after choosing the coordinate. Matching, project geometry and change-code
assessment are unaffected. Ordinary pile-plan exports use current coordinates.

`location_matching.rs` owns reciprocal unique automatic matching, explicit
one-to-one decisions, nearest/separate bulk actions and numbering-rule scoring.
`revit_revision/` retains its transport name but implements generic change tables.
Its inspector selects worksheets/header rows, suggests known column meanings
and units and returns an editable source layout even before full row validation.
Revision sources show a collapsed table preview followed by collapsed import
settings. A shared source-column selector is used by ordinary source import,
pile-plan import and revision-table import: select a source column, then choose
its meaning and applicable units or size interpretation. Mapping a field to a
new column replaces its previous assignment. The detected-numbering explanation
and action live only in the Mark output-column settings.

Changing the revision matching tolerance also sets the movement-code threshold.
The threshold can then be edited independently without changing matching tolerance.
Editor changes take effect on confirmation; cancel and confirmation without a
tolerance change preserve a separately edited movement threshold. During a
same-source tolerance recalculation, the previous preview stays mounted for
stable editing; export still requires fresh results and confirmed matching.

Explicit field mapping accepts customized captions. Only old X/Y are required;
missing old size/shape/level remains optional and never produces false S/L codes.
The new file requires IDs and complete configurations. Comparison preserves
source metadata by index and existing Marks, allocates missing/new Marks,
regenerates active tip codes and computes configurable M/S/L/A/R-style codes.
A Mark mode can retain old numbering and number additions above its maximum, or
renumber every active new location from the configured start. Removed rows retain
old Marks in either mode, so a removed number may overlap an active new one.
The export destination plan is a transient session choice, initially the viewed
plan. Preview, writers, filenames and revision guards share this destination;
changing it invalidates matching review without switching the viewed plan.
Export column settings and the output preview use separate native disclosures,
initially closed; their mounted contents preserve edits and cached presentation.
Output projection can include, reorder, rename or omit any column. Source
mappings and inherited layouts remain transient. Layout/code edits preserve
confirmed links; source, interpretation or geometry changes invalidate them. RFEM refresh accepts the same
validated decisions through `import/refresh.rs`; ID reuse never establishes
identity in the reviewed workflow. Source refresh clears optimizer outcomes,
remaps pile-cap proposal member IDs and drops proposals with removed members
with a visible warning. Load-only previews validate the refreshed project and
preserve unchanged legacy advice instead of re-importing it through advice
reconciliation. Source advice/CPT changes retain their full validation.

The WASM and native wrappers expose matching, export previews/writers and
load-point refresh preparation. `app/exports/` guards asynchronous previews and
transient mapping decisions against changed source/project context. The shared
`components/domain/location-matching/` workspace renders core proposals and sends
all edits and bulk actions back to Rust. `locationMatchingSurface.tsx` registers
the review in the AppSession host below the ordinary title bar. Backstage stays
mounted and suspended so files and settings survive confirm/cancel. The viewport
mounts after its host becomes visible and reuses `useViewerViewport`, the shared
SVG surface, marker geometry and nearest-hit index. Review pan/zoom is transient.
Only the selected location has a dropdown; the list and SVG stay linear in the
number of points. Old symbols are outlined and new symbols filled, using the
project legend when source configuration data is available. Lines have
selected/all/off modes, initially all. Thin straight center-to-center lines render
after the symbols, without a halo; coincident endpoints render no line. The same
viewport hook draws the coordinate grid in its
untransformed canvas layer, enabled initially. Old hover/selection uses explicit
navy dashed rings; new hover/selection uses solid orange rings. Pending points
on both layers carry question badges. The review starts in old-partner picking
mode for the first unresolved new point, advances after accepted decisions,
then visits old orphans. Empty clicks/Escape clear selection, while drags pan.
An occupied target replaces conflicting edges in one immutable edit proposal;
Rust validates the complete one-to-one result. Displaced points stay unresolved.
Bulk actions and pending counters remain visible above the drawing. The RFEM review passes the confirmed
mapping with its project revision to the atomic refresh installer. No revision
source, link or preview enters IFCPP/history. Export settings are normalized
application preferences. Annotation options are opt-in; old API/MCP writers
retain their original contract and columns.

The implementation invariants, coordinate pipeline, regression symptoms, and
manual test procedure live beside the viewer code in
[`apps/pile-plan-studio/src/viewer/README.md`](../apps/pile-plan-studio/src/viewer/README.md).

## Pile-cap proposals

`pile_cap_proposals.rs` owns per-plan proposal definitions, edit validation,
centered one-to-twenty-pile patterns, force distribution, CPT union, option analysis
and indicative costs. `evaluate_pile_cap_proposals` is shared by WASM and Tauri
and uses the ordinary project-document validation boundary. Original load
points, assignments, locks and the shared grouping topology remain unchanged.

IFCPP schema 6 adds `pile_cap_proposals` to each pile plan. Supported older
schemas normalize to empty proposal lists. Only definitions are stored: sorted
source member IDs, count, quarter-turn rotation and optional configuration.
Calculated positions and results are transient. Counts 1–6 retain their existing
patterns; 7–20 use balanced centered rows, including 3×3, 4×3, 4×4 and 5×4 layouts.
Manual controls support 1–20. An original group above 20 is preserved and its minus
control enters the supported proposal range at 20; Reset restores the original. Changing a definition commits
one undo step; opening the compact control does not. A new plan starts empty;
duplication copies proposal definitions independently. A proposal whose source
members no longer form one effective group is retained but inactive.

`app/derived-state/pileCapProposalController.ts` guards calculations and edits
against project replacement, input changes, plan switches and disposal. The
controller retains the last validated result during an edit only when its source
array and full active-plan/input key still match. This prevents a temporary return
to source geometry while native validation is pending, without reusing assessed
previews after project, plan or engineering-input changes. The
selection header exposes a compact count/rotation/reset bar beside the grouping
action, and the existing pile-option table displays the proposal's core facts.
The Plan ribbon also opens a compact right task panel listing all proposals in
the displayed active plan, with source-member and proposed pile counts. Row
selection uses the existing transient viewer-selection path (including pending
CPT edits), keeps the overview open, and does not edit project content. Inactive
proposals remain listed with core-provided status; missing source members are
not selected. The overview is derived from existing per-plan records, not saved
as additional project content. Selecting a row issues a one-shot, project/plan-scoped
viewer focus request after selection completes. The viewport hook centers the
source centroid using its fixed projection, current zoom and layout compensation;
it cancels pending wheel commits and acknowledges the request without adding
project content. The overview reuses the selected group's ordinary cap control
and edit guards above its list. These controls remain available after Reset removes
the last proposal. Rows stay sorted by source IDs when a core edit replaces a record.
The overview's Reset all action prepares an immutable cleared draft for the active
plan, validates it through the same core boundary, and commits all removals in one
undo step. It includes inactive records and preserves other plans and original
assignments. Empty plans are a no-op; async results retain the ordinary source,
plan and input guards.
Reset removes only that proposal and restores the original source presentation; it is one undoable project edit. Validated edit results are reused by the following derived-state refresh, with the same project/input guards. Core evaluation selects CPTs only for proposal source members instead of calculating all original pile options.
The whole source group is the edit target, including singletons. A union of the
members' effective CPT selections applies to every hypothetical pile; an empty
member selection cannot be hidden by that union.

The viewer projects the core pattern through its existing fixed transform.
`viewer/pileCapProposalGeometry.ts` normalizes schematic spacing to the symbol size and
reduces it around nearby ordinary markers and neighboring proposal centers.
Symbols and status halos retain their ordinary size; only the pattern spacing
changes, without changing engineering input. Members of the same proposal may
overlap partially, with a minimum center spacing of one third of the symbol
diameter. Spacing never exceeds the original group spacing or the core pattern;
an already tighter original spacing also caps the readability minimum. If
these bounds cannot fit around the fixed center, the viewer exposes the
remaining spacing limitation on hover. Dashed contours
remain visible without selection or ordinary group visibility; no additional
permanent viewer labels are drawn. Proposal piles reuse the ordinary marker
status halos and utilization-range preferences, including red insufficient-capacity
and yellow missing-data feedback after deselection. Markers and lasso selection map back to the
original group. Region presentation reuses the core's existing topology with
the proposal's configuration and core-produced option facts. Region geometry
replaces source-marker circles with the displayed proposal positions and
reanchors existing core connections to those positions. A rounded footprint
joins the core-owned cap pattern, so added piles and rotated or reduced layouts
remain inside their region. It does not compute a second inter-location topology
or change source coordinates. The compact cap control reserves label/count width
so its minus and plus buttons stay in place across count and proposal changes.

Effective cost/count summaries replace each active proposal's original members
once. Missing proposal choices or costs remain incomplete. These are indicative
pile costs, not a cap cost or structural cap check. Configured CSV/XLSX export can use original source piles or replace each proposal’s members with its fixed schematic core positions. IFCPP save and recovery preserve proposal definitions.

`optimization/ilp/pile_caps.rs` prepares cap-aware unit domains from a captured
project draft, validated against the run's source locations, groups and cost
settings. The shared `PileCapAnalysis` evaluates manual and optimized cap
candidates through the same CPT selection and resistance rules. Existing counts
are fixed unless `allow_pile_count_changes` is explicitly enabled (default
false). New counts must be selected in `allowed_pile_counts` and must not exceed
`max_piles_per_cap` (default 6, supported range 1–20). Missing fields normalize to
maximum 6 and all counts 1–20 selected, preserving old projects. Both settings
are project content and are captured with result metadata. The count popup edits
them together in one undo step. Existing source/proposal counts above the maximum
remain preservation options, including original groups above 20; disallowed
counts within the maximum are not silently reintroduced as original-count choices. Any locked member fixes its cap's effective count and configuration.
With count coherence disabled, each configuration retains its least-cost
eligible count and cost ties prefer the current count. With a positive
`pile_count_milli` and coherence enabled, every eligible count/configuration
combination remains in the unit domain: a more expensive count can improve
neighbor coherence within the cost budget. Original-count choices retain the
ordinary source demand model.

Validated solutions include explicit `pile_cap_proposals` alongside the source
member coverage assignments. The frontend retains original assignments and
references for those hypothetical caps; ordinary-count assignments remove a
target's proposal. New destinations inherit outside proposals. Definitions and
result metadata commit in one undo step. Live proposals use the existing
transient display state and never enter history, save or recovery. Run and
result fingerprints include proposal definitions. Whole-plan limits, boundary
transitions, both solver phases, local search and limit diagnosis use the same
prepared domains. Historical solutions/settings without these fields remain
readable.

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
The panel and MCP share this path. The run captures its time limit at start:
one to 7200 seconds, or no deadline. The panel stores its chosen default in
personal app preferences, not in IFCPP. A solved MCP run can be read after
commit even though installing a new destination plan makes the original run
fingerprint no longer current.

New projects start with unlimited tip-level, size and configuration counts
(empty limit fields); importing source data does not turn catalog counts into limits.
Saved project limits remain unchanged when reopening a project.
IFCPP settings contain optional `ilp_optimization`; Rust normalizes absent data
from the legacy optimizer with a 5% budget, tip/size weights 1/1 and an unlimited total
configuration count. Target/save/boundary
choices and in-flight results remain transient. Completed plan results are stored
in optional `pile_plans[].ilp_result` (solution, diagnostics, settings, currency and
a versioned content fingerprint). Older plans omit this field. The canonical
project schema is version 8; versions 1–7 migrate on read.
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

Neighbor differences use three nonnegative weights: tip level, pile size and
pile count per cap. A difference in each dimension contributes its weight once;
2 versus 3 piles is the same categorical mismatch as 2 versus 6. Contributions
are independent and additive. Fixed neighbors outside the selected target carry
their effective pile counts, including existing proposals. Solver constraints,
warm starts, local improvement, independently validated scores and result
transition counts use the same rule. The cap-count weight is serialized as
`pile_count_milli`; a missing historical value means zero, and older result
transition metadata normalizes a missing `pile_count` to zero. Current project
settings omit the retired
`both_milli` field; historical plan results preserve it only as read-only metadata
alongside their original score. Older requests cannot override the additive rule.

Import/export controls backed by numbers use `NumericValueInput` around the
shared themed stepper. It keeps incomplete or empty text in local interface
state, emits only finite values within the control bounds (and integral values
for row numbers, pile sizes and Mark starts), and restores the latest applied
value when an invalid or empty draft loses focus or Enter is pressed. External
value changes synchronize the draft. Existing string-owned settings drafts keep
their domain-specific commit rules. Typing an empty value never coerces it to0
or mutates the project/import settings.

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

## Frontend test boundaries

`npm test` in `apps/pile-plan-studio` runs both the Node unit/contract suite
(`npm run test:unit`) and the rendered React suite (`npm run test:ui`). React
component and hook tests use Vitest, Testing Library, and jsdom; `.test.tsx`
files are colocated with their feature. The UI runner shares the browser Vite
configuration and real Dutch/English translations. Shared DOM setup and the
canonical sample-project fixture live in `src/test/`.

Test interactions through rendered controls and observable callbacks/state.
Mock external boundaries such as Rust requests, file operations, and native
services; keep presentation logic and immutable domain operations real.
Use controlled promises for stale responses and fake timers for repeated or
expiring controls. These tests do not launch a native window or open external
links. jsdom cannot verify drawing geometry or actual browser layout, so retain
the browser/native verification appropriate to those changes.

Source inspection tests are limited to explicit architecture wiring, static
styling, translation, and view conventions. They complement behavioral tests;
they do not establish that clicks, asynchronous guards, or history updates work.
Session shortcut dispatch and symbol-scale gesture history have small shared
controllers, tested through actual DOM events and the project history reducer.


## Compression and tension

IFCPP schema 7 stores optional `LoadPoint.tension` as `not_imported`,
`missing`, or `known { value_kn }`. Explicit zero is known zero, never a substitute
for missing input. Schemas 1–6 remain supported: FEd and historical resistances
retain their compression meaning; historical optimizer results retain compression
scope. Both new and old projects work entirely without tension input or advice.

`BearingCapacity.direction` defaults to `compression`; tension advice uses the
same CPT, size and tip keys with direction as an additional key. Import merging,
conflict detection, ownership and replacement all include direction. Advice may
use separate tables/sheets, including tension-only sources, or a standard table
with an explicitly selected additional tension-resistance column. Values are
already design resistances: no additional factors or self-weight corrections
are applied. A pressure-only source refresh preserves prior matched tension
values and provenance unless explicitly cleared. Replacing one resistance
direction preserves owned values in the other direction.

The Rust pile-option subsystem evaluates each direction independently against
the shared effective CPT selection. Each positive demand requires complete
capacity data at all selected CPTs and uses the minimum applicable resistance;
governing CPTs may differ. Known zero needs no capacity proof, passes the
directional check and has utilization 0 (also in maximum utilization). Joint technical suitability and default choices respect all
applicable demands. Missing demand differs from missing capacity.

The source import editor appears after choosing a file. Collapsed Preview comes
before collapsed Import settings. Standard previews retain source row numbers;
the chosen header row is shown only as column captions. The shared column
list/detail editor assigns source columns to fields and units, supports explicit
headers/data start, worksheet selection and CSV delimiters. Rust `import/table_mapping.rs`
owns inference, whole-file validation and normalization into the existing role
parsers. Header inference uses known captions and textual rows followed by numeric
data. A numeric fifth load column is suggested as tension. Entirely empty columns
cannot be mapped; optional partially empty tension remains missing. Original
source rows/columns and serialized table settings are retained in diagnostics
and provenance. Existing positional API requests remain supported.

Standard advice may assign compression, tension or both resistance fields;
matrix advice assigns CPT/tip columns and a size per resistance column, with one
direction per worksheet. Combined matrix imports require separate worksheets.
RFEM shows processed load points instead of its original reaction layout and
does not expose a tension-column selector. The interface enables RFEM tension
by default, with an explicit opt-out; legacy API requests retain their explicit
`import_tension` scope. RFEM vertical envelopes produce
compression `max(0, -minimum PZ)` and tension `max(0, maximum PZ)`. Missing maxima
remain missing tension demand. RFEM 6 uses only structural Pz component pairs,
not overall workbook summaries. Project source logs preserve original vertical
row evidence, including row/column, signed reaction and original source cells
containing available combination references.

`LoadDirectionProvider` owns an application preference for compression/tension
presentation. Components project core directional facts for loads, capacity,
utilization, governing CPT and drawing color; source/project state, shared
assignments, history, export and running optimization remain independent.
Unimported tension is labelled not assessed, without utilization-error coloring.
The display switch is in the Plan ribbon. Pile-option rows show one combined
status: selected-direction failures take precedence; other-direction failures
name that direction and offer a mode-switch action without assigning the row.
Missing demand/resistance and known zero remain distinct in the core; known zero
uses the same compact OK label and green styling as a passing check. Status
tooltips explain the abbreviated labels. This uses the core's
directional facts for single/multiple selections and pile-cap proposals.
Viewer status halos first inspect both directional core assessments, independent
of display mode: missing demand/capacity is yellow (the joint core priority), then
insufficient capacity is red. The selected mode still determines displayed loads,
utilization and preferred-range coloring when no technical warning is present.
Known zero utilization participates in the viewer's preferred-range coloring:
it receives the same green below-range halo as any other utilization below the
configured minimum. Unimported demand remains neutral.

Initial assignments and new pile plans choose the cheapest common valid
configuration per effective group from the joint compression/tension assessment.
Present tension therefore constrains this default independently of display mode
or the optimizer's separate include-tension setting. Missing imported tension
prevents a default choice; unimported tension preserves pressure-only defaults.

The optimizer's project-owned `include_tension` defaults true and is separate
from the view preference. Core scope projection occurs before both ordinary and
pile-cap candidate preparation; result validation and cost reference use that
same prepared problem. Maximum utilization applies to each included demand.
Settings snapshots and directional count diagnostics record the actual scope;
compression-only optimization does not suppress the general tension assessment.
Poer proposals sum compression and tension separately, then divide each by the
proposed count. Mixed known/unimported or missing source tension stays incomplete.
The distribution is indicative and does not reconstruct combinations or moments.

Configured exports add optional tension demand/resistance/utilization/governing
CPT, separate direction statuses, and assessment scope. Existing numeric FEd and
capacity field keys remain compression fields and the seven-column legacy export
stays unchanged. Custom per-column status strings support no load, not assessed
and missing demand without overwriting historical five-state mappings. Current
facts always belong to the explicitly chosen export plan, regardless of view.


### Foundation advice applicability

IFCPP schema8 adds optional `BearingCapacity.pile_count` (`null`/absent means
explicitly valid for all cap counts) and a `missing` marker for scoped empty
source cells. Supported schemas1–7 normalize to universal, available rows.
Writers emit8 so older applications cannot silently treat specific advice as
universal. Application/release versions are independent of the document schema.

Resistance identity is CPT, pile size, tip level, direction and optional cap count.
The core index first looks for the exact count, then universal data for the same
key. An explicit missing exact entry blocks universal fallback; a genuine zero
remains an insufficient resistance for a positive demand. Advice for another
count, including1, is never reused or interpolated. Existing zero-demand and
unimported-tension assessment rules still apply. Count is part of conflict,
deduplication, provenance ownership, refresh and MCP add/update/remove identity.
Replacing a source replaces its imported directions, including obsolete scopes,
while unrelated sources and unimported directions are preserved.

A derived location group represents a physical cap: ordinary per-location demand
is assessed using that group's member count. A proposal redistributes demand as
before and uses its proposed count. Core analysis requests carry grouping settings
and complete source geometry, so a partial CPT preview retains the actual cap
count. Group edits and Undo/Redo invalidate analysis. Optimizer preparation,
default assignment, direction statuses and project-context export use these same
core evaluations. Resolved per-CPT directional resistance facts supply the CPT
inspection view without a second frontend engineering lookup.

Foundation-advice import supports a fixed pile size per selected worksheet,
suggested from an unambiguous `prefab <size>` worksheet name when there is no
size column. Ordinary and matrix advice can declare universal or exact-count
applicability per sheet. The mapper recognizes `Naam Sondering`, `PPN` and
`Rt;d Indicatief` and proposes the latter as tension resistance, ignoring the
separate soil-block/weight/cohesive-contribution columns. Values are imported
unchanged; the app applies no extra factors, weight addition or soil-block formula.
The stored import log preserves source headers, selected table settings and
scoped ownership keys. Input/CPT viewers keep counts separate and display
explicit missing entries as empty values. Geometry/spacing applicability remains
a requirement of the supplied advice, not something count matching establishes.


Import previews run in a persistent browser worker so XLSX inspection and joint
validation do not block form interactions. Desktop previews continue to invoke
the same Rust functions. Advice setting changes coalesce for 120 ms; draft
changes invalidate submission immediately and existing generation/request guards
reject stale responses. The core keeps a process-local LRU of raw XLSX cells,
keyed by exact source bytes and filename, limited to eight workbooks and a
64 MiB estimated payload budget. Returned tables are independent copies; column
mapping, scope, diagnostics and engineering validation always rerun. This cache
and all preview state are transient and never enter project history or IFCPP.

Foundation-advice column recognition includes `Kenmerk` (pile size) and `Waarde`
(resistance) only for advice sources. Clearly named standard advice headers can
be reordered; ambiguous legacy/matrix layouts retain their existing validation.

The CPT advice panel requests read-only `inspect_foundation_advice` core facts
for the current assigned configurations and CPT. The Rust operation derives cap
counts from full project grouping context, uses proposed counts/configurations
when present, and shares the engineering index's exact-count/general/missing
lookup. Its result identifies source rows, including explicit missing overrides,
without changing load-point CPT selection or project history. The UI highlights
matching rows with a marker and row emphasis, and scrolls only the advice table.
Browser inspection shares the background worker; Tauri has a thin native wrapper.

Application tooltips dismiss on pointer press, drag, click, window blur and
removal of their anchor. Clicked controls remain suppressed until pointer leave;
open missing-data popovers omit their trigger tooltip. Other-direction status
pills are direct mode-switch buttons with action help. Ribbon buttons omit
native titles that merely repeat visible labels; icon-only help is retained.


The drawing's top-right **Focus selection** control fits the currently selected
load points (including displayed proposal positions) together with their selected
CPTs and any individually inspected CPT. During CPT editing, it follows the same
draft/preview selection shown on the drawing. It uses the existing fixed project projection,
layout compensation and scale limits; the overlay control is outside the zoomed
stage. It changes only the transient viewport. **Only this location** beside
selection navigation replaces the earlier inspection context with an exclusive
single-location context. Source grouping and assignment validation are unchanged.

Selection and viewport updates reuse the session's persistence draft/signature
while immutable project-content references, the active plan and its assignment
map are unchanged. MCP revision observation uses the same selector contract.
Technical-assignment signatures follow the memoized technical input, so transient
UI updates do not traverse all pile options again. Content edits, plan changes
and undo/redo invalidate these snapshots through their normal immutable updates.

The viewer memoizes individual marker graphics, status halos and hit targets;
cached hit targets call the latest committed interaction handlers. Group contour
shapes retain their projected circles, Gabriel edges and faces when selection
styling changes. Their SVG definitions and unchanged tip-level regions are
retained, while selection/conflict styling and CPT connections can update.
These are presentation caches only; the existing projection, stacking order,
engineering status and single-stage viewport transform remain authoritative.

Utilization halo fills use a radius of 1.5 times the ordinary pile-symbol radius.
Their outer glow uses three shared radial gradients, rather than a Gaussian
filter per location, to avoid many offscreen filter surfaces during pan/zoom.
The central status gradients, opacity/intensity and theme-independent colors
remain viewer-owned. Geometry remains centred on the same project coordinates.

The preferred-utilization slider has one pointer track and two keyboard-accessible
range inputs. When the handles overlap, dragging left chooses the minimum and
dragging right the maximum, including the 0–0 and 100–100 endpoints. Symbol size
uses a local ribbon draft while dragging or repeating adjustment keys; it applies
to the drawing on release/cancel, key release or blur as one undoable gesture,
like the preferred-utilization range.

The displayed symbol-size percentage and each preferred-range endpoint can be
edited in place. Compact numeric drafts allow empty typing; Enter or blur applies
one rounded value within the existing slider bounds, while Escape cancels.
The range endpoints cannot cross, and successful edits use the same project
operations and undo grouping as their sliders.

The shared tooltip layer suppresses help that merely repeats an unclipped visible
label, including labels inside a larger control. It also suppresses native title
fallbacks during hover. Additional explanations, shortcuts, icon-only labels and
the full text of clipped labels remain available. Explicit duplicate tooltips
are omitted from location inspection rows and other text-labelled controls.
