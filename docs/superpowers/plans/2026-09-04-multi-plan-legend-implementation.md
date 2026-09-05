# Multi-plan Legend Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make legend activation pile-plan-specific, add explicit optimizer candidate sources, and keep inactive used configurations understandable throughout the viewer and option UI.

**Architecture:** IFCPP schema 4 moves active size and tip arrays into each pile plan while leaving appearance project-wide. TypeScript exposes one active-plan selector instead of mirrored top-level activation, and Rust receives exact resolved configuration keys for optimization. Pure presentation helpers implement the four fallback states so viewer, compact legend, and pile-option rows share one interpretation.

**Tech Stack:** Rust 2021, Serde, wasm-bindgen, TypeScript 6, React 19, Node test runner, Vite, Tauri 2, i18next.

**Spec:** `docs/superpowers/specs/2026-09-04-multi-plan-legend-design.md`

## Global Constraints

- Target Pile Plan Studio 0.3.1-alpha, but do not bump package versions until release preparation.
- Read IFCPP schemas 1-4 and write schema 4; saving is the point at which an older file becomes schema 4.
- Colors, symbols, palette, encoding mode, and assignment metadata remain project-wide.
- Active pile sizes and active pile-tip levels belong only to individual pile plans.
- New optimizer candidate source defaults to `all_available`; `active_legend` resolves against the current plan at run time.
- A new optimization plan activates every property value in the resolved candidate set, not merely values used in the result.
- Issue #32 and a third/dual-color encoding mode remain outside this plan.
- Browser/WASM and desktop/Tauri contracts must remain equivalent.
- Every behavior change follows red-green TDD and every task ends in a focused commit.

## File Structure

- `crates/pile-plan-core/src/project.rs`: schema-4 Rust project, pile-plan, and persisted optimizer-setting types.
- `crates/pile-plan-core/src/ifcpp.rs`: JSON migration from schemas 1-3 and schema-version validation/writing.
- `crates/pile-plan-core/src/optimization_units.rs`: exact configuration-domain filtering for technical optimizer preparation.
- `crates/pile-plan-core/src/greedy_optimizer.rs`: exact candidate input and greedy limit application.
- `crates/pile-plan-core/src/import.rs` and `crates/pile-plan-core/src/import/refresh.rs`: default activation and per-plan refresh reconciliation.
- `crates/pile-plan-wasm/src/lib.rs`: WASM fixtures/contract coverage after the Rust input change.
- `apps/pile-plan-studio/src/core/projectTypes.ts`: shared TypeScript candidate-source and optimizer request types.
- `apps/pile-plan-studio/src/core/projectFile.ts`: schema-4 browser loading, migration, and serialization.
- `apps/pile-plan-studio/src/domain/pilePlanActivation.ts`: focused active-plan lookup, activation copying, union, and candidate-derived activation helpers.
- `apps/pile-plan-studio/src/domain/pilePlanManagement.ts`: activation-aware create, switch, duplicate, optimize, and delete transitions.
- `apps/pile-plan-studio/src/domain/pilePlanImport.ts`: source-plan activation copying for imported pile plans.
- `apps/pile-plan-studio/src/domain/projectContent.ts` and `historyAction.ts`: undo/dirty-state ownership after top-level activation removal.
- `apps/pile-plan-studio/src/domain/legendEditorModel.ts`: scope-aware bulk and automatic assignment operations.
- `apps/pile-plan-studio/src/domain/legendConflicts.ts`: pure co-active duplicate color/symbol detection.
- `apps/pile-plan-studio/src/domain/legendActivationPresentation.ts`: shared four-state visual resolution.
- `apps/pile-plan-studio/src/domain/legendState.ts`: compact-legend used/active presentation.
- `apps/pile-plan-studio/src/components/domain/LegendEditor.tsx` and `.css`: temporary plan scope, `+n` badges, and conflict notices.
- `apps/pile-plan-studio/src/components/domain/Legend.tsx`: current-plan quick activation and neutral compact entries.
- `apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx` and `viewer.css`: fallback marker rendering without changing interaction hit targets.
- `apps/pile-plan-studio/src/components/domain/rightPanelModel.ts`, `RightPanel.tsx`, and `rightPanel.css`: retained current assignment and inactive-property labels.
- `apps/pile-plan-studio/src/components/domain/optimizationPanelModel.ts` and `OptimizationPanel.tsx`: resolved candidates, post-resolution clamping, source control, and empty-domain message.
- `apps/pile-plan-studio/src/core/greedyOptimizationContract.ts` and `apps/pile-plan-studio/src/App.tsx`: exact candidate snapshot across browser/desktop requests and result application.
- `apps/pile-plan-studio/src/i18n/locales/{nl,en}/{common,rightPanel}.json`: localized editor, fallback, and optimizer copy.

---

### Task 1: Rust schema 4 and exact optimizer candidate domain

**Files:**
- Modify: `crates/pile-plan-core/src/project.rs:55-190`
- Modify: `crates/pile-plan-core/src/ifcpp.rs:1-225`
- Modify: `crates/pile-plan-core/src/optimization_units.rs:1-310`
- Modify: `crates/pile-plan-core/src/greedy_optimizer.rs:1-290`
- Modify: `crates/pile-plan-core/src/import.rs:260-345`
- Modify: `crates/pile-plan-core/src/import/refresh.rs:190-325`
- Modify: `crates/pile-plan-core/src/lib.rs`
- Modify: `crates/pile-plan-wasm/src/lib.rs:500-550`
- Test: inline Rust tests in every modified module

