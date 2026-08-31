# Optimizer Limit Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make greedy optimization respect every configured limit, return and persist explicit unassigned outcomes, and render those outcomes with a distinct optimizer marker in browser and Tauri.

**Architecture:** Rust receives explicit targets, locks, current assignments, and limit scope; derives baselines; performs deterministic greedy selection; and returns a structured result. React applies that result to per-plan project content, persists optimizer outcomes through IFCPP, and renders localized summaries and SVG status markers without reimplementing engineering constraints.

**Tech Stack:** Rust 2021, Serde, wasm-bindgen, Tauri 2, React 19, TypeScript 6, SVG/CSS, Node test runner.

## Global Constraints

- Work on feature/optimizer-limit-correctness, based on release/0.2.1.
- Keep React/TypeScript as UI and Rust/WASM as the shared browser/Tauri calculation core.
- Preserve deterministic local greedy selection: maximum new coverage first, then minimum cost; do not claim global optimality.
- Never apply an assignment outside enabled values, utilization, size, tip-level, configuration, lock, or fixed-assignment limits.
- Use named score fields and u64 known-cost accumulation; never use uncovered or unknown-cost sentinels.
- Persist optimizer outcomes per pile plan until that point is manually assigned or targeted by a new optimization.
- Keep Dutch and English UI copy complete.
- Do not change #23 rasterization behavior or implement #31/#21 global or spatial search.
- Use TDD and commit each task independently.

---

### Task 1: Structured Core Result and Safe Greedy Scoring

**Files:**
- Modify: crates/pile-plan-core/src/analysis.rs:112-142,650-910,1621-1850
- Modify: crates/pile-plan-core/src/lib.rs
- Test: crates/pile-plan-core/src/analysis.rs

**Interfaces:**
- Produces GreedyOptimizationResult, GreedyUnassignedLoadPoint, and GreedyUnassignedReason.
- Changes greedy_optimize_pile_choices to return GreedyOptimizationResult while retaining its current arguments until Task 2.
- Consumes existing PileConfigurationOption, PileConfigurationKey, PileCostSettings, and GreedyOptimizationSettings.

- [ ] **Step 1: Write failing tests for explicit outcomes and no fallback**

Add these tests beside the existing greedy tests, plus a test-only greedy_settings constructor:

~~~rust
#[test]
fn greedy_optimizer_does_not_fall_back_outside_selected_configurations() {
    let options = HashMap::from([
        (1, vec![pile_option(290, -18.0, true, 0.6)]),
        (2, vec![pile_option(320, -19.0, true, 0.7)]),
    ]);
    let settings = greedy_settings(1, 1, 1, vec![290, 320], vec![-18.0, -19.0]);

    let result = greedy_optimize_pile_choices(&options, -3.5, &cost_settings(), &settings);

    assert_eq!(result.assignments.len(), 1);
    assert_eq!(result.unassigned.len(), 1);
    assert_eq!(result.unassigned[0].reason, GreedyUnassignedReason::ConfigurationLimits);
    assert!(result.assignments.iter().all(|choice| {
        result.selected_configurations.iter().any(|config| {
            config.pile_size_mm == choice.pile_size_mm
                && config.pile_tip_level_m_key == scaled_level_key(choice.pile_tip_level_m)
        })
    }));
}

#[test]
fn greedy_optimizer_reports_invalid_and_filtered_options_separately() {
    let options = HashMap::from([
        (1, vec![pile_option(290, -18.0, false, 1.2)]),
        (2, vec![pile_option(320, -19.0, true, 0.7)]),
    ]);
    let settings = greedy_settings(1, 1, 1, vec![290], vec![-18.0]);

    let result = greedy_optimize_pile_choices(&options, -3.5, &cost_settings(), &settings);

    assert_eq!(result.unassigned, vec![
        GreedyUnassignedLoadPoint {
            load_point_id: 1,
            reason: GreedyUnassignedReason::NoValidOption,
        },
        GreedyUnassignedLoadPoint {
            load_point_id: 2,
            reason: GreedyUnassignedReason::OptimizationConstraints,
        },
    ]);
}
~~~

- [ ] **Step 2: Run focused tests and verify RED**

