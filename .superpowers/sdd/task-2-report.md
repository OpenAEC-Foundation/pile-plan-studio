# Task 2 Report: Backward-Compatible Settings Serialization and Adapters

## Changed Files

- `crates/pile-plan-core/src/analysis.rs`
- `crates/pile-plan-core/src/project.rs`
- `crates/pile-plan-core/src/ifcpp.rs`
- `crates/pile-plan-core/src/import.rs`
- `crates/pile-plan-wasm/src/lib.rs`
- `apps/pile-plan-studio/src/core/projectTypes.ts`
- `apps/pile-plan-studio/src/core/projectFile.ts`
- `apps/pile-plan-studio/src/core/coreClient.ts`
- `apps/pile-plan-studio/src/core/projectFile.test.ts`
- `apps/pile-plan-studio/src/components/domain/cptSettingsModel.test.ts`
- `apps/pile-plan-studio/src/components/domain/rightPanelModel.test.ts`

## Red Evidence

- `npm test -- src/core/projectFile.test.ts` failed with the new tests: legacy IFCPP loading did not set `monopolyDistanceM`, and saving did not emit `monopoly_distance_m`.
- `cargo test -p pile-plan-core cpt_selection_settings_default_missing_monopoly_distance_to_one_meter` initially failed to compile because four existing `CptSelectionSettings` fixture literals lacked Task 1's new required field.

## Green Evidence

- `cargo test -p pile-plan-core` passed: 100 tests.
- `cargo test -p pile-plan-wasm` passed: 5 tests.
- `npm test -- src/core/projectFile.test.ts` passed: 234 tests.
- `npx tsc -p tsconfig.json --noEmit` passed.

## Commit

Pending commit.

## Self-Review

- Legacy IFCPP input defaults a missing `monopoly_distance_m` to `1` without changing schema version.
- Newly created IFCPP and both browser WASM/Tauri core requests include the required snake-case field.
- Rust serialization retains the Task 1 serde default and all local defaults now initialize the field explicitly.
- Typed frontend fixture literals were updated so the required UI setting type remains type-safe.

## Concerns

- None.