**Interfaces:**
- Produces: `OptimizationCandidateSource::{AllAvailable, ActiveLegend}` serialized as `all_available` and `active_legend`.
- Produces: `PilePlan.active_pile_sizes: Vec<u32>` and `PilePlan.active_pile_tip_levels: Vec<f64>`.
- Produces: `GreedyOptimizationInput.candidate_configurations: Vec<PileConfigurationKey>`.
- Produces: `OptimizationCandidateSettings.enabled_configurations: Vec<PileConfigurationKey>`.
- Removes from persisted settings: `enabled_pile_sizes` and `enabled_pile_tip_levels`.

- [ ] **Step 1: Add failing schema migration and round-trip tests**

```rust
#[test]
fn schema_three_activation_migrates_to_every_pile_plan() {
    let mut value = serde_json::to_value(project_fixture()).unwrap();
    value["schema_version"] = serde_json::json!(3);
    value["settings"]["active_pile_sizes"] = serde_json::json!([290, 320]);
    value["settings"]["active_pile_tip_levels"] = serde_json::json!([-17.5, -18.0]);
    value["user_state"]["pile_plans"] = serde_json::json!([
        { "id": "a", "name": "A", "selected_piles": {}, "locked_load_point_ids": [] },
        { "id": "b", "name": "B", "selected_piles": {}, "locked_load_point_ids": [] }
    ]);

    let project = read_ifcpp_str(&serde_json::to_string(&value).unwrap()).unwrap();
    assert_eq!(project.schema_version, 4);
    assert!(project.user_state.pile_plans.iter().all(|plan| {
        plan.active_pile_sizes == vec![290, 320]
            && plan.active_pile_tip_levels == vec![-17.5, -18.0]
    }));
    assert_eq!(project.settings.optimization.candidate_source,
        OptimizationCandidateSource::AllAvailable);
}

#[test]
fn schema_four_round_trips_distinct_plan_activation() {
    let mut project = project_fixture();
    project.schema_version = 4;
    project.user_state.pile_plans[0].active_pile_sizes = vec![290];
    project.user_state.pile_plans.push(PilePlan {
        id: "b".into(), name: "B".into(), active_pile_sizes: vec![320],
        active_pile_tip_levels: vec![-19.0], selected_piles: HashMap::new(),
        locked_load_point_ids: vec![], optimization_unassigned: HashMap::new(),
    });
    assert_eq!(read_ifcpp_str(&write_ifcpp_string(&project).unwrap()).unwrap(), project);
}
```

- [ ] **Step 2: Run the focused Rust tests and confirm the new fields/version fail**

Run: `cargo test -p pile-plan-core ifcpp::tests -- --nocapture`

Expected: FAIL because schema 4, per-plan activation, and `candidate_source` do not exist.

- [ ] **Step 3: Implement sequential JSON migration and schema-4 structs**

```rust
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OptimizationCandidateSource { AllAvailable, ActiveLegend }

impl Default for OptimizationCandidateSource {
    fn default() -> Self { Self::AllAvailable }
}

pub struct GreedyOptimizationSettings {
    pub max_pile_sizes: usize,
    pub max_pile_tip_levels: usize,
    pub max_pile_configurations: usize,
    #[serde(default = "default_max_utilization")]
    pub max_utilization: f64,
    #[serde(default)]
    pub candidate_source: OptimizationCandidateSource,
}

pub struct PilePlan {
    // existing identity and assignment fields
    pub active_pile_sizes: Vec<u32>,
    pub active_pile_tip_levels: Vec<f64>,
}
```

Make `migrate_legacy_project_value` normalize schemas 1/2 as it does now, then
for every schema below 4: create the legacy default pile-plan wire object when
necessary, copy both old settings arrays into every wire plan, set optimizer
`candidate_source` to `all_available`, remove the two project-level activation
keys and the two nested legacy optimizer-enabled keys, and finally set
`schema_version` to 4. Make writing canonicalize any supported
in-memory project to 4 and validation accept exactly 1-4.

- [ ] **Step 4: Add failing exact-domain optimizer tests**

```rust
#[test]
fn candidate_domain_does_not_fill_cartesian_gaps() {
    let mut input = input_fixture();
    input.candidate_configurations = vec![
        PileConfigurationKey::from_metres(290, -18.0),
        PileConfigurationKey::from_metres(320, -19.0),
    ];
    let outcome = greedy_optimize_pile_choices(&input);
    let selected = completed(outcome).selected_configurations;
    assert!(!selected.contains(&PileConfigurationKey::from_metres(290, -19.0)));
    assert!(!selected.contains(&PileConfigurationKey::from_metres(320, -18.0)));
}
```

- [ ] **Step 5: Run the optimizer test and confirm legacy size/tip filtering fails it**

Run: `cargo test -p pile-plan-core candidate_domain_does_not_fill_cartesian_gaps -- --nocapture`

Expected: FAIL until preparation filters by exact canonical keys.

- [ ] **Step 6: Replace size/tip candidate filtering with exact configuration keys**

```rust
pub struct GreedyOptimizationInput {
    // existing fields
    pub candidate_configurations: Vec<PileConfigurationKey>,
    pub settings: GreedyOptimizationSettings,
}

pub struct OptimizationCandidateSettings {
    pub max_utilization: f64,
    pub enabled_configurations: Vec<PileConfigurationKey>,
}

let enabled = input.candidate_settings.enabled_configurations
    .iter().cloned().collect::<HashSet<_>>();
// eligibility condition:
enabled.contains(&candidate.configuration)
```

Update all Rust fixtures and WASM calls. Reconcile activation inside every
`project.user_state.pile_plans` during source refresh: retain still-available
values, remove disappeared values, and append newly available values. New
imported projects initialize every available value in their default plan.