~~~powershell
cargo test -p pile-plan-core greedy_optimizer_does_not_fall_back_outside_selected_configurations
cargo test -p pile-plan-core greedy_optimizer_reports_invalid_and_filtered_options_separately
~~~

Expected: compilation fails because structured result types do not exist.

- [ ] **Step 3: Add explicit result types**

~~~rust
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GreedyUnassignedReason {
    NoValidOption,
    OptimizationConstraints,
    ConfigurationLimits,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GreedyUnassignedLoadPoint {
    pub load_point_id: u32,
    pub reason: GreedyUnassignedReason,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GreedyOptimizationResult {
    pub assignments: Vec<GreedyOptimizedPileChoice>,
    pub unassigned: Vec<GreedyUnassignedLoadPoint>,
    pub selected_configurations: Vec<PileConfigurationKey>,
    pub pile_size_count: usize,
    pub pile_tip_level_count: usize,
    pub configuration_count: usize,
}
~~~

Export these beside the existing optimizer types in lib.rs.

- [ ] **Step 4: Replace sentinel scoring and remove the fallback**

Use:

~~~rust
#[derive(Clone, Debug, Eq, PartialEq)]
struct OptimizationScore {
    uncovered_count: usize,
    unknown_cost_count: usize,
    known_total_cost: u64,
}
~~~

Compare fields in that order. Sum known u32 costs through u64::from. Never add cost for an uncovered point. The final assignment pass may call only cheapest_option_for_configs; remove cheapest_valid_option fallback. Sort assignments, unassigned results, and selected keys deterministically. Derive result counts from baseline plus selected keys using scaled tip-level identity.

- [ ] **Step 5: Add overflow, unknown-cost, coverage, and count tests**

~~~rust
#[test]
fn greedy_optimizer_counts_many_uncovered_points_without_overflow() {
    let options = (1..=20_000).map(|id| (id, Vec::new())).collect();
    let result = greedy_optimize_pile_choices(
        &options,
        -3.5,
        &cost_settings(),
        &greedy_settings(1, 1, 1, vec![290], vec![-18.0]),
    );
    assert!(result.assignments.is_empty());
    assert_eq!(result.unassigned.len(), 20_000);
}

#[test]
fn greedy_optimizer_prefers_known_cost_with_equal_coverage() {
    let options = HashMap::from([(1, vec![
        pile_option(290, -18.0, true, 0.6),
        pile_option(999, -18.0, true, 0.6),
    ])]);
    let result = greedy_optimize_pile_choices(
        &options,
        -3.5,
        &cost_settings(),
        &greedy_settings(2, 1, 1, vec![290, 999], vec![-18.0]),
    );
    assert_eq!(result.assignments[0].pile_size_mm, 290);
}
~~~

Adapt existing tests to read result.assignments. Assert result counts for size/tip/configuration limits and retain the test that adds a cost-improving configuration after full coverage.

- [ ] **Step 6: Run core tests and verify GREEN**

~~~powershell
cargo test -p pile-plan-core greedy_optimizer
cargo test -p pile-plan-core
~~~

- [ ] **Step 7: Commit**

~~~powershell
git add crates/pile-plan-core/src/analysis.rs crates/pile-plan-core/src/lib.rs
git commit -m "fix(core): keep greedy results within optimizer limits"
~~~

---

### Task 2: Core-Owned Targets, Locks, and Baselines

**Files:**
- Modify: crates/pile-plan-core/src/analysis.rs
- Modify: crates/pile-plan-core/src/lib.rs
- Modify: crates/pile-plan-wasm/src/lib.rs:75-80,205-214
- Modify: apps/pile-plan-studio/src-tauri/src/main.rs:76-81,193-200
- Modify: apps/pile-plan-studio/src/core/projectTypes.ts:60-115
- Modify: apps/pile-plan-studio/src/core/coreClient.ts:288-314
- Modify: apps/pile-plan-studio/src/domain/optimizationSettings.ts
- Modify: apps/pile-plan-studio/src/App.tsx:959-1021
- Test: crates/pile-plan-core/src/analysis.rs
- Test: crates/pile-plan-wasm/src/lib.rs
- Test: apps/pile-plan-studio/src/AppOptimization.test.ts
- Test: apps/pile-plan-studio/src/domain/optimizationSettings.test.ts

**Interfaces:**
- Consumes Task 1 result types.
- Produces core GreedyOptimizationInput and OptimizationLimitScope.
- Produces matching TypeScript request/result DTOs.
- Removes baseline_pile_sizes, baseline_pile_tip_levels, and baseline_pile_configurations from frontend preparation.

- [ ] **Step 1: Write failing Rust tests for lock exclusion and baseline derivation**

~~~rust
#[test]
fn greedy_optimizer_excludes_locked_targets_in_core() {
    let mut input = optimization_input(HashMap::from([
        (1, vec![pile_option(290, -18.0, true, 0.6)]),
        (2, vec![pile_option(320, -19.0, true, 0.7)]),
    ]));
    input.target_load_point_ids = vec![1, 2];
    input.locked_load_point_ids = vec![2];
    input.current_assignments.insert(2, config_key(320, -19.0));

    let result = greedy_optimize_pile_choices(&input);

    assert_eq!(
        result.assignments.iter().map(|item| item.load_point_id).collect::<Vec<_>>(),
        vec![1],
    );
    assert!(result.unassigned.iter().all(|item| item.load_point_id != 2));
}

#[test]
fn whole_plan_limits_derive_baseline_from_non_targets() {
    let mut input = optimization_input(HashMap::from([
        (1, vec![pile_option(290, -18.0, true, 0.6)]),
        (2, vec![pile_option(320, -19.0, true, 0.7)]),
    ]));
    input.target_load_point_ids = vec![2];
    input.current_assignments.insert(1, config_key(290, -18.0));
    input.limit_scope = OptimizationLimitScope::WholePlan;
    input.settings.max_pile_configurations = 1;

    let result = greedy_optimize_pile_choices(&input);

    assert!(result.assignments.is_empty());
    assert_eq!(result.unassigned[0].reason, GreedyUnassignedReason::ConfigurationLimits);
}
~~~

- [ ] **Step 2: Run focused tests and verify RED**

~~~powershell
cargo test -p pile-plan-core greedy_optimizer_excludes_locked_targets_in_core
cargo test -p pile-plan-core whole_plan_limits_derive_baseline_from_non_targets
~~~

- [ ] **Step 3: Introduce the authoritative core request**

~~~rust
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum OptimizationLimitScope {
    Target,
    WholePlan,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GreedyOptimizationInput {
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub target_load_point_ids: Vec<u32>,
    #[serde(default)]
    pub locked_load_point_ids: Vec<u32>,
    #[serde(default)]
    pub current_assignments: HashMap<u32, PileConfigurationKey>,
    pub limit_scope: OptimizationLimitScope,
    pub pile_head_level_m: f64,
    pub cost_settings: PileCostSettings,
    pub settings: GreedyOptimizationSettings,
}
~~~

Change greedy_optimize_pile_choices to accept &GreedyOptimizationInput. Rust excludes locked targets and derives whole-plan baseline keys from non-target current assignments. Remove baseline arrays from GreedyOptimizationSettings; old JSON fields remain harmless unknown input.

- [ ] **Step 4: Make WASM and Tauri adapters thin**

~~~rust
#[wasm_bindgen]
pub fn greedy_optimize(request: JsValue) -> Result<JsValue, JsValue> {
    let request: GreedyOptimizationInput = from_js_value(request)?;
    to_js_value(&greedy_optimize_pile_choices(&request))
}
~~~

~~~rust
#[tauri::command(rename_all = "snake_case")]
fn greedy_optimize(request: GreedyOptimizationInput) -> GreedyOptimizationResult {
    greedy_optimize_pile_choices(&request)
}
~~~

Remove duplicate adapter request structs. Add adapter tests that deserialize target IDs, locks, current assignments, whole-plan scope, and serialize all structured result fields.

- [ ] **Step 5: Write failing frontend contract tests**

~~~ts
assert.match(optimizationBlock, /targetLoadPointIds/);
assert.match(optimizationBlock, /lockedLoadPointIds/);
assert.match(optimizationBlock, /currentAssignments/);
assert.match(optimizationBlock, /limitScope: snapshot\.optimizationLimitScope/);
assert.doesNotMatch(optimizationBlock, /baselineOptions/);
~~~

Update optimizationSettings.test.ts to require no baseline_pile_* fields.

- [ ] **Step 6: Run focused frontend tests and verify RED**

~~~powershell
node --test src/AppOptimization.test.ts src/domain/optimizationSettings.test.ts
~~~

Run from apps/pile-plan-studio.

- [ ] **Step 7: Update frontend request construction**

Mirror the Rust DTOs in projectTypes.ts. Change greedyOptimizeCore to serialize the same object for WASM and Tauri and return GreedyOptimizationResult. In App.tsx, send requested scope IDs before lock exclusion, explicit lock IDs, current assignments resolved to concrete numeric configuration keys, all relevant options, and optimizationLimitScope. Keep UI clamping, but let Rust enforce the received limits.

Reduce buildGreedyOptimizationSettings to enabled values, maximum counts, and maximum utilization only.

- [ ] **Step 8: Verify cross-layer GREEN**

~~~powershell
cargo test --workspace
cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml greedy_optimize
node --test src/AppOptimization.test.ts src/domain/optimizationSettings.test.ts
~~~

- [ ] **Step 9: Commit**

~~~powershell
git add crates/pile-plan-core/src crates/pile-plan-wasm/src apps/pile-plan-studio/src-tauri/src apps/pile-plan-studio/src/core apps/pile-plan-studio/src/domain/optimizationSettings.ts apps/pile-plan-studio/src/domain/optimizationSettings.test.ts apps/pile-plan-studio/src/App.tsx apps/pile-plan-studio/src/AppOptimization.test.ts
git commit -m "refactor(core): enforce optimizer request invariants"
~~~

---

### Task 3: Persist Per-Plan Optimizer Outcomes

**Files:**
- Modify/Test: crates/pile-plan-core/src/project.rs:182-200
- Modify/Test: apps/pile-plan-studio/src/core/projectFile.ts
- Modify/Test: apps/pile-plan-studio/src/domain/pilePlanManagement.ts
- Modify: test fixture builders that construct PilePlanData

**Interfaces:**
- Consumes GreedyUnassignedReason strings.
- Produces Rust PilePlan.optimization_unassigned and TypeScript PilePlanData.optimizationUnassignedByLoadPoint.
- Makes synchronization clear stored outcomes for points that now have assignments.

- [ ] **Step 1: Write failing Rust round-trip tests**

~~~rust
#[test]
fn pile_plan_round_trips_optimizer_unassigned_outcomes() {
    let mut project = sample_project();
    project.user_state.pile_plans[0].optimization_unassigned.insert(
        7,
        GreedyUnassignedReason::ConfigurationLimits,
    );

    let value = serde_json::to_value(&project).expect("project serializes");
    let restored: PilePlanProject = serde_json::from_value(value).expect("project deserializes");

    assert_eq!(
        restored.user_state.pile_plans[0].optimization_unassigned.get(&7),
        Some(&GreedyUnassignedReason::ConfigurationLimits),
    );
}
~~~

Also remove the field from JSON and assert an empty map loads.

- [ ] **Step 2: Verify RED**

~~~powershell
cargo test -p pile-plan-core pile_plan_round_trips_optimizer_unassigned_outcomes
~~~

- [ ] **Step 3: Add additive Rust persistence**

Add a serde-defaulted HashMap<u32, GreedyUnassignedReason> field to PilePlan and initialize it in every constructor/fixture. Keep schema version three.

- [ ] **Step 4: Write failing TypeScript persistence/lifecycle tests**

Use this wire fixture:

~~~ts
optimization_unassigned: {
  "7": "configuration_limits",
  "8": "optimization_constraints",
},
~~~

Assert load/save equality, duplicate-plan cloning, and manual assignment clearing only ID 7 while preserving another outcome.

- [ ] **Step 5: Verify frontend RED**

~~~powershell
node --test src/core/projectFile.test.ts src/domain/pilePlanManagement.test.ts
~~~

- [ ] **Step 6: Implement TypeScript wire model and lifecycle**

~~~ts
export type OptimizationUnassignedReason =
  | "no_valid_option"
  | "optimization_constraints"
  | "configuration_limits";

export type PilePlanData = {
  id: string;
  name: string;
  selectedPileOptionKeysByLoadPoint: Map<number, string>;
  externalReferencesByLoadPoint: Map<number, unknown[]>;
  lockedLoadPointIds: number[];
  optimizationUnassignedByLoadPoint: Map<number, OptimizationUnassignedReason>;
};
~~~

Add optional optimization_unassigned to IfcppPilePlan, load with numberKeyedEntries, and save with Object.fromEntries. synchronizeActivePilePlan filters outcomes for IDs with a selected pile. Duplicate plans clone the map; fresh plans use an empty map; optimization plans initially clone source outcomes.

- [ ] **Step 7: Verify GREEN**

~~~powershell
cargo test -p pile-plan-core project
node --test src/core/projectFile.test.ts src/domain/pilePlanManagement.test.ts src/domain/projectHistory.test.ts src/domain/projectContent.test.ts
~~~

- [ ] **Step 8: Commit**

~~~powershell
git add crates/pile-plan-core/src/project.rs apps/pile-plan-studio/src/core/projectFile.ts apps/pile-plan-studio/src/core/projectFile.test.ts apps/pile-plan-studio/src/domain
git commit -m "feat: persist optimizer outcomes per pile plan"
~~~

---

### Task 4: Apply Partial Results and Report Summaries

**Files:**
- Modify/Test: apps/pile-plan-studio/src/components/domain/optimizationPanelModel.ts
- Modify/Test: apps/pile-plan-studio/src/domain/optimizationSummary.ts
- Modify/Test: apps/pile-plan-studio/src/domain/pilePlanManagement.ts
- Modify: apps/pile-plan-studio/src/App.tsx:959-1052
- Modify/Test: apps/pile-plan-studio/src/components/domain/OptimizationPanel.tsx
- Modify: apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json
- Modify: apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json
- Test: apps/pile-plan-studio/src/AppOptimization.test.ts

**Interfaces:**
- Consumes GreedyOptimizationResult and persisted outcome maps.
- Produces applyOptimizationResult returning choices, affected IDs, unassigned map, and summary.
- Produces OptimizationRunSummary with assignedCount, changedCount, unassignedCount.

- [ ] **Step 1: Write failing application-model tests**

~~~ts
const applied = applyOptimizationResult({
  previousChoices: new Map([[1, "290|-18"], [2, "320|-19"], [3, "290|-18"]]),
  result: {
    assignments: [{
      load_point_id: 1,
      pile_size_mm: 350,
      pile_tip_level_m: -20,
      is_option: true,
      cost: 100,
    }],
    unassigned: [{ load_point_id: 2, reason: "configuration_limits" }],
    selected_configurations: [{ pile_size_mm: 350, pile_tip_level_m_key: -20000 }],
    pile_size_count: 1,
    pile_tip_level_count: 1,
    configuration_count: 1,
  },
});

assert.deepEqual(applied.choices, new Map([[1, "350|-20"], [3, "290|-18"]]));
assert.deepEqual(applied.optimizationUnassignedByLoadPoint, new Map([[2, "configuration_limits"]]));
assert.deepEqual(applied.summary, { assignedCount: 1, changedCount: 2, unassignedCount: 1 });
~~~

Add a plan test where targets 1/2 are replaced and old outcome 3 remains.

- [ ] **Step 2: Verify RED**

~~~powershell
node --test src/components/domain/optimizationPanelModel.test.ts src/domain/optimizationSummary.test.ts src/domain/pilePlanManagement.test.ts
~~~

- [ ] **Step 3: Implement atomic partial application**

Affected IDs equal the union of assignments and unassigned outcomes. Delete old choices for affected IDs, add returned assignments, count changed values, and return the unassigned reason map.

Add:

~~~ts
export function replaceOptimizationOutcomesForTargets(
  previous: Map<number, OptimizationUnassignedReason>,
  targetIds: number[],
  next: Map<number, OptimizationUnassignedReason>,
): Map<number, OptimizationUnassignedReason>;
~~~

It removes only targeted old entries, installs next entries, and preserves other IDs.

- [ ] **Step 4: Wire App and plan creation**

Pass the core result to applyOptimizationResult. In-place optimization synchronizes active choices and replaces outcomes for effective result IDs. New optimization plans preserve source outcomes outside that scope and install new outcomes inside it. Empty assignments plus unassigned outcomes follow success, not error.

- [ ] **Step 5: Update localized summary UI**

~~~tsx
<div className="optimization-summary">
  <strong>{t("optimization.assigned", { count: summary.assignedCount })}</strong>
  <span>{t("optimization.changed", { count: summary.changedCount })}</span>
  {summary.unassignedCount > 0
    ? <span>{t("optimization.unassigned", { count: summary.unassignedCount })}</span>
    : null}
</div>
~~~

Dutch: “{{count}} toegewezen.” and “{{count}} niet toegewezen binnen de ingestelde limieten.” English: equivalent wording. Update the description to say greedy maximizes coverage then minimizes cost without global-optimum wording.

- [ ] **Step 6: Verify GREEN**

~~~powershell
node --test src/components/domain/optimizationPanelModel.test.ts src/domain/optimizationSummary.test.ts src/domain/pilePlanManagement.test.ts src/components/domain/OptimizationPanel.test.ts src/AppOptimization.test.ts
~~~

- [ ] **Step 7: Commit**

~~~powershell
git add apps/pile-plan-studio/src/App.tsx apps/pile-plan-studio/src/components/domain/OptimizationPanel.tsx apps/pile-plan-studio/src/components/domain/optimizationPanelModel.ts apps/pile-plan-studio/src/components/domain/optimizationPanelModel.test.ts apps/pile-plan-studio/src/domain/optimizationSummary.ts apps/pile-plan-studio/src/domain/optimizationSummary.test.ts apps/pile-plan-studio/src/domain/pilePlanManagement.ts apps/pile-plan-studio/src/domain/pilePlanManagement.test.ts apps/pile-plan-studio/src/i18n/locales
git commit -m "feat: report partial greedy optimization results"
~~~

---

### Task 5: Optimizer Icon and Viewer Marker

**Files:**
- Create/Test: apps/pile-plan-studio/src/components/viewer/OptimizerUnresolvedMarker.tsx
- Modify/Test: apps/pile-plan-studio/src/viewer/loadPointMarker.ts
- Modify/Test: apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx
- Modify: apps/pile-plan-studio/src/components/domain/viewer.css
- Modify/Test: apps/pile-plan-studio/src/components/template/ribbon/icons.ts
- Modify: apps/pile-plan-studio/src/i18n/locales/nl/common.json
- Modify: apps/pile-plan-studio/src/i18n/locales/en/common.json

**Interfaces:**
- Consumes active plan optimizationUnassignedByLoadPoint and current option validity.
- Adds marker state optimizer-unassigned after missing/invalid engineering precedence.
- Produces OptimizerUnresolvedMarker with detailed boolean.

- [ ] **Step 1: Write failing precedence and SVG tests**

~~~ts
assert.equal(
  getUnselectedLoadPointMarkerState(
    [option({ isOption: true, utilization: 0.7 })],
    false,
    false,
    "configuration_limits",
  ),
  "optimizer-unassigned",
);
assert.equal(
  getUnselectedLoadPointMarkerState([missingOption], false, false, "configuration_limits"),
  "missing",
);
assert.equal(
  getUnselectedLoadPointMarkerState([invalidOption], false, false, "configuration_limits"),
  "invalid",
);
~~~

Test the marker component for the same centered question-mark path in both variants, candidate nodes only when detailed, light under-stroke, and no enclosing container. Strengthen Ribbon.test.ts for three open candidates, converging paths, and one filled result.

- [ ] **Step 2: Verify RED**

~~~powershell
node --test src/viewer/loadPointMarker.test.ts src/components/viewer/OptimizerUnresolvedMarker.test.ts src/components/domain/PilePlanViewer.test.ts src/components/template/ribbon/Ribbon.test.ts
~~~

- [ ] **Step 3: Implement marker precedence**

Add optional OptimizationUnassignedReason input. Resolve pending/error, all-missing, no-valid-option, stored optimizer-constraint outcome, then existing invalid fallback. no_valid_option never produces the question mark.

- [ ] **Step 4: Implement two SVG detail levels**

Use one symmetric viewBox="-12 -12 24 24", with the question-mark result centered at the origin. Detailed mode adds two open nodes left of the origin and two short converging paths. Simple mode renders only the identical question-mark paths. Draw a wider light marker-halo stroke below a narrower dark marker-foreground stroke. Add no container.

- [ ] **Step 5: Integrate with viewer zoom and selection**

Read the active plan outcome map. Detailed mode starts at state.viewport.scale >= 1.8. Render the component only for optimizer-unassigned. Geometry scales through the existing viewer transform and --viewer-symbol-scale; do not counter-scale. Keep the orange selection ring at the load-point coordinate. Add localized title/accessible text: “The last optimization did not find an assignment within the configured limits.”

- [ ] **Step 6: Redesign optimizeIcon**

Replace the routing-like icon with three smaller open nodes, converging paths, and one larger filled result node in a 24×24 currentColor SVG. Use rounded caps and no sparkle, gear, filter, target, chart, or path crossing.

- [ ] **Step 7: Verify GREEN**

~~~powershell
node --test src/viewer/loadPointMarker.test.ts src/components/viewer/OptimizerUnresolvedMarker.test.ts src/components/domain/PilePlanViewer.test.ts src/components/template/ribbon/Ribbon.test.ts src/components/domain/WorkspaceTranslations.test.ts
~~~

- [ ] **Step 8: Commit**

~~~powershell
git add apps/pile-plan-studio/src/components/viewer apps/pile-plan-studio/src/viewer/loadPointMarker.ts apps/pile-plan-studio/src/viewer/loadPointMarker.test.ts apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx apps/pile-plan-studio/src/components/domain/PilePlanViewer.test.ts apps/pile-plan-studio/src/components/domain/viewer.css apps/pile-plan-studio/src/components/template/ribbon/icons.ts apps/pile-plan-studio/src/components/template/ribbon/Ribbon.test.ts apps/pile-plan-studio/src/i18n/locales
git commit -m "feat: visualize unresolved optimizer results"
~~~

---

### Task 6: Documentation, Full Verification, and Issue Cross-Reference

**Files:**
- Modify: RELEASE_NOTES.md
- Modify design spec only if verified implementation differs.
- Verify all changed Rust, TypeScript, JSON, CSS, and SVG files.

**Interfaces:**
- Consumes Tasks 1-5.
- Produces a verified and pushed feature branch plus a precise partial-resolution comment on #30.

- [ ] **Step 1: Add release notes**

Add a 0.2.1 development entry stating that greedy optimization now keeps hard limits, reports/persists unassigned targets, and uses a distinct marker. State it remains locally greedy and reference #31 without implying #21 is complete.

- [ ] **Step 2: Run formatting and diff checks**

~~~powershell
cargo fmt --all -- --check
git diff --check
git status --short
~~~

- [ ] **Step 3: Run complete automated verification**

From repository root:

~~~powershell
cargo test --workspace
cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml
~~~

From apps/pile-plan-studio:

~~~powershell
npm test
npm run build
~~~

- [ ] **Step 4: Perform browser visual verification**

Start npm run dev and use the in-app browser. Verify the new ribbon icon; full and partial optimization; detailed marker at/above 180% zoom; simple marker below it; no anchor jump; contour contrast; orange selection; Dutch/English summary and tooltip; save/reload; manual assignment clearing one outcome; and re-optimization replacing only target outcomes.

If threshold or SVG spacing is unreadable, change only presentation constants, rerun focused viewer tests, and inspect again. Do not change grid compositing or add will-change.

- [ ] **Step 5: Commit documentation and verified tuning**

~~~powershell
git add RELEASE_NOTES.md
git commit -m "docs: describe greedy optimizer outcomes"
~~~

Include tuned visual files only if changed; never create an empty commit.

- [ ] **Step 6: Re-run final verification from clean HEAD**

~~~powershell
git status --short
cargo test --workspace
~~~

Then from apps/pile-plan-studio:

~~~powershell
npm test
npm run build
~~~

Record exact counts and build result.

- [ ] **Step 7: Push retained branch**

~~~powershell
git push -u origin feature/optimizer-limit-correctness
~~~

Do not merge into release/0.2.1 or main.

- [ ] **Step 8: Comment on #30 after push**

State that #27 partially resolves optimizer invariants; link the branch/commit; list Rust and WASM/Tauri contract coverage; explicitly leave canonical identity, aggregation, IFCPP normalization, and the remainder of #30 open. Do not close #30.

- [ ] **Step 9: Final branch review**

~~~powershell
git log --oneline release/0.2.1..HEAD
git diff --stat release/0.2.1...HEAD
git status --short --branch
~~~

Expected: focused commits only and no untracked artifacts.
