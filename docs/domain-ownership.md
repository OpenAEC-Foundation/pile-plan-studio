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
- **Migration target:** the current TypeScript implementation still
  interprets project data or duplicates a rule that must become exclusively
  core-owned.

## Project documents and persistence

| Module | Current responsibility | Target owner | Status and action |
| --- | --- | --- | --- |
| `crates/pile-plan-core/src/project.rs` | IFCPP project structures, serde defaults, legacy plan deserialization, exact tip-level keys | Rust | **Core-owned.** Retain project-owned data types and consolidate defaults here or in the canonical document boundary. |
| `crates/pile-plan-core/src/ifcpp.rs` | JSON parsing, schemas 1–4 migration, validation, canonical schema-4 writing | Rust | **Core-owned.** Extend to the complete read/write contract and structured project errors. |
| `crates/pile-plan-wasm/src/lib.rs` | Browser exports for project read/write and imports | Adapter only | **Core-owned through delegation.** Keep serialization mechanical. |
| `apps/pile-plan-studio/src-tauri/src/main.rs` | Desktop commands and native file access | Adapter and application infrastructure | **Core-owned through delegation** for project interpretation; native file access remains application infrastructure. |
| `apps/pile-plan-studio/src/core/projectFile.ts` | Mechanical hydration of canonical project data, immutable copies, import summaries, and legend presentation mapping | TypeScript adapter and presentation | **Application/presentation-owned.** Schema branching, project defaults, validation, canonical construction, and float-derived identity are Rust-owned. |
| `apps/pile-plan-studio/src/core/pileTipLevelContract.ts` | Tip-level-specific project validation outcome and error mapping | General Rust project contract with TypeScript localization | **Migration target.** Fold into a complete project-document contract so project validity is not modeled as only a tip-level concern. |
| `apps/pile-plan-studio/src/core/coreClient.ts` | Chooses WASM or Tauri and maps requests/results | TypeScript adapter | **Application-owned adapter.** It must not add defaults, validation, or repair. |
| `apps/pile-plan-studio/src/domain/openedProject.ts` | Coordinates one canonical core read and creates state only after that read succeeds | TypeScript workflow | **Application-owned.** Open is atomic and performs no independent project interpretation or duplicate position validation. |
| `apps/pile-plan-studio/src/domain/projectState.ts` | Creates React project state and transient selection/request state | TypeScript | **Application-owned.** Consume only canonical project data; localized initial plan naming remains UI workflow. |
| `apps/pile-plan-studio/src/domain/projectContent.ts` | Captures/restores undoable content, calculates analysis invalidation, and extracts a mechanical project-document draft | TypeScript for history and draft extraction; Rust for project construction | **Application-owned.** The draft contains React-owned project content; Rust constructs, validates, normalizes, and serializes the IFCPP document. |
| `apps/pile-plan-studio/src/domain/projectPersistence.ts` | Save/download choice, filenames, browser download, and native file commands | TypeScript | **Application-owned.** It writes text already serialized by Rust. |
| `apps/pile-plan-studio/src/domain/browserRecovery.ts` | Versioned recovery-envelope validation and metadata around opaque Rust-serialized IFCPP text | TypeScript envelope; Rust project validation | **Application-owned.** The envelope does not parse IFCPP or maintain an independent supported-schema list; restored text must pass the canonical Rust read contract. |
| `apps/pile-plan-studio/src/domain/browserRecoveryStartup.ts` | Safe startup restore/fallback orchestration | TypeScript | **Application-owned.** Continue sending restored IFCPP text through the same Rust read contract as file open. |
| `apps/pile-plan-studio/src/domain/browserRecoveryStore.ts` | IndexedDB access, debounce, ordered writes, flush, and disposal | TypeScript | **Application-owned.** Store only successfully Rust-serialized canonical IFCPP text. |
| `apps/pile-plan-studio/src/App.tsx` | Connects project state, canonical core read/write calls, save baseline, dirty state, and recovery scheduling | TypeScript workflow | **Application-owned.** File open, sample open, import, refresh, save, and recovery use the shared project-document contract; gesture grouping, request lifetimes, dirty-state baseline, and persistence timing remain interface workflow. |

## History and interface state

| Module | Current responsibility | Target owner | Status and action |
| --- | --- | --- | --- |
| `apps/pile-plan-studio/src/domain/projectHistory.ts` | Bounded immutable project-content history | TypeScript | **Application-owned.** Rust does not decide gesture boundaries. |
| `apps/pile-plan-studio/src/domain/projectHistoryReducer.ts` | Commits, amends, undoes, and redoes atomic UI actions | TypeScript | **Application-owned.** Core results become one history entry; restored content invalidates derived analysis. |
| `apps/pile-plan-studio/src/domain/historyAction.ts` | Describes user actions for undo/redo notices | TypeScript | **Presentation-owned.** |
| `apps/pile-plan-studio/src/domain/historyMessage.ts` | Localized undo/redo message selection | TypeScript | **Presentation-owned.** |
| `apps/pile-plan-studio/src/domain/userSettings.ts` and `userSettingsStore.ts` | Application-wide preferences and personal cost defaults | TypeScript | **Application-owned.** Personal defaults are not IFCPP content; applying one creates a project edit that Rust validates at the boundary. |
| `apps/pile-plan-studio/src/domain/viewerPreferences.ts` | Application-wide viewer preferences | TypeScript | **Application-owned.** Project-owned viewer settings remain part of the canonical project document. |