- [ ] **Step 7: Run all Rust and WASM tests**

Run: `cargo test --workspace`

Expected: PASS with schema 1-4, refresh, exact-domain, core, and WASM tests all green.

- [ ] **Step 8: Commit the Rust boundary**

```bash
git add crates/pile-plan-core crates/pile-plan-wasm
git commit -m "feat: add per-plan legend schema"
```

### Task 2: TypeScript schema 4 and single activation source of truth

**Files:**
- Create: `apps/pile-plan-studio/src/domain/pilePlanActivation.ts`
- Create: `apps/pile-plan-studio/src/domain/pilePlanActivation.test.ts`
- Modify: `apps/pile-plan-studio/src/core/projectTypes.ts:80-110`
- Modify: `apps/pile-plan-studio/src/core/projectFile.ts:1-435`
- Modify: `apps/pile-plan-studio/src/core/projectFile.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectState.ts:55-165`
- Modify: all frontend consumers returned by `rg -n "activePileSizes|activePileTipLevels" apps/pile-plan-studio/src`

**Interfaces:**
- Consumes: schema-4 fields and `OptimizationCandidateSource` from Task 1.
- Produces: `getActivePilePlan(state): PilePlanData` and `getPilePlanActivation(plan): ActivePileConfigurations`.
- Produces: `PilePlanData.activePileSizes` and `PilePlanData.activePileTipLevels`.
- Removes: top-level `LoadedProjectData.activePileSizes` and `activePileTipLevels`.

- [ ] **Step 1: Write failing browser migration and ownership tests**

```ts
it("copies schema-three activation into every plan and writes only schema four fields", () => {
  const loaded = loadIfcppProjectData(schemaThreeFixtureWithTwoPlans());
  assert.deepEqual(loaded.pilePlans.map(getPilePlanActivation), [
    { pileSizes: [290, 320], pileTipLevels: [-17.5, -18] },
    { pileSizes: [290, 320], pileTipLevels: [-17.5, -18] },
  ]);
  const saved = createIfcppProject(loaded);
  assert.equal(saved.schema_version, 4);
  assert.equal("active_pile_sizes" in saved.settings, false);
  assert.deepEqual(saved.user_state.pile_plans?.[1].active_pile_sizes, [290, 320]);
});
```

- [ ] **Step 2: Run the project-file test and confirm it fails on schema 4**

Run from `apps/pile-plan-studio`: `node --test src/core/projectFile.test.ts`

Expected: FAIL because activation still lives in project settings and version 4 is rejected.

- [ ] **Step 3: Implement TypeScript wire types, migration, and selectors**

```ts
export type OptimizationCandidateSource = "all_available" | "active_legend";

export type PilePlanData = {
  id: string;
  name: string;
  activePileSizes: number[];
  activePileTipLevels: number[];
  // existing plan fields
};

export function getPilePlanActivation(plan: PilePlanData): ActivePileConfigurations {
  return { pileSizes: [...plan.activePileSizes], pileTipLevels: [...plan.activePileTipLevels] };
}

export function getActivePilePlan(state: Pick<ProjectState, "pilePlans" | "activePilePlanId">) {
  return state.pilePlans.find(({ id }) => id === state.activePilePlanId) ?? state.pilePlans[0];
}
```

Accept schemas 1-4 in `projectFile.ts`; for 1-3 use the legacy settings arrays
as the fallback passed to every plan conversion. Require plan arrays for schema
4, write version 4, omit project-level activation, and normalize candidate
source to `all_available` unless it is exactly `active_legend`.

- [ ] **Step 4: Replace top-level reads with the active-plan selector**

Use this pattern in `App.tsx`, `Legend.tsx`, `LegendEditor.tsx`,
`OptimizationPanel.tsx`, `PilePlanViewer.tsx`, `RightPanel.tsx`, test fixtures,
and every remaining search result:

```ts
const activePilePlan = getActivePilePlan(state);
const activation = getPilePlanActivation(activePilePlan);
```

Do not add compatibility getters or mirrored arrays to `ProjectState`.

- [ ] **Step 5: Run schema tests and TypeScript compilation**

Run from `apps/pile-plan-studio`: `node --test src/core/projectFile.test.ts src/domain/pilePlanActivation.test.ts`

Run from `apps/pile-plan-studio`: `npx tsc -p tsconfig.json --noEmit`

Expected: both commands PASS and `rg -n "state\.activePile(Size|Tip)|activePileSizes: project\.settings" src` returns no runtime source-of-truth usage.

- [ ] **Step 6: Commit TypeScript schema ownership**

```bash
git add apps/pile-plan-studio/src/core apps/pile-plan-studio/src/domain apps/pile-plan-studio/src/components apps/pile-plan-studio/src/App.tsx
git commit -m "feat: move legend activation into pile plans"
```

### Task 3: Activation-aware pile-plan lifecycle, refresh, history, and import

