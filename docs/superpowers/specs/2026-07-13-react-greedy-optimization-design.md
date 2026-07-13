# React Greedy Optimization

## Goal

Complete React feature parity for the existing greedy pile-plan optimizer before making React the primary frontend. Reuse the existing Rust/WASM optimizer and shared TypeScript domain helpers without introducing a new optimization algorithm.

## User Interface

The right panel gains a permanent `Optimization` tab beside the existing load-point, CPT, CPT-settings, and cost-settings tabs. It contains:

- a short explanation of the greedy algorithm;
- target scope: all load points or selected load points;
- for selected targets, limit scope: optimized points or whole plan;
- plain numeric inputs for maximum different sizes, tip levels, and configurations;
- a `Run Greedy Optimization` command;
- a result summary with applied and changed load-point counts;
- a visible error message when optimization fails.

Limits use simple clamping when edited or executed. There are no sliders, automatic/manual maximum modes, or complex rules for restoring previous values.

The Optimize ribbon enables `Settings` and `Run`. Settings opens the Optimization right-panel tab; Run executes the current settings without requiring that tab to be open.

## Data And Behaviour

The active size and tip toggles in the legend define the configurations available to the optimizer. If either active set is empty, Run is disabled and the panel explains that configurations must first be enabled.

Target scope `all` sends every load point. Target scope `selected` sends the current selected load points. If selected scope has no selected load points, Run is disabled.

For whole-plan limits, pile choices outside the target set are supplied as the baseline. For optimized-point limits, no baseline is supplied. The existing `buildGreedyOptimizationSettings` helper prepares the Rust request.

After a successful run:

- returned choices replace choices for target load points;
- target load points omitted from the result are cleared to no pile;
- choices outside the target set remain unchanged;
- unused sizes and tip levels are removed from the active legend sets;
- the summary reports applied and changed counts;
- the project IFCPP state naturally persists the resulting choices and settings through the existing save path.

The three simple UI limits are mapped to the existing persisted `optimizationSettings` fields. Target and limit scope remain transient UI preferences for alpha because the current IFCPP model stores only the Rust optimization limits and enabled/baseline configuration fields.

## Architecture

`optimizationPanelModel.ts` owns pure operations for:

- deriving simple UI settings from project state;
- clamping limits to active configurations;
- selecting target IDs;
- building baseline options;
- applying optimizer results and producing the run summary.

`OptimizationPanel.tsx` owns rendering and user interaction. `RightPanel.tsx` hosts it as a fixed tab. `App.tsx` owns the asynchronous `greedyOptimizeCore` call so both ribbon and panel use one command path. Ribbon receives callbacks instead of importing project state or core functions.

## Error Handling

Core failures do not modify pile choices. The panel shows the failure and allows another run. Starting a new run clears the previous error. Stale results are ignored if the project analysis request changed while optimization was running.

## Testing

- Pure model tests cover target selection, simple limit clamping, whole-plan baseline construction, result application, clearing omitted targets, and summary counts.
- Component/source tests cover the permanent Optimization tab, numeric controls, algorithm explanation, disabled states, and ribbon callbacks.
- Existing Rust optimizer tests remain the authority for greedy selection correctness.
- Full TypeScript, frontend, Rust, and WASM tests must pass.

