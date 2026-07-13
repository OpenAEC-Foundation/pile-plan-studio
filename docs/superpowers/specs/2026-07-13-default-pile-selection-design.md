# Default Pile Selection Design

## Goal

Give every load point in a newly imported project, and in the bundled sample project, the cheapest valid pile configuration after pile-option analysis. Preserve all pile choices stored in an opened IFCPP project.

## Initialization Scope

Default selection runs once for:

- the bundled sample project;
- a new project created from CSV/XLSX imports.

Opening an existing IFCPP project skips default selection. Its stored choices remain unchanged, including choices that are currently `Not OK` or `Missing`.

Default selection never reruns after CPT settings, costs, or manual pile choices change. This prevents automatic behavior from overwriting user decisions.

## Selection Rules

Rust receives all calculated pile options and the active pile-cost settings in one batched request. For each load point it:

1. considers only options with status `OK`;
2. calculates their pile costs using the existing cost model;
3. selects the lowest-cost option;
4. returns no choice when no valid costed option exists.

`Missing` and `Not OK` options are never selected automatically. A load point without an automatic choice is rendered as a red cross. The user may still manually select any listed option.

The batched Rust operation avoids one WASM or Tauri call per load point. React stores only the returned configuration keys and does not duplicate cost or validity calculations.

## Project Lifecycle

React project state records whether default selection is pending. The sample-project and import paths create state with this flag enabled; the IFCPP-open path creates state with it disabled.

After the initial batched pile-option analysis completes, React requests the batched Rust default choices when initialization is pending. The result replaces the empty initial selection map and clears the pending flag. Empty results are valid and leave affected load points as crosses.

The operation is guarded by project/request identity so a late result from an older project cannot overwrite a newly opened project.

## Invalid Choice Visualization

For every selected load point, React finds the selected configuration in that load point's Rust-calculated option list and applies the existing marker visual model:

- `OK`: normal pile symbol;
- `Not OK`: red marking whose intensity increases with utilization above 100%;
- `Missing`: fixed yellow marking, consistent with the pile-options table;
- no selected configuration: red cross.

The utilization value and option status come from Rust. React only maps that result to CSS classes and intensity variables. Selected markers retain their normal circular selection outline in addition to the status marking.

## Error Handling

Failure of default selection must not block project use or pile-option display. The project remains loaded with red crosses, and the existing analysis-error surface reports the failure. Manual pile selection remains available.

## Testing

Tests cover:

- batched Rust selection chooses the cheapest `OK` option per load point;
- `Missing` and `Not OK` options are excluded from automatic selection;
- load points without valid costed options return no choice;
- sample and imported projects request initialization, while opened IFCPP projects preserve stored choices;
- initialization runs once after options become available and ignores stale project results;
- `Not OK` marker intensity increases with utilization;
- `Missing` choices use the fixed yellow marker treatment;
- no choice remains a red cross;
- Rust, WASM, Tauri, TypeScript, React, and production builds remain green.