**Files:**
- Modify: `apps/pile-plan-studio/src/domain/pilePlanActivation.ts`
- Modify: `apps/pile-plan-studio/src/domain/pilePlanManagement.ts`
- Modify: `apps/pile-plan-studio/src/domain/pilePlanManagement.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/pilePlanImport.ts`
- Modify: `apps/pile-plan-studio/src/domain/pilePlanImport.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectContent.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectContent.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/historyAction.ts`
- Modify: `apps/pile-plan-studio/src/domain/historyAction.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectHistoryReducer.test.ts`
- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/AppStartup.test.ts`

**Interfaces:**
- Produces: `activationFromConfigurations(configurations): ActivePileConfigurations`.
- Produces: `replacePilePlanActivation(pilePlans, pilePlanId, activation): PilePlanData[]`.
- Changes: `createPilePlan` accepts `activation`; `createOptimizationPilePlan` accepts `resolvedCandidateConfigurations`.

- [ ] **Step 1: Add failing lifecycle matrix tests**

```ts
it("applies the specified activation for every creation path", () => {
  assert.deepEqual(getPilePlanActivation(duplicatePilePlan(duplicateInput).pilePlans[1]), sourceActivation);
  assert.deepEqual(getPilePlanActivation(createPilePlan({
    ...baseInput, kind: "variant", language: "en", choices: new Map(),
    activation: allAvailable,
  }).pilePlans[1]), allAvailable);
  assert.deepEqual(getPilePlanActivation(createOptimizationPilePlan({
    ...baseInput, optimizedChoices, resolvedCandidateConfigurations: candidates, language: "en",
  }).pilePlans[1]), activationFromConfigurations(candidates));
});
```

Add separate assertions that in-place changes preserve activation, imported
plans copy current-source activation exactly, deletion leaves shared appearance
untouched, switching returns the target plan's activation through the selector,
and manually assigning an inactive configuration does not alter activation.

- [ ] **Step 2: Run lifecycle tests and confirm missing activation transitions fail**

Run from `apps/pile-plan-studio`: `node --test src/domain/pilePlanManagement.test.ts src/domain/pilePlanImport.test.ts`

Expected: FAIL on new, import, and optimization activation assertions.

- [ ] **Step 3: Implement lifecycle activation atomically**

```ts
export function activationFromConfigurations(configurations: Iterable<PileConfigurationKey>) {
  return {
    pileSizes: [...new Set([...configurations].map(c => c.pile_size_mm))].sort((a, b) => a - b),
    pileTipLevels: [...new Set([...configurations].map(c => c.pile_tip_level_mm / 1000))]
      .sort((a, b) => b - a),
  };
}
```

Clone arrays on duplicate/import. Pass all current canonical available values
when creating a manual variant. Pass the captured resolved candidates when
creating an optimization plan. Keep current-plan activation untouched for
in-place optimization.

- [ ] **Step 4: Add failing undo, dirty-state, and history-label tests**

```ts
it("undoes activation and appearance as one legend action", () => {
  const after = replacePilePlanActivation(initial, "pile-plan-1", changedActivation);
  const action = describeHistoryAction(beforeContent, { ...beforeContent, pilePlans: after });
  assert.deepEqual(action, { kind: "legend-settings" });
});
```

Assert editor scope-like data is absent from `ProjectContent`, while per-plan
activation changes make content unequal and survive undo/redo with the active
plan.

- [ ] **Step 5: Implement project-content/history comparisons over plan activation**

Remove top-level activation keys from `PROJECT_CONTENT_KEYS`. Include plan
activation in the existing plan clone/equality path and detect an activation
change before generic `project-change`:

```ts
if (!sameNumberArray(beforePlan.activePileSizes, afterPlan.activePileSizes)
  || !sameNumberArray(beforePlan.activePileTipLevels, afterPlan.activePileTipLevels)) {
  return { kind: "legend-settings" };
}
```

- [ ] **Step 6: Run lifecycle and history suites**

Run from `apps/pile-plan-studio`: `node --test src/domain/pilePlanManagement.test.ts src/domain/pilePlanImport.test.ts src/domain/projectContent.test.ts src/domain/historyAction.test.ts src/domain/projectHistoryReducer.test.ts src/AppStartup.test.ts`

Expected: PASS for all lifecycle, import, undo/redo, and dirty-state cases.

- [ ] **Step 7: Commit lifecycle behavior**

```bash
git add apps/pile-plan-studio/src/domain/pilePlanActivation.ts apps/pile-plan-studio/src/domain/pilePlanActivation.test.ts apps/pile-plan-studio/src/domain/pilePlanManagement.ts apps/pile-plan-studio/src/domain/pilePlanManagement.test.ts apps/pile-plan-studio/src/domain/pilePlanImport.ts apps/pile-plan-studio/src/domain/pilePlanImport.test.ts apps/pile-plan-studio/src/domain/projectContent.ts apps/pile-plan-studio/src/domain/projectContent.test.ts apps/pile-plan-studio/src/domain/historyAction.ts apps/pile-plan-studio/src/domain/historyAction.test.ts apps/pile-plan-studio/src/domain/projectHistoryReducer.test.ts apps/pile-plan-studio/src/App.tsx apps/pile-plan-studio/src/AppStartup.test.ts
git commit -m "feat: preserve activation across pile plan lifecycle"
```

### Task 4: Multi-plan legend editor scope and conflict warnings

**Files:**
- Create: `apps/pile-plan-studio/src/domain/legendConflicts.ts`
- Create: `apps/pile-plan-studio/src/domain/legendConflicts.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/legendEditorModel.ts`
- Modify: `apps/pile-plan-studio/src/domain/legendEditorModel.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendEditor.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendEditor.css`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendEditor.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanWorkspace.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanWorkspace.test.ts`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/common.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/common.json`
- Modify: `apps/pile-plan-studio/src/components/domain/WorkspaceTranslations.test.ts`

**Interfaces:**
- Produces: `unionActivationForPlans(pilePlans, planIds)` and `unionUsedConfigurationsForPlans(pilePlans, planIds)`.
- Produces: `findCoactiveLegendConflicts(legend, pilePlans): LegendConflict[]`.
- Produces: `getLegendValuePlanUsage(...)`, including current, in-scope, and relevant outside-scope plan usage.
- Changes: automatic-assignment functions receive explicit included values; the old persisted/draft `assignmentScope` is removed.

- [ ] **Step 1: Write failing pure model tests for scope, badges, and conflicts**

```ts
it("uses selected plans for used activation without modifying those plans", () => {
  const used = unionUsedConfigurationsForPlans(plans, new Set(["a", "b"]));
  const next = applyLegendEditorBulkAction(draft, "enable-used", available, used);
  assert.deepEqual(next.active, { pileSizes: [290, 320], pileTipLevels: [-18, -19] });
  assert.deepEqual(plans, originalPlans);
});

