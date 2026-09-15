# Domain Ownership

This inventory records the issue #30 audit boundary. Its purpose is not to
move every TypeScript module into Rust. It identifies the authoritative owner
of each rule and makes remaining duplication explicit.

Status meanings:

- **Core-owned:** Rust makes the reusable domain decision. TypeScript may map
  or present the result.
- **Application-owned:** TypeScript owns interaction, history, persistence
  scheduling, or other runtime workflow.
- **Presentation-owned:** TypeScript derives display-only state from canonical
  domain facts.

## Project documents and persistence

| Module | Current responsibility | Target owner | Status and action |
| --- | --- | --- | --- |
| `crates/pile-plan-core/src/project.rs` | IFCPP project structures, serde defaults, legacy plan deserialization, exact tip-level keys | Rust | **Core-owned.** Retain project-owned data types and consolidate defaults here or in the canonical document boundary. |
| `crates/pile-plan-core/src/ifcpp.rs` | JSON parsing, schemas 1–4 migration, validation, canonical schema-4 writing | Rust | **Core-owned.** Extend to the complete read/write contract and structured project errors. |
| `crates/pile-plan-wasm/src/lib.rs` | Browser exports for project read/write and imports | Adapter only | **Core-owned through delegation.** Keep serialization mechanical. |
| `apps/pile-plan-studio/src-tauri/src/main.rs` | Desktop commands and native file access | Adapter and application infrastructure | **Core-owned through delegation** for project interpretation; native file access remains application infrastructure. |
| `apps/pile-plan-studio/src/core/projectFile.ts` | Mechanical hydration of canonical project data, immutable copies, import summaries, and legend presentation mapping | TypeScript adapter and presentation | **Application/presentation-owned.** Schema branching, project defaults, validation, canonical construction, and float-derived identity are Rust-owned. |
| `apps/pile-plan-studio/src/core/projectDocumentContract.ts` | Maps the canonical document, exact tip-level keys, and structured project errors into interface-friendly names | TypeScript adapter | **Application-owned adapter.** It translates transport shapes and error fields without independently validating or repairing project content. |
| `apps/pile-plan-studio/src/core/coreClient.ts` and `core/*Client.ts` | Provide one stable facade and route project, analysis, and pile-plan operations through WASM or Tauri | TypeScript adapter | **Application-owned adapters.** They map transport requests and results, and must not add defaults, validation, repair, or engineering decisions. |
| `apps/pile-plan-studio/src/domain/project/openedProject.ts` | Coordinates one canonical core read and creates state only after that read succeeds | TypeScript workflow | **Application-owned.** Open is atomic and performs no independent project interpretation or duplicate position validation. |
| `apps/pile-plan-studio/src/domain/project/projectState.ts` | Creates React project state and transient selection/request state | TypeScript | **Application-owned.** Consume only canonical project data; localized initial plan naming remains UI workflow. |
| `apps/pile-plan-studio/src/domain/project/projectContent.ts` | Captures/restores undoable content, calculates analysis invalidation, and extracts a mechanical project-document draft | TypeScript for history and draft extraction; Rust for project construction | **Application-owned.** The draft contains React-owned project content; Rust constructs, validates, normalizes, and serializes the IFCPP document. |
| `apps/pile-plan-studio/src/domain/project/projectPersistence.ts` | Save/download choice, filenames, browser download, and native file commands | TypeScript | **Application-owned.** It writes text already serialized by Rust. |
| `apps/pile-plan-studio/src/domain/project/recovery/browserRecovery.ts` | Versioned recovery-envelope validation and metadata around opaque Rust-serialized IFCPP text | TypeScript envelope; Rust project validation | **Application-owned.** The envelope does not parse IFCPP or maintain an independent supported-schema list; restored text must pass the canonical Rust read contract. |
| `apps/pile-plan-studio/src/domain/project/recovery/browserRecoveryStartup.ts` | Safe startup restore/fallback orchestration | TypeScript | **Application-owned.** Continue sending restored IFCPP text through the same Rust read contract as file open. |
| `apps/pile-plan-studio/src/domain/project/recovery/browserRecoveryStore.ts` | IndexedDB access, debounce, ordered writes, flush, and disposal | TypeScript | **Application-owned.** Store only successfully Rust-serialized canonical IFCPP text. |
| `apps/pile-plan-studio/src/App.tsx`, `app/session/`, `app/derived-state/`, and `app/project/` | Bootstrap the core and settings, compose the active session, and coordinate derived-state requests and project lifecycles | TypeScript workflow | **Application-owned.** File open, sample open, import, refresh, save, and recovery use the shared project-document contract; gesture grouping, request lifetimes, dirty-state baseline, and persistence timing remain interface workflow. Derived-state controllers reject stale outcomes but do not reinterpret core results. |

## History and interface state

