import type { ProjectState } from "../../domain/projectState.ts";
import { clampOptimizationLimits } from "./optimizationPanelModel.ts";

type Props = {
  state: ProjectState;
  onStateChange: (state: ProjectState) => void;
  onRunOptimization: () => void;
  onClose: () => void;
};

export default function OptimizationPanel({ state, onStateChange, onRunOptimization, onClose }: Props) {
  const activeSizes = state.activePileSizes;
  const activeTips = state.activePileTipLevels;
  const limits = clampOptimizationLimits({
    sizes: state.optimizationSettings.max_pile_sizes,
    tips: state.optimizationSettings.max_pile_tip_levels,
    configurations: state.optimizationSettings.max_pile_configurations,
  }, activeSizes, activeTips);
  const hasTarget = state.optimizationTargetScope === "all" || state.selectedLoadPointIds.length > 0;
  const disabled = state.optimizationRunning || activeSizes.length === 0 || activeTips.length === 0 || !hasTarget;

  function updateLimit(field: "sizes" | "tips" | "configurations", value: number) {
    const next = clampOptimizationLimits({ ...limits, [field]: value }, activeSizes, activeTips);
    onStateChange({
      ...state,
      optimizationSettings: {
        ...state.optimizationSettings,
        max_pile_sizes: next.sizes,
        max_pile_tip_levels: next.tips,
        max_pile_configurations: next.configurations,
      },
      optimizationSummary: null,
      optimizationError: null,
    });
  }

  return (
    <div className="optimization-panel">
      <header className="right-panel-header">
        <div><h2>Optimization</h2><span>Greedy pile selection</span></div>
        <button className="right-panel-task-close" type="button" aria-label="Close optimization settings" onClick={onClose}>&times;</button>
      </header>
      <div className="settings-scroll">
        <p className="optimization-description">
          The Greedy optimizer adds configurations one at a time and keeps the combination that reduces total cost while covering the most load points.
        </p>
        <section className="settings-group">
          <h3>Optimize</h3>
          <div className="segmented-control">
            <button className={state.optimizationTargetScope === "all" ? "is-selected" : ""} type="button" onClick={() => onStateChange({ ...state, optimizationTargetScope: "all" })}>All load points</button>
            <button className={state.optimizationTargetScope === "selected" ? "is-selected" : ""} type="button" onClick={() => onStateChange({ ...state, optimizationTargetScope: "selected" })}>Selected ({state.selectedLoadPointIds.length})</button>
          </div>
        </section>
        {state.optimizationTargetScope === "selected" ? (
          <section className="settings-group">
            <h3>Limits apply within</h3>
            <div className="segmented-control">
              <button className={state.optimizationLimitScope === "target" ? "is-selected" : ""} type="button" onClick={() => onStateChange({ ...state, optimizationLimitScope: "target" })}>Selected points</button>
              <button className={state.optimizationLimitScope === "whole-plan" ? "is-selected" : ""} type="button" onClick={() => onStateChange({ ...state, optimizationLimitScope: "whole-plan" })}>Whole plan</button>
            </div>
          </section>
        ) : null}
        <section className="settings-group optimization-limits">
          <h3>Configuration limits</h3>
          <NumberSetting label="Maximum different sizes" value={limits.sizes} onChange={(value) => updateLimit("sizes", value)} />
          <NumberSetting label="Maximum different tip levels" value={limits.tips} onChange={(value) => updateLimit("tips", value)} />
          <NumberSetting label="Maximum different configurations" value={limits.configurations} onChange={(value) => updateLimit("configurations", value)} />
        </section>
        {activeSizes.length === 0 || activeTips.length === 0 ? <p className="panel-message is-warning">Enable at least one size and tip level in the legend.</p> : null}
        {!hasTarget ? <p className="panel-message is-warning">Select one or more load points.</p> : null}
        {state.optimizationError ? <p className="panel-message is-error">{state.optimizationError}</p> : null}
        {state.optimizationSummary ? (
          <div className="optimization-summary"><strong>Applied to {state.optimizationSummary.appliedCount} load points.</strong><span>{state.optimizationSummary.changedCount} changed.</span></div>
        ) : null}
        <button className="primary-action" disabled={disabled} type="button" onClick={onRunOptimization}>{state.optimizationRunning ? "Optimizing..." : "Run Greedy Optimization"}</button>
      </div>
    </div>
  );
}

function NumberSetting({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="optimization-number"><span>{label}</span><input min="0" step="1" type="number" value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} /></label>;
}