it("warns only when duplicate color values are co-active in a plan", () => {
  assert.deepEqual(findCoactiveLegendConflicts(tipColorLegend, separatedPlans), []);
  assert.deepEqual(findCoactiveLegendConflicts(tipColorLegend, coactivePlans)[0], {
    property: "color", values: [-18, -19], pilePlanIds: ["b"],
  });
});
```

- [ ] **Step 2: Run model tests and confirm the scope/conflict helpers are absent**

Run from `apps/pile-plan-studio`: `node --test src/domain/legendEditorModel.test.ts src/domain/legendConflicts.test.ts`

Expected: FAIL because scope unions and co-active conflict detection do not exist.

- [ ] **Step 3: Implement pure scope and conflict functions**

```ts
export type LegendConflict = {
  property: "symbol" | "color";
  values: number[];
  pilePlanIds: string[];
};

export function getLegendValuePlanUsage(args: {
  plans: PilePlanData[];
  currentPlanId: string;
  scopePlanIds: ReadonlySet<string>;
  kind: "size" | "tip";
  value: number;
}): LegendValuePlanUsage;
```

Conflict detection selects the property currently mapped to each channel. For
each plan independently, group its active values by serialized symbol or
uppercase color and emit only groups containing at least two values. Merge
identical property/appearance/value conflicts across plans by appending their
plan IDs. This correctly reports two co-active duplicate values even if a third
value with the same appearance is active only in another plan.

- [ ] **Step 4: Add the temporary scope UI and update automatic actions**

Keep `scopePlanIds` as component state initialized to
`new Set([state.activePilePlanId])` whenever the dialog opens. Render encoding
and pile-plan scope as independent disclosures, both collapsed by default. The
closed summaries show the selected encoding and either `Alleen huidig
palenplan` / `Current pile plan only` or the selected/total plan count. Give the
expanded plan checklist a bounded height and its own scrollbar. Remove the old
enabled/all automatic-assignment segmented control; pass
`unionActivationForPlans(state.pilePlans, scopePlanIds)` to automatic symbol and
color functions. Pass `unionUsedConfigurationsForPlans` to `enable-used`.

Render a scope-aware chip only when the value is active outside the selected
scope:

```tsx
<span className="legend-editor-outside-scope-chip">
  {t("legendEditor.activeOutsideScope", { count: usage.activeOutsideScopeCount })}
</span>
```

Its count is the number of outside-scope pile plans in which the value is
active, not the number of assigned load points. Clicking the value area on any
row opens one compact information panel showing the current plan and relevant
plans inside and outside the scope. Each entry reports activation separately
from its actual assigned-load-point count. Only one panel is open; outside
click and Escape close it, while the symbol/color and activation controls keep
their own interactions.

Render persistent localized conflict notices listing channel, values, and
affected plan names. Keep the real stored symbol/color visible for inactive
rows.

- [ ] **Step 5: Update apply behavior to one current-plan/history transition**

```ts
onApply({ active: draft.active, legend: draft.legend });
// PilePlanWorkspace replaces activation only on state.activePilePlanId
// and updates state.pileLegend in the same commitProjectState call.
```

Cancel discards the draft and scope; changing the active plan closes the
dialog. Scope changes call local state only and never `onStateChange`.

- [ ] **Step 6: Run editor and translation tests**

Run from `apps/pile-plan-studio`: `node --test src/domain/legendEditorModel.test.ts src/domain/legendConflicts.test.ts src/components/domain/LegendEditor.test.ts src/components/domain/PilePlanWorkspace.test.ts src/components/domain/WorkspaceTranslations.test.ts`

Expected: PASS for scope initialization, bulk unions, current-plan-only edits,
outside-scope activity, assignment details, collapsed summaries, conflict copy,
cancel/apply, and atomic application.

- [ ] **Step 7: Commit the editor slice**

```bash
git add apps/pile-plan-studio/src/domain/legendEditorModel* apps/pile-plan-studio/src/domain/legendConflicts* apps/pile-plan-studio/src/components/domain/LegendEditor* apps/pile-plan-studio/src/components/domain/PilePlanWorkspace* apps/pile-plan-studio/src/i18n
git commit -m "feat: add multi-plan legend editor scope"
```

### Task 5: Shared inactive-configuration presentation in viewer and compact legend

**Files:**
- Create: `apps/pile-plan-studio/src/domain/legendActivationPresentation.ts`
- Create: `apps/pile-plan-studio/src/domain/legendActivationPresentation.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/legendState.ts`
- Modify: `apps/pile-plan-studio/src/domain/legendState.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx:395-465`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanViewer.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/Legend.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/Legend.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/viewer.css`
- Modify: `apps/pile-plan-studio/src/App.css`

**Interfaces:**
- Produces: `getConfigurationActivationPresentation(configuration, legend, active)`.
- Produces: `ConfigurationActivationPresentation` containing `symbol`, `color`, `smallDot`, `sizeActive`, and `tipActive`.
- Consumes: per-plan activation selector from Task 2.

- [ ] **Step 1: Write the failing four-state matrix tests in both encoding modes**

