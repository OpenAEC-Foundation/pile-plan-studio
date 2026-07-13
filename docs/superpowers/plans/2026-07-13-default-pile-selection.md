# Default Pile Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the sample and newly imported projects with the cheapest valid pile per load point, preserve IFCPP choices, and visualize manually selected `Not OK` and `Missing` piles consistently.

**Architecture:** Add one batched Rust default-selection function that reuses the existing per-load-point cost chooser and expose it through WASM and Tauri. React explicitly tracks whether a project still needs defaults, invokes the batch once after pile analysis, and renders status classes from Rust-calculated options without duplicating domain calculations.

**Tech Stack:** Rust, serde, WASM, Tauri, React, TypeScript, CSS, Node test runner.

## Global Constraints

- Domain validity and cost calculations remain in Rust.
- Default selection runs only for the bundled sample project and newly imported CSV/XLSX projects.
- Opening IFCPP preserves all stored choices and never initializes defaults.
- Only `OK` options may be selected automatically.
- No automatic choice is rendered as a red cross.
- Manually selected `Not OK` options are increasingly red above 100% utilization.
- Manually selected `Missing` options use a fixed yellow marking consistent with the table.
- A failed or stale default-selection request must not overwrite a newer project.

---

### Task 1: Batched Rust Default Selection

**Files:**
- Modify: `crates/pile-plan-core/src/analysis.rs`
- Modify: `crates/pile-plan-core/src/lib.rs`

**Interfaces:**
- Consumes: `HashMap<u32, Vec<PileConfigurationOption>>` and `PileCostSettings`.
- Produces: `choose_default_pile_options(&HashMap<u32, Vec<PileConfigurationOption>>, &PileCostSettings) -> HashMap<u32, PileConfigurationKey>`.

- [ ] **Step 1: Write failing batch-selection tests**

Add tests beside `chooses_the_cheapest_valid_pile_option_by_default` that construct two load points and assert exact returned keys:

```rust
#[test]
fn chooses_default_options_for_all_load_points() {
    let options = HashMap::from([
        (1, vec![option(290, -17.5, true, 0.70), option(320, -17.5, true, 0.60)]),
        (2, vec![option(290, -18.0, true, 0.80)]),
    ]);

    let choices = choose_default_pile_options(&options, &cost_settings());

    assert_eq!(choices.get(&1), Some(&PileConfigurationKey {
        pile_size_mm: 290,
        pile_tip_level_m_key: scaled_level_key(-17.5),
    }));
    assert_eq!(choices.get(&2), Some(&PileConfigurationKey {
        pile_size_mm: 290,
        pile_tip_level_m_key: scaled_level_key(-18.0),
    }));
}

#[test]
fn default_options_omit_load_points_without_valid_options() {
    let options = HashMap::from([(
        1,
        vec![option(290, -17.5, false, 1.10), missing_option(320, -18.0)],
    )]);

    assert!(choose_default_pile_options(&options, &cost_settings()).is_empty());
}

#[test]
fn default_options_omit_valid_options_without_cost_settings() {
    let options = HashMap::from([(1, vec![option(999, -17.5, true, 0.70)])]);
    assert!(choose_default_pile_options(&options, &cost_settings()).is_empty());
}
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cargo test -p pile-plan-core default_options -- --nocapture`

Expected: compilation fails because `choose_default_pile_options` does not exist.

- [ ] **Step 3: Implement the minimal batch function**

First tighten `choose_default_pile_option` so its iterator keeps only valid options for which `calculate_pile_cost(...)` returns `Some`. Then reuse that function rather than duplicating cost ordering:

```rust
pub fn choose_default_pile_options(
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
    settings: &PileCostSettings,
) -> HashMap<u32, PileConfigurationKey> {
    options_by_load_point
        .iter()
        .filter_map(|(load_point_id, options)| {
            choose_default_pile_option(options, settings).map(|option| {
                (*load_point_id, PileConfigurationKey {
                    pile_size_mm: option.pile_size_mm,
                    pile_tip_level_m_key: scaled_level_key(option.pile_tip_level_m),
                })
            })
        })
        .collect()
}
```