| Module | Current responsibility | Target owner | Status and action |
| --- | --- | --- | --- |
| `apps/pile-plan-studio/src/domain/project/history/projectHistory.ts` | Bounded immutable project-content history | TypeScript | **Application-owned.** Rust does not decide gesture boundaries. |
| `apps/pile-plan-studio/src/domain/project/history/projectHistoryReducer.ts` | Commits, amends, undoes, and redoes atomic UI actions | TypeScript | **Application-owned.** Core results become one history entry; restored content invalidates derived analysis. |
| `apps/pile-plan-studio/src/domain/project/history/historyAction.ts` | Describes user actions for undo/redo notices | TypeScript | **Presentation-owned.** |
| `apps/pile-plan-studio/src/domain/project/history/historyMessage.ts` | Localized undo/redo message selection | TypeScript | **Presentation-owned.** |
| `apps/pile-plan-studio/src/domain/settings/userSettings.ts` and `userSettingsStore.ts` | Application-wide preferences and personal cost defaults | TypeScript | **Application-owned.** Personal defaults are not IFCPP content; applying one creates a project edit that Rust validates at the boundary. |
| `apps/pile-plan-studio/src/domain/settings/viewerPreferences.ts` | Application-wide viewer preferences | TypeScript | **Application-owned.** Project-owned viewer settings remain part of the canonical project document. |

## Feature view ownership

| Module | Current responsibility | Target owner | Status and action |
| --- | --- | --- | --- |
| `apps/pile-plan-studio/src/components/domain/right-panel/` | Composes selection details and CPT, grouping, optimization, and cost settings panels, with its local model and styles | TypeScript view | **Presentation/application-owned.** It edits user intent and presents core-produced technical results. |
| `apps/pile-plan-studio/src/components/domain/pile-plans/` | Composes pile-plan exploration, optimization controls, legend presentation, and the nested legend editor | TypeScript view | **Presentation/application-owned.** Legend and plan choices are project content; technical availability and optimization outcomes remain core-owned. |
| `apps/pile-plan-studio/src/components/domain/imports/`, `project/`, and `source-data/` | Own import workflows, project dialogs, and normalized source-data presentation | TypeScript view/workflow | **Application-owned.** These modules collect user intent and present canonical data without duplicating parsing or engineering rules from Rust. |
| `apps/pile-plan-studio/src/components/domain/pile-plan-viewer/PilePlanViewer.tsx` | Composes viewer state, derived presentation, viewport, interactions, and ordered map layers | TypeScript view | **Presentation-owned composition.** It consumes core results and delegates focused responsibilities to sibling modules. |
| `apps/pile-plan-studio/src/components/domain/pile-plan-viewer/ViewerStage.tsx` | Renders regions, connections, status halos, CPTs, and load points in a stable layer order | TypeScript view | **Presentation-owned.** Layering and symbols communicate canonical technical states without recalculating them. |
| `apps/pile-plan-studio/src/components/domain/pile-plan-viewer/useViewerPointerInteractions.ts` | Coordinates hover, marker selection, lasso selection, lock editing, and panning | TypeScript interaction | **Application-owned.** It translates pointer and keyboard intent into immutable project-state changes. |
| `apps/pile-plan-studio/src/components/domain/pile-plan-viewer/useViewerViewport.ts` and `viewerDomCoordinates.ts` | Own project transforms, zoom commits, layout compensation, grid alignment, and screen-to-local conversion | TypeScript browser presentation | **Presentation/application-owned.** These modules preserve visual alignment and do not alter engineering coordinates or decisions. |
| `apps/pile-plan-studio/src/components/domain/shared/` | Reusable domain-view primitives without feature-specific workflow | TypeScript view | **Presentation-owned.** Keep this folder small; feature-specific controls belong with their owning view. |

## Configuration availability, costs, and plans