```ts
for (const encodingMode of ["size-symbol", "tip-symbol"] as const) {
  it(`${encodingMode} resolves all activation combinations`, () => {
    const activationFor = (symbolActive: boolean, colorActive: boolean) => {
      const sizeActive = encodingMode === "size-symbol" ? symbolActive : colorActive;
      const tipActive = encodingMode === "size-symbol" ? colorActive : symbolActive;
      return {
        pileSizes: sizeActive ? [290] : [],
        pileTipLevels: tipActive ? [-18] : [],
      };
    };
    for (const [symbolActive, colorActive] of [[true, true], [false, true], [true, false], [false, false]]) {
      const result = getConfigurationActivationPresentation(configuration, { ...legend, encodingMode },
        activationFor(symbolActive, colorActive));
      assert.equal(result.smallDot, !symbolActive);
      assert.equal(result.color === INACTIVE_LEGEND_COLOR, !colorActive);
    }
  });
}
```

Map `true/false` to the property occupying the symbol/color channel, not always
to size/tip, so both modes prove channel independence.

- [ ] **Step 2: Run presentation tests and confirm the helper is absent**

Run from `apps/pile-plan-studio`: `node --test src/domain/legendActivationPresentation.test.ts src/domain/legendState.test.ts`

Expected: FAIL before shared fallback resolution exists.

- [ ] **Step 3: Implement the shared channel-aware resolver**

```ts
export const INACTIVE_LEGEND_COLOR = "#8C989F";
export const SMALL_DOT_SYMBOL: PileSymbol = { baseShape: "circle", fillPattern: "full" };

export function getConfigurationActivationPresentation(configuration, legend, active) {
  const base = getConfigurationStyle(configuration, legend);
  const sizeActive = active.pileSizes.includes(configuration.pile_size_mm);
  const tipActive = active.pileTipLevels.includes(configuration.pile_tip_level_m);
  const symbolActive = legend.encodingMode === "size-symbol" ? sizeActive : tipActive;
  const colorActive = legend.encodingMode === "size-symbol" ? tipActive : sizeActive;
  return {
    symbol: symbolActive ? base.symbol : SMALL_DOT_SYMBOL,
    color: colorActive ? base.color : INACTIVE_LEGEND_COLOR,
    smallDot: !symbolActive,
    sizeActive,
    tipActive,
  };
}
```

- [ ] **Step 4: Apply the resolver to viewer markers without shrinking hit targets**

Keep the existing marker button dimensions, data key, z-index classes, hover
candidate registration, selected halo, and click handler. Add a class only to
the inner symbol when `smallDot` is true, and size that inner SVG to a small
fixed fraction of the normal symbol. Verify selection/status overlays stay
above it.

- [ ] **Step 5: Apply neutral visuals and warning indicators to the compact legend**

For `disabled-used`, use the small dot when the property is the symbol channel
or a gray swatch when it is the color channel. Keep sorted position, selection
filter behavior, `!`, and localized tooltip. Continue omitting
`disabled-unused`. Change compact `enableUsedOnly` through
`replacePilePlanActivation`, affecting only the active plan.

- [ ] **Step 6: Run presentation, viewer, and compact legend tests**

Run from `apps/pile-plan-studio`: `node --test src/domain/legendActivationPresentation.test.ts src/domain/legendState.test.ts src/components/domain/PilePlanViewer.test.ts src/components/domain/Legend.test.ts src/viewer/hoverCandidates.test.ts`

Expected: PASS for eight mode/state combinations, compact omission rules,
interaction retention, and current-plan quick activation.

- [ ] **Step 7: Commit shared fallback presentation**

```bash
git add apps/pile-plan-studio/src/domain/legendActivationPresentation* apps/pile-plan-studio/src/domain/legendState* apps/pile-plan-studio/src/components/domain/PilePlanViewer* apps/pile-plan-studio/src/components/domain/Legend* apps/pile-plan-studio/src/components/domain/viewer.css apps/pile-plan-studio/src/App.css
git commit -m "feat: show inactive legend configurations neutrally"
```

### Task 6: Retain and explain the current assignment in the pile-option table

**Files:**
- Modify: `apps/pile-plan-studio/src/domain/activePileConfigurations.ts`
- Modify: `apps/pile-plan-studio/src/domain/activePileConfigurations.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/rightPanelModel.ts:200-300`
- Modify: `apps/pile-plan-studio/src/components/domain/rightPanelModel.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.tsx:680-890`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/rightPanel.css`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json`

**Interfaces:**
- Produces: `filterActivePileOptions(options, active, retainedConfiguration?)`.
- Extends: `RenderablePileOptionTableRow` with `sizeActive`, `tipActive`, and `smallDot`.
- Consumes: shared activation presentation from Task 5.

- [ ] **Step 1: Write failing retained-row and label tests**

```ts
it("keeps only the inactive current assignment beside active options", () => {
  const rows = filterActivePileOptions(options, active, currentConfiguration);
  assert.deepEqual(rows.map(row => row.configuration), [activeKey, currentConfiguration]);
});

it("marks each inactive property on the retained row", () => {
  const [row] = getRenderablePileOptionRows(inputWithBothPropertiesInactive);
  assert.equal(row.sizeActive, false);
  assert.equal(row.tipActive, false);
  assert.equal(row.smallDot, true);
});
```

- [ ] **Step 2: Run option-model tests and confirm the current row is filtered out**

Run from `apps/pile-plan-studio`: `node --test src/domain/activePileConfigurations.test.ts src/components/domain/rightPanelModel.test.ts`

Expected: FAIL because filtering has no retained configuration and rows have no activation flags.