Export the function from `crates/pile-plan-core/src/lib.rs`.

- [ ] **Step 4: Run core tests and verify GREEN**

Run: `cargo test -p pile-plan-core`

Expected: all core tests pass, including omission of `Missing` and `Not OK` options.

- [ ] **Step 5: Commit the Rust batch**

```powershell
git add crates/pile-plan-core/src/analysis.rs crates/pile-plan-core/src/lib.rs
git commit -m "feat: batch default pile selection"
```

---

### Task 2: WASM, Tauri, and TypeScript Contract

**Files:**
- Modify: `crates/pile-plan-wasm/src/lib.rs`
- Modify: `apps/pile-plan-studio/src-tauri/src/main.rs`
- Modify: `apps/pile-plan-studio/src/coreClient.ts`
- Modify: `apps/pile-plan-studio/src/projectTypes.ts`
- Regenerate: `apps/pile-plan-studio/src/wasm/pile-plan-wasm/*`

**Interfaces:**
- Consumes: `ChooseDefaultPileOptionsRequest { options_by_load_point, cost_settings }`.
- Produces: Rust/WASM/Tauri command `choose_default_pile_options` returning configuration keys by numeric load-point ID.
- Produces: `chooseDefaultPileOptionsCore(input) -> Promise<Map<number, string>>` using frontend keys in `size|tip` form.

- [ ] **Step 1: Write failing contract tests**

Add a WASM request test proving the map and cost settings deserialize, plus a TypeScript serialization assertion that browser maps remain numeric and Tauri records become string-keyed:

```rust
#[test]
fn default_pile_options_request_accepts_grouped_options() {
    let request: ChooseDefaultPileOptionsRequest = serde_json::from_value(json!({
        "options_by_load_point": { "1": [] },
        "cost_settings": cost_settings()
    })).unwrap();
    assert!(request.options_by_load_point.contains_key(&1));
}
```

- [ ] **Step 2: Verify contract tests are RED**

Run: `cargo test -p pile-plan-wasm default_pile_options -- --nocapture`

Expected: request type and command are missing.

- [ ] **Step 3: Expose matching Rust commands**

Add the request type and wrappers in WASM and Tauri:

```rust
#[derive(Deserialize)]
struct ChooseDefaultPileOptionsRequest {
    options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    cost_settings: PileCostSettings,
}
```

Both wrappers call `pile_plan_core::choose_default_pile_options` and serialize the same `HashMap<u32, PileConfigurationKey>` result. Register the Tauri command in `generate_handler!`.

- [ ] **Step 4: Add the single frontend client method**

Implement one browser/Tauri boundary:

```ts
export async function chooseDefaultPileOptionsCore(input: {
  optionsByLoadPointId: Map<number, PileConfigurationOption[]>;
  costSettings: PileCostSettings;
}): Promise<Map<number, string>>;
```

Convert returned `PileConfigurationKey` values with the existing scaled-key helper so React receives `size|tip` strings. Do not call the existing single-option API in a loop.

- [ ] **Step 5: Build bindings and verify both runtimes**

Run:

```powershell
npm run build:wasm --prefix apps/pile-plan-studio
cargo test --workspace
cargo check --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml
.\apps\pile-plan-studio\node_modules\.bin\tsc.cmd -p apps\pile-plan-studio\tsconfig.json --noEmit
```

Expected: all commands exit successfully and generated bindings contain `choose_default_pile_options`.

- [ ] **Step 6: Commit the unified contract**

```powershell
git add crates/pile-plan-wasm apps/pile-plan-studio/src-tauri/src/main.rs apps/pile-plan-studio/src/coreClient.ts apps/pile-plan-studio/src/projectTypes.ts apps/pile-plan-studio/src/wasm/pile-plan-wasm
git commit -m "feat: expose default pile selection"
```

---

### Task 3: One-Time React Project Initialization

**Files:**
- Modify: `apps/pile-plan-studio/src-react/domain/projectState.ts`
- Modify: `apps/pile-plan-studio/src-react/App.tsx`
- Modify: `apps/pile-plan-studio/src-react/AppStartup.test.ts`
- Modify: `apps/pile-plan-studio/src-react/components/domain/RightPanel.tsx`
- Modify: React test fixtures containing complete `ProjectState` values.

