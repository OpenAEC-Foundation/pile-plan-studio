import type { ProjectState } from "../../domain/projectState.ts";
import { useTranslation } from "react-i18next";
import { clampOptimizationLimits } from "./optimizationPanelModel.ts";

type Props = {
  state: ProjectState;
  onStateChange: (state: ProjectState) => void;
  onRunOptimization: () => void;
  onClose: () => void;
};

export default function OptimizationPanel({ state, onStateChange, onRunOptimization, onClose }: Props) {
  const { t } = useTranslation("rightPanel");
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
        <div><h2>{t("optimization.title")}</h2><span>{t("optimization.subtitle")}</span></div>
        <button className="right-panel-task-close" type="button" aria-label={t("optimization.close")} onClick={onClose}>&times;</button>
      </header>
      <div className="settings-scroll">
        <p className="optimization-description">
          {t("optimization.description")}
        </p>
        <section className="settings-group">
          <h3>{t("optimization.optimize")}</h3>
          <div className="segmented-control">
            <button className={state.optimizationTargetScope === "all" ? "is-selected" : ""} type="button" onClick={() => onStateChange({ ...state, optimizationTargetScope: "all" })}>{t("optimization.allLoadPoints")}</button>
            <button className={state.optimizationTargetScope === "selected" ? "is-selected" : ""} type="button" onClick={() => onStateChange({ ...state, optimizationTargetScope: "selected" })}>{t("optimization.selected", { count: state.selectedLoadPointIds.length })}</button>
          </div>
        </section>
        {state.optimizationTargetScope === "selected" ? (
          <section className="settings-group">
            <h3>{t("optimization.limitsApplyWithin")}</h3>
            <div className="segmented-control">
              <button className={state.optimizationLimitScope === "target" ? "is-selected" : ""} type="button" onClick={() => onStateChange({ ...state, optimizationLimitScope: "target" })}>{t("optimization.selectedPoints")}</button>
              <button className={state.optimizationLimitScope === "whole-plan" ? "is-selected" : ""} type="button" onClick={() => onStateChange({ ...state, optimizationLimitScope: "whole-plan" })}>{t("optimization.wholePlan")}</button>
            </div>
          </section>
        ) : null}
        <section className="settings-group optimization-limits">
          <h3>{t("optimization.configurationLimits")}</h3>
          <NumberSetting label={t("optimization.maxSizes")} value={limits.sizes} onChange={(value) => updateLimit("sizes", value)} />
          <NumberSetting label={t("optimization.maxTips")} value={limits.tips} onChange={(value) => updateLimit("tips", value)} />
          <NumberSetting label={t("optimization.maxConfigurations")} value={limits.configurations} onChange={(value) => updateLimit("configurations", value)} />
        </section>
        {activeSizes.length === 0 || activeTips.length === 0 ? <p className="panel-message is-warning">{t("optimization.enableLegend")}</p> : null}
        {!hasTarget ? <p className="panel-message is-warning">{t("optimization.selectLoadPoints")}</p> : null}
        {state.optimizationError ? <p className="panel-message is-error">{state.optimizationError}</p> : null}
        {state.optimizationSummary ? (
          <div className="optimization-summary"><strong>{t("optimization.applied", { count: state.optimizationSummary.appliedCount })}</strong><span>{t("optimization.changed", { count: state.optimizationSummary.changedCount })}</span></div>
        ) : null}
        <button className="primary-action" disabled={disabled} type="button" onClick={onRunOptimization}>{state.optimizationRunning ? t("optimization.running") : t("optimization.run")}</button>
      </div>
    </div>
  );
}

function NumberSetting({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="optimization-number"><span>{label}</span><input min="0" step="1" type="number" value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} /></label>;
}