- [ ] **Step 3: Implement retained filtering and row presentation**

```ts
export function filterActivePileOptions<T extends Pick<
  PileConfigurationOption,
  "configuration" | "pile_size_mm" | "pile_tip_level_m"
>>(
  options: T[], active: ActivePileConfigurations, retained?: PileConfigurationKey,
): T[] {
  return options.filter(option => isPileConfigurationActive(option, active)
    || (retained !== undefined && samePileConfiguration(option.configuration, retained)));
}
```

Pass the common selected configuration for single or homogeneous
multi-selection. Build row symbol HTML from
`getConfigurationActivationPresentation` and expose both property flags.

- [ ] **Step 4: Render property-local `Uit` / `Off` labels**

```tsx
<>{row.sizeLabel}{!row.sizeActive ? <InactiveLabel /> : null}</>
<>{row.tipLabel}{!row.tipActive ? <InactiveLabel /> : null}</>
```

Keep the row in normal sorting, preserve the current-row accent, and render the
small/gray symbol from Task 5. Do not add any other filtered-out options.

- [ ] **Step 5: Run right-panel and translation tests**

Run from `apps/pile-plan-studio`: `node --test src/domain/activePileConfigurations.test.ts src/components/domain/rightPanelModel.test.ts src/components/domain/RightPanel.test.ts src/components/domain/WorkspaceTranslations.test.ts`

Expected: PASS for one inactive property, both inactive properties, sorting,
current-row styling, single/multi selection, and Dutch/English copy.

- [ ] **Step 6: Commit the pile-option exception**

```bash
git add apps/pile-plan-studio/src/domain/activePileConfigurations* apps/pile-plan-studio/src/components/domain/rightPanelModel* apps/pile-plan-studio/src/components/domain/RightPanel* apps/pile-plan-studio/src/components/domain/rightPanel.css apps/pile-plan-studio/src/i18n
git commit -m "feat: retain inactive current pile option"
```

### Task 7: Optimizer candidate-source UI, resolution, and result activation

**Files:**
- Create: `apps/pile-plan-studio/src/domain/optimizationCandidates.ts`
- Create: `apps/pile-plan-studio/src/domain/optimizationCandidates.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/optimizationSettings.ts`
- Modify: `apps/pile-plan-studio/src/domain/optimizationSettings.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/optimizationPanelModel.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/optimizationPanelModel.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/OptimizationPanel.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.test.ts`
- Modify: `apps/pile-plan-studio/src/core/greedyOptimizationContract.ts`
- Modify: `apps/pile-plan-studio/src/core/greedyOptimizationContract.test.ts`
- Modify: `apps/pile-plan-studio/src/App.tsx:1280-1445`
- Modify: `apps/pile-plan-studio/src/AppOptimization.test.ts`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json`

**Interfaces:**
- Produces: `resolveOptimizationCandidates(catalog, source, active): PileConfigurationKey[]`.
- Changes: `clampOptimizationLimits(limits, candidates)` derives distinct counts from exact keys.
- Changes: `GreedyOptimizationContractInput.candidateConfigurations` maps to Rust `candidate_configurations`.
- Consumes: `createOptimizationPilePlan(...resolvedCandidateConfigurations)` from Task 3.

- [ ] **Step 1: Write failing candidate resolution and post-resolution clamp tests**

```ts
it("resolves active legend to exact catalog keys without creating combinations", () => {
  assert.deepEqual(resolveOptimizationCandidates(catalog, "active_legend", active), [
    { pile_size_mm: 290, pile_tip_level_mm: -18000 },
    { pile_size_mm: 320, pile_tip_level_mm: -19000 },
  ]);
});

it("clamps limits after candidate resolution", () => {
  assert.deepEqual(clampOptimizationLimits({ sizes: 9, tips: 9, configurations: 9 }, candidates),
    { sizes: 2, tips: 2, configurations: 2 });
});
```

- [ ] **Step 2: Run model tests and confirm current cartesian clamping fails**

Run from `apps/pile-plan-studio`: `node --test src/domain/optimizationCandidates.test.ts src/components/domain/optimizationPanelModel.test.ts`

Expected: FAIL because limits currently use active array lengths and exact candidate resolution is absent.

- [ ] **Step 3: Implement canonical resolution and limit helpers**

```ts
export function resolveOptimizationCandidates(catalog, source, active) {
  const selected = source === "all_available"
    ? catalog
    : catalog.filter(key => active.pileSizes.includes(key.pile_size_mm)
      && active.pileTipLevels.includes(key.pile_tip_level_mm / 1000));
  return deduplicateAndSortPileConfigurationKeys(selected);
}

export function deduplicateAndSortPileConfigurationKeys(keys: Iterable<PileConfigurationKey>) {
  return [...new Map([...keys].map(key => [pileConfigurationToken(key), { ...key }])).values()]
    .sort((left, right) => left.pile_size_mm - right.pile_size_mm
      || right.pile_tip_level_mm - left.pile_tip_level_mm);
}
```

Compute the maximum configuration limit from `candidates.length`, not
`sizeCount * tipCount`. Persist only limits, utilization, and
`candidate_source`; do not reconstruct legacy enabled arrays.

- [ ] **Step 4: Add the localized source control and empty-domain state**

Place the two-choice segmented control before configuration limits. Resolve
candidates for the active plan on every render. Show the contextual warning and
disable both panel and ribbon run actions when `candidates.length === 0`.

```tsx
<button className={source === "all_available" ? "is-selected" : ""}>
  {t("optimization.candidatesAll")}
</button>
<button className={source === "active_legend" ? "is-selected" : ""}>
  {t("optimization.candidatesActiveLegend")}