## Configuration availability, costs, and plans

| Module | Current responsibility | Target owner | Status and action |
| --- | --- | --- | --- |
| `apps/pile-plan-studio/src/domain/activePileConfigurations.ts` | Legend activation toggles, UI filtering, retained assigned rows, and used-value summaries | TypeScript | **Presentation-owned.** It consumes canonical integer keys. Technical validity and optimizer eligibility remain Rust-owned. |
| `apps/pile-plan-studio/src/domain/pilePlanActivation.ts` | Per-plan activation editing and multi-plan display unions | TypeScript | **Application/presentation-owned.** These operations edit or summarize canonical user choices; they do not determine technical availability. |
| `apps/pile-plan-studio/src/domain/optimizationCandidates.ts` | Builds and fingerprints the current UI candidate snapshot | TypeScript snapshot workflow plus Rust invariant | **Application-owned with a core invariant.** TypeScript may preview and detect stale requests; Rust remains authoritative for candidate-source eligibility and limits. |
| `crates/pile-plan-core/src/analysis.rs` | Physical pile-cost calculation | Rust | **Core-owned.** |
| `apps/pile-plan-studio/src/domain/pileCostCatalog.ts` | Immediate row feedback, immutable catalog edits, display partitioning, and merging personal/built-in defaults | TypeScript UI and preference workflow | **Application-owned.** Rust validates persisted project cost rows, including positive unique pile sizes and finite non-negative costs. TypeScript validates only user-entered or preference rows and does not silently reinterpret the canonical project catalog. |
| `apps/pile-plan-studio/src/domain/projectCostSummary.ts` | Sums core-produced costs and counts missing values for display | TypeScript | **Presentation-owned.** It does not calculate physical pile costs. |
| `apps/pile-plan-studio/src/domain/pilePlanManagement.ts` | Plan naming, duplication, active-plan transitions, and installing core optimizer outcomes | TypeScript | **Application-owned.** The optimizer and technical constraints are core-owned; plan lifecycle and history grouping are UI workflow. |
| `apps/pile-plan-studio/src/domain/loadPointLocking.ts` | Edits the lock selection draft and commits it to the active plan | TypeScript | **Application-owned.** Rust consumes locks as hard constraints in assignment and optimization. |
| `apps/pile-plan-studio/src/domain/defaultPileChoices.ts` | Merges core-produced defaults with retained user choices | TypeScript | **Application-owned.** Default option choice itself is Rust-owned. |

## Imports and technical mutations

| Module | Current responsibility | Target owner | Status and action |
| --- | --- | --- | --- |
| `crates/pile-plan-core/src/import.rs` and `src/import/*` | Source parsing, profiles, units, diagnostics, project creation, and project refresh reconciliation | Rust | **Core-owned.** |
| `crates/pile-plan-core/src/pile_plan_import.rs` | Pile-plan file parsing, validation, and patch decisions | Rust | **Core-owned.** |
| `apps/pile-plan-studio/src/core/coreImportContract.ts` | File/profile request mapping and structured diagnostic mapping | TypeScript adapter | **Application-owned adapter.** No source-row interpretation belongs here. |
| `apps/pile-plan-studio/src/core/pilePlanImportContract.ts` | Pile-plan import request/result mapping | TypeScript adapter | **Application-owned adapter.** |
| `apps/pile-plan-studio/src/domain/pilePlanImport.ts` | Applies a core-produced import patch as one React/history action and names a new plan | TypeScript | **Application-owned.** Patch semantics are Rust-owned; immutable installation and plan naming remain UI workflow. |
| `apps/pile-plan-studio/src/core/loadPointGroupContract.ts` | Maps grouping and group-assignment requests/results | TypeScript adapter | **Core-owned through delegation.** |
| `apps/pile-plan-studio/src/core/technicalAssignmentContract.ts` | Maps technical assignment requests/results | TypeScript adapter | **Core-owned through delegation.** |
| `apps/pile-plan-studio/src/domain/technicalAssignmentNotice.ts` | Turns core assessment facts into selection-aware notice models | TypeScript | **Presentation-owned.** |
| `apps/pile-plan-studio/src/domain/optimizationSettings.ts` | Parses and edits optimization form values | TypeScript UI; Rust constraints | **Application-owned.** Rust validates and enforces optimizer settings during execution and project read/write. |

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