**Interfaces:**
- Produces: `defaultPileSelectionPending: boolean` in `ProjectState`.
- Changes: `createInitialProjectState(input, { initializeDefaultPiles })` requires an explicit initialization policy.
- Consumes: `chooseDefaultPileOptionsCore` from Task 2.

- [ ] **Step 1: Write failing lifecycle tests**

Test these three construction paths explicitly:

```ts
const sample = createInitialProjectState(sampleProjectText, { initializeDefaultPiles: true });
assert.equal(sample.defaultPileSelectionPending, true);

const opened = createInitialProjectState(sampleProjectText, { initializeDefaultPiles: false });
assert.equal(opened.defaultPileSelectionPending, false);
assert.deepEqual(opened.selectedPileOptionKeysByLoadPoint, persistedChoices);
```

Add source-level startup assertions that the import path passes `true`, the IFCPP-open path passes `false`, and the effect calls `chooseDefaultPileOptionsCore` once only when options exist and the pending flag is true.

- [ ] **Step 2: Run focused React tests and verify RED**

Run:

```powershell
node --test --test-reporter=spec apps/pile-plan-studio/src-react/AppStartup.test.ts apps/pile-plan-studio/src-react/domain/projectState.test.ts
```

Expected: failures for the missing policy argument, state flag, and batch client call.

- [ ] **Step 3: Add explicit initialization policy**

Change the constructor signature and state:

```ts
type InitialProjectStateOptions = { initializeDefaultPiles: boolean };

export function createInitialProjectState(
  input: string | IfcppProject,
  options: InitialProjectStateOptions,
): ProjectState {
  return {
    ...projectData,
    defaultPileSelectionPending: options.initializeDefaultPiles,
  };
}
```

Use `{ initializeDefaultPiles: true }` for module startup and successful file import. Use `{ initializeDefaultPiles: false }` when opening an IFCPP file. Update test callers explicitly.

- [ ] **Step 4: Add guarded one-time selection effect**

After analysis results are stored, invoke the batch only when pending and options cover the complete project. Capture the current project identity/request, clear pending before awaiting to prevent duplicate calls during unrelated renders, and discard stale results:

```ts
if (!projectState.defaultPileSelectionPending || projectState.pileOptionsByLoadPointId.size === 0) return;

const analysisRequest = projectState.analysisRequest;
setProjectState((current) => current.analysisRequest !== analysisRequest ? current : {
  ...current,
  defaultPileSelectionPending: false,
});

chooseDefaultPileOptionsCore({
  optionsByLoadPointId: projectState.pileOptionsByLoadPointId,
  costSettings: projectState.pileCostSettings,
}).then((choices) => {
  setProjectState((current) => current.analysisRequest !== analysisRequest ? current : {
    ...current,
    selectedPileOptionKeysByLoadPoint: choices,
  });
});
```

Require `pileOptionsByLoadPointId.size === loadPoints.length` before starting. On failure, keep pending cleared and store a user-visible error so the app remains usable. Extend the right panel's error banner to show this error even though pile options are already available. Never mutate choices loaded from IFCPP.

- [ ] **Step 5: Verify lifecycle tests and complete TypeScript state fixtures**

Run:

```powershell
node --test --test-reporter=spec apps/pile-plan-studio/src-react/AppStartup.test.ts apps/pile-plan-studio/src-react/domain/projectState.test.ts
.\apps\pile-plan-studio\node_modules\.bin\tsc.cmd -p apps\pile-plan-studio\tsconfig.json --noEmit
```

Expected: focused tests and type checking pass.

- [ ] **Step 6: Commit project initialization**

```powershell
git add apps/pile-plan-studio/src-react/App.tsx apps/pile-plan-studio/src-react/AppStartup.test.ts apps/pile-plan-studio/src-react/domain/projectState.ts apps/pile-plan-studio/src-react/domain/projectState.test.ts apps/pile-plan-studio/src-react/components/domain/*.test.ts
git commit -m "feat: initialize cheapest valid piles"
```

---