</button>
```

- [ ] **Step 5: Write failing browser/desktop request snapshot tests**

```ts
assert.deepEqual(toBrowserGreedyOptimizationRequest(input).candidate_configurations, candidates);
assert.deepEqual(toDesktopGreedyOptimizationRequest(input).candidate_configurations, candidates);
assert.equal("enabled_pile_sizes" in request.settings, false);
```

- [ ] **Step 6: Pass an immutable candidate snapshot through the run**

In `runGreedyOptimization`, resolve and clone candidates before setting
`optimizationRunning`. Pass them through the contract and include their token
in stale-response checks. On a new-plan result call:

```ts
createOptimizationPilePlan({
  ...current,
  optimizedChoices: applied.choices,
  optimizationUnassignedByLoadPoint,
  resolvedCandidateConfigurations,
  language: pilePlanLanguage(),
});
```

In-place results do not alter activation. A changed plan, analysis request,
assignments identity, group snapshot, candidate source, activation, or catalog
invalidates the response without applying it.

- [ ] **Step 7: Run optimizer model, contract, UI, and app tests**

Run from `apps/pile-plan-studio`: `node --test src/domain/optimizationCandidates.test.ts src/domain/optimizationSettings.test.ts src/components/domain/optimizationPanelModel.test.ts src/core/greedyOptimizationContract.test.ts src/AppOptimization.test.ts src/components/domain/RightPanel.test.ts`

Expected: PASS for both sources, exact keys, post-resolution limits, empty
domain, browser/desktop parity, stale response rejection, in-place preservation,
and new-plan candidate activation.

- [ ] **Step 8: Commit optimizer candidate sources**

```bash
git add apps/pile-plan-studio/src/domain/optimization* apps/pile-plan-studio/src/components/domain/OptimizationPanel* apps/pile-plan-studio/src/components/domain/optimizationPanelModel* apps/pile-plan-studio/src/core/greedyOptimizationContract* apps/pile-plan-studio/src/App.tsx apps/pile-plan-studio/src/AppOptimization.test.ts apps/pile-plan-studio/src/i18n
git commit -m "feat: add optimizer candidate sources"
```

### Task 8: Full regression, file compatibility, and manual acceptance

**Files:**
- Inspect: `sample_project/sample_project.ifcpp`
- Inspect: all test files changed in Tasks 1-7
- Do not change: package versions or release notes

**Interfaces:**
- Consumes all preceding tasks.
- Produces verified issue-#24 behavior on browser/WASM and desktop/Tauri paths.

- [ ] **Step 1: Run formatting and whitespace checks**

Run: `cargo fmt --all -- --check`

Run from `apps/pile-plan-studio`: `npx tsc -p tsconfig.json --noEmit`

Run: `git diff --check`

Expected: all commands exit 0. If Rust formatting fails, run `cargo fmt --all`,
inspect the formatting-only diff, then rerun the check.

- [ ] **Step 2: Run the complete automated test suites**

Run: `cargo test --workspace`

Run from `apps/pile-plan-studio`: `npm test`

Expected: all Rust core/WASM and frontend tests PASS with zero failures.

- [ ] **Step 3: Build browser and desktop targets**

Run from `apps/pile-plan-studio`: `npm run build`

Run: `cargo check --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml`

Expected: both commands exit 0 without TypeScript, WASM, Vite, or Tauri compile errors.

- [ ] **Step 4: Verify schema compatibility fixtures explicitly**

Open schema-1, schema-2, schema-3, and schema-4 fixtures through the browser
loader tests and Rust reader tests. Save each loaded fixture and assert the
output is schema 4, has activation only in every pile plan, preserves shared
appearance, and uses `all_available` when migrated.

Run: `cargo test -p pile-plan-core ifcpp::tests -- --nocapture`

Run from `apps/pile-plan-studio`: `node --test src/core/projectFile.test.ts`

Expected: both focused compatibility suites PASS.

- [ ] **Step 5: Start the live viewer for manual acceptance**

Run from `apps/pile-plan-studio`: `npm run dev`

Using at least two plans with different activation, verify:

1. switching plans changes activation but never shared colors/symbols;
2. editor scope starts at the current plan and `+n` excludes it;
3. scoped used/automatic operations do not modify other plans;
4. duplicate warnings identify only co-active conflicts;
5. all four marker fallback states work in both encoding modes;
6. compact inactive-used entries and current inactive pile-option rows remain visible;
7. `Uit`/`Off` appears after each inactive property;
8. both optimizer sources resolve correctly and an empty source disables running;
9. a new optimization plan activates the full resolved candidate domain;
10. undo/redo, save, close, and reopen preserve distinct activation.

- [ ] **Step 6: Inspect the final branch diff against the approved spec**

Run: `git diff main...HEAD --stat`

Run: `git diff main...HEAD -- docs/superpowers/specs/2026-09-04-multi-plan-legend-design.md`

Confirm every spec section has implementation/test evidence and issue #32 has
not been introduced.

- [ ] **Step 7: Commit only genuine final fixture/test corrections**

If Step 1-6 required tracked fixture or assertion corrections, commit exactly
those files:

```bash
git add sample_project apps/pile-plan-studio/src crates/pile-plan-core crates/pile-plan-wasm
git commit -m "test: verify multi-plan legend integration"
```

If no tracked corrections were needed, do not create an empty commit.

- [ ] **Step 8: Request code review before integration**

Invoke `superpowers:requesting-code-review`, address findings through the
review workflow, rerun the complete verification commands, and only then use
`superpowers:finishing-a-development-branch` to choose merge/release handling.
