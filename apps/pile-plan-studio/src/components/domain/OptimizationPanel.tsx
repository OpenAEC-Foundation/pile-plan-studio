import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../domain/projectState.ts";
import ThemedNumberInput from "../template/ThemedNumberInput.tsx";
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

  function updateScope(patch: Partial<Pick<
    ProjectState,
    "optimizationTargetScope" | "optimizationLimitScope"
  >>) {
    onStateChange({
      ...state,
      ...patch,
      optimizationSummary: null,
      optimizationError: null,
    });
  }

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
    return next[field];
  }

  function updateMaxUtilization(value: number) {
    value = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    onStateChange({
      ...state,
      optimizationSettings: {
        ...state.optimizationSettings,
        max_utilization: value / 100,
      },
      optimizationSummary: null,
      optimizationError: null,
    });
    return value;
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
            <button className={state.optimizationTargetScope === "all" ? "is-selected" : ""} type="button" onClick={() => updateScope({ optimizationTargetScope: "all" })}>{t("optimization.allLoadPoints")}</button>
            <button className={state.optimizationTargetScope === "selected" ? "is-selected" : ""} type="button" onClick={() => updateScope({ optimizationTargetScope: "selected" })}>{t("optimization.selected", { count: state.selectedLoadPointIds.length })}</button>
          </div>
        </section>
        {state.optimizationTargetScope === "selected" ? (
          <section className="settings-group">
            <h3>{t("optimization.limitsApplyWithin")}</h3>
            <div className="segmented-control">
              <button className={state.optimizationLimitScope === "target" ? "is-selected" : ""} type="button" onClick={() => updateScope({ optimizationLimitScope: "target" })}>{t("optimization.selectedPoints")}</button>
              <button className={state.optimizationLimitScope === "whole-plan" ? "is-selected" : ""} type="button" onClick={() => updateScope({ optimizationLimitScope: "whole-plan" })}>{t("optimization.wholePlan")}</button>
            </div>
          </section>
        ) : null}
        <section className="settings-group optimization-limits">
          <h3>{t("optimization.configurationLimits")}</h3>
          <NumberSetting label={t("optimization.maxSizes")} min={1} value={limits.sizes} onChange={(value) => updateLimit("sizes", value)} />
          <NumberSetting label={t("optimization.maxTips")} min={1} value={limits.tips} onChange={(value) => updateLimit("tips", value)} />
          <NumberSetting label={t("optimization.maxConfigurations")} min={1} value={limits.configurations} onChange={(value) => updateLimit("configurations", value)} />
        </section>
        <section className="settings-group optimization-limits">
          <h3>{t("optimization.performanceLimit")}</h3>
          <NumberSetting
            label={t("optimization.maxUtilization")}
            max={100}
            min={0}
            value={Math.round(state.optimizationSettings.max_utilization * 100)}
            onChange={updateMaxUtilization}
          />
        </section>
        <section className="settings-group">
          <label className="settings-checkbox">
            <input
              checked={state.optimizationCreatesPilePlan}
              type="checkbox"
              onChange={(event) => onStateChange({
                ...state,
                optimizationCreatesPilePlan: event.currentTarget.checked,
              })}
            />
            <span>{t("optimization.saveAsNewPilePlan")}</span>
          </label>
        </section>
        {activeSizes.length === 0 || activeTips.length === 0 ? <p className="panel-message is-warning">{t("optimization.enableLegend")}</p> : null}
        {!hasTarget ? <p className="panel-message is-warning">{t("optimization.selectLoadPoints")}</p> : null}
        {state.optimizationError ? <p className="panel-message is-error">{state.optimizationError}</p> : null}
        {state.optimizationSummary ? (
          <div className="optimization-summary">
            <strong>{t("optimization.assigned", { count: state.optimizationSummary.assignedCount })}</strong>
            <span>{t("optimization.changed", { count: state.optimizationSummary.changedCount })}</span>
            {state.optimizationSummary.noValidOptionCount > 0
              ? <span>{t("optimization.noValidOption", { count: state.optimizationSummary.noValidOptionCount })}</span>
              : null}
            {state.optimizationSummary.optimizerUnassignedCount > 0
              ? <span>{t("optimization.unassigned", { count: state.optimizationSummary.optimizerUnassignedCount })}</span>
              : null}
          </div>
        ) : null}
        <button className="primary-action" disabled={disabled} type="button" onClick={onRunOptimization}>{state.optimizationRunning ? t("optimization.running") : t("optimization.run")}</button>
      </div>
    </div>
  );
}

function NumberSetting({ label, max, min, value, onChange }: {
  label: string;
  max?: number;
  min: number;
  value: number;
  onChange: (value: number) => number;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = draft.trim() === "" ? min : Number(draft);
    const committed = onChange(Number.isFinite(parsed) ? parsed : min);
    setDraft(String(committed));
  };

  return (
    <div
      className="optimization-number"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) inputRef.current?.blur();
      }}
    >
      <label htmlFor={inputId}>{label}</label>
      <ThemedNumberInput
        id={inputId}
        max={max}
        min={min}
        step="1"
        value={draft}
        onBlur={commit}
        onValueChange={setDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        inputRef={inputRef}
      />
    </div>
  );
}