### Task 4: React Marker Status Visualization

**Files:**
- Modify: `apps/pile-plan-studio/src/loadPointMarker.ts`
- Modify: `apps/pile-plan-studio/src/loadPointMarker.test.ts`
- Modify: `apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.tsx`
- Modify: `apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.test.ts`
- Modify: `apps/pile-plan-studio/src-react/components/domain/viewer.css`

**Interfaces:**
- Consumes: the selected load point's `PileConfigurationOption`, including `isOption`, `utilization`, and missing FRD state.
- Produces: `getLoadPointMarkerStatusVisual(option) -> { className, style }` with normal, red-gradient, or yellow-missing output.

- [ ] **Step 1: Write failing status-visual tests**

Extend the existing marker tests:

```ts
it("marks missing selected options yellow", () => {
  assert.deepEqual(getLoadPointMarkerStatusVisual(missingOption()), {
    className: " is-missing",
    style: "",
  });
});

it("increases red intensity above 100 percent", () => {
  const slight = getLoadPointMarkerStatusVisual(option({ isOption: false, utilization: 1.05 }));
  const severe = getLoadPointMarkerStatusVisual(option({ isOption: false, utilization: 1.45 }));
  assert.ok(intensity(severe.style) > intensity(slight.style));
});
```

Add a viewer assertion that the chosen option is looked up from `pileOptionsByLoadPointId` and its class/style are applied to the marker.

- [ ] **Step 2: Run marker tests and verify RED**

Run:

```powershell
node --test --test-reporter=spec apps/pile-plan-studio/src/loadPointMarker.test.ts apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.test.ts
```

Expected: missing status and React marker integration are absent.

- [ ] **Step 3: Distinguish missing from overloaded options**

Treat an option as missing when its required FRD/utilization fields are absent. Keep the existing bounded red intensity for complete `Not OK` options:

```ts
if (chosenOption.governing_frd_kn === null || chosenOption.utilization === null) {
  return { className: " is-missing", style: "" };
}
if (!chosenOption.isOption) {
  const overrun = Math.max(0, chosenOption.utilization - 1);
  const intensity = Math.min(0.9, 0.2 + overrun * 1.4);
  return { className: " is-invalid", style: `--invalid-intensity: ${formatCssNumber(intensity)};` };
}
return { className: "", style: "" };
```

- [ ] **Step 4: Apply status to React markers**

Change `getSelectedPileOption` to return the matching calculated option rather than a size/tip-only object. Add the status class and CSS custom property to each load-point button. Preserve `load-point-empty` for no selection.

Add `.load-point-marker.is-missing` with a yellow fill/outline using the same warning color family as the table. Port the existing red gradient rules from `src/styles.css` into `src-react/components/domain/viewer.css`, scaled to current marker dimensions. Keep `.is-selected::before` as the outer circular selection indicator.

- [ ] **Step 5: Run complete verification**

Run:

```powershell
cargo fmt --all --check
cargo test --workspace
cargo check --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml
.\apps\pile-plan-studio\node_modules\.bin\tsc.cmd -p apps\pile-plan-studio\tsconfig.json --noEmit
npm test --prefix apps/pile-plan-studio
npm run build:react --prefix apps/pile-plan-studio
```

Expected: Rust, WASM, Tauri, all web tests, and the production React build pass.

- [ ] **Step 6: Verify live behavior**

In `http://127.0.0.1:5180/index.react.html` verify:

- sample project starts with cheapest valid symbols instead of crosses;
- a newly imported LIS project initializes choices after analysis;
- an opened IFCPP retains its stored choices;
- a location with no valid option remains a red cross;
- manually choosing `Not OK` produces utilization-dependent red;
- manually choosing `Missing` produces yellow.

- [ ] **Step 7: Commit the visualization**

```powershell
git add apps/pile-plan-studio/src/loadPointMarker.ts apps/pile-plan-studio/src/loadPointMarker.test.ts apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.tsx apps/pile-plan-studio/src-react/components/domain/PilePlanViewer.test.ts apps/pile-plan-studio/src-react/components/domain/viewer.css
git commit -m "feat: visualize invalid pile choices"
```