| Module | Current responsibility | Target owner | Status and action |
| --- | --- | --- | --- |
| `apps/pile-plan-studio/src/domain/pile-options/activePileConfigurations.ts` | Legend activation toggles, UI filtering, retained assigned rows, and used-value summaries | TypeScript | **Presentation-owned.** It consumes canonical integer keys. Technical validity and optimizer eligibility remain Rust-owned. |
| `apps/pile-plan-studio/src/domain/pile-plans/pilePlanActivation.ts` | Per-plan activation editing and multi-plan display unions | TypeScript | **Application/presentation-owned.** These operations edit or summarize canonical user choices; they do not determine technical availability. |
| `apps/pile-plan-studio/src/domain/pile-plans/optimization/optimizationCandidates.ts` | Builds and fingerprints the current UI candidate snapshot | TypeScript snapshot workflow plus Rust invariant | **Application-owned with a core invariant.** TypeScript may preview and detect stale requests; Rust remains authoritative for candidate-source eligibility and limits. |
| `crates/pile-plan-core/src/source_data.rs` | Serializable load points, CPTs, and flat foundation-advice rows | Rust | **Core-owned.** Source records remain independent so CPTs without advice are valid. |
| `crates/pile-plan-core/src/cpt_selection.rs` | Automatic and manual CPT selection and selection geometry | Rust | **Core-owned.** |
| `crates/pile-plan-core/src/pile_options/foundation_advice.rs` | Validated pile configurations, grouped display rows, and the per-batch capacity index | Rust | **Core-owned.** Persisted advice remains flat; runtime lookup is indexed once per batch. |
| `crates/pile-plan-core/src/pile_options/costs.rs` | Pile-cost settings, validation, and physical cost calculation | Rust | **Core-owned.** |
| `crates/pile-plan-core/src/pile_options/mod.rs` | Technical pile-option evaluation and default option selection | Rust | **Core-owned.** |
| `crates/pile-plan-core/src/pile_options/analysis.rs` | Produces the request-scoped `PileOptionAnalysisResult`: selected CPTs, pile options, and optional advice display rows | Rust | **Core-owned orchestrator.** The result is a calculated response, not a persisted all-purpose project-analysis model. The module contains no geometry or cost formula. |
| `crates/pile-plan-core/src/tip_level_regions/*` | Load-point topology, Gabriel graph, bounded faces, and pile-tip-level region grouping | Rust | **Core-owned.** Geometry is scoped to the tip-level-region feature rather than exposed as a generic spatial subsystem. |
| `apps/pile-plan-studio/src/domain/pile-plans/pileCostCatalog.ts` | Immediate row feedback, immutable catalog edits, display partitioning, and merging personal/built-in defaults | TypeScript UI and preference workflow | **Application-owned.** Rust validates persisted project cost rows, including positive unique pile sizes and finite non-negative costs. TypeScript validates only user-entered or preference rows and does not silently reinterpret the canonical project catalog. |
| `apps/pile-plan-studio/src/domain/pile-plans/projectCostSummary.ts` | Sums core-produced costs and counts missing values for display | TypeScript | **Presentation-owned.** It does not calculate physical pile costs. |
| `apps/pile-plan-studio/src/domain/pile-plans/pilePlanManagement.ts` | Plan naming, duplication, active-plan transitions, and installing core optimizer outcomes | TypeScript | **Application-owned.** The optimizer and technical constraints are core-owned; plan lifecycle and history grouping are UI workflow. |
| `apps/pile-plan-studio/src/domain/pile-plans/loadPointLocking.ts` | Edits the lock selection draft and commits it to the active plan | TypeScript | **Application-owned.** Rust consumes locks as hard constraints in assignment and optimization. |
| `apps/pile-plan-studio/src/domain/pile-plans/defaultPileChoices.ts` | Merges core-produced defaults with retained user choices | TypeScript | **Application-owned.** Default option choice itself is Rust-owned. |

## Imports and technical mutations

| Module | Current responsibility | Target owner | Status and action |
| --- | --- | --- | --- |
| `crates/pile-plan-core/src/import/mod.rs` and sibling import modules | Source parsing, profiles, units, diagnostics, project creation, and project refresh reconciliation | Rust | **Core-owned.** |
| `crates/pile-plan-core/src/pile_plan_import.rs` | Pile-plan file parsing, validation, and patch decisions | Rust | **Core-owned.** |
| `apps/pile-plan-studio/src/core/coreImportContract.ts` | File/profile request mapping and structured diagnostic mapping | TypeScript adapter | **Application-owned adapter.** No source-row interpretation belongs here. |
| `apps/pile-plan-studio/src/core/pilePlanImportContract.ts` | Pile-plan import request/result mapping | TypeScript adapter | **Application-owned adapter.** |
| `apps/pile-plan-studio/src/domain/pile-plans/pilePlanImport.ts` | Applies a core-produced import patch as one React/history action and names a new plan | TypeScript | **Application-owned.** Patch semantics are Rust-owned; immutable installation and plan naming remain UI workflow. |
| `apps/pile-plan-studio/src/core/loadPointGroupContract.ts` | Maps grouping and group-assignment requests/results | TypeScript adapter | **Core-owned through delegation.** |
| `apps/pile-plan-studio/src/core/technicalAssignmentContract.ts` | Maps technical assignment requests/results | TypeScript adapter | **Core-owned through delegation.** |
| `apps/pile-plan-studio/src/domain/pile-options/technicalAssignmentNotice.ts` | Turns core assessment facts into selection-aware notice models | TypeScript | **Presentation-owned.** |
| `apps/pile-plan-studio/src/domain/pile-plans/optimization/optimizationSettings.ts` | Parses and edits optimization form values | TypeScript UI; Rust constraints | **Application-owned.** Rust validates and enforces optimizer settings during execution and project read/write. |

## Canonical lifecycle

```text
Open or restore:
IFCPP text -> Rust parse/migrate/default/validate -> canonical schema 4
           -> TypeScript mechanical hydration -> React state

Save or recover:
React project content -> TypeScript mechanical draft extraction
                      -> Rust construct/validate/serialize -> IFCPP text
                      -> file download, native file, or IndexedDB

Domain-sensitive edit:
UI intent -> Rust operation -> atomic result -> one TypeScript history entry
          -> undo/redo restores project content -> Rust-derived analysis refresh
```

No recovery record, undo snapshot, or frontend adapter becomes an alternative
source of engineering truth.
