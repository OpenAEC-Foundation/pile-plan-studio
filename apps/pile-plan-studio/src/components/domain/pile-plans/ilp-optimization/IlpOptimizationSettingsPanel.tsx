import {ilpCandidateCatalog} from "../../../../domain/pile-plans/ilp-optimization/ilpCandidates.ts";
import IlpCandidateSelector from "./IlpCandidateSelector.tsx";
import { useEffect, useMemo, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../../domain/project/projectState.ts";
import { parseScaledDecimal } from "../../../../domain/pile-plans/ilp-optimization/ilpSettingsModel.ts";
import type { IlpOptimizationSettings } from "../../../../core/ilpOptimizationTypes.ts";
import type { IlpSection, IlpSections } from "../../../../domain/settings/userSettings.ts";
import IlpDisclosure from "./IlpDisclosure.tsx";
import ThemedNumberInput from "../../../template/ThemedNumberInput.tsx";
import "./ilpOptimization.css";

type Props = {
  newPlanName: string;
  onNewPlanNameChange: (name: string | null) => void;
  sections: IlpSections;
  onToggleSection: (section: IlpSection) => void;
  state: ProjectState;
  onChange: (state: ProjectState) => void;
  onRun: () => void;
  onRunLocal: () => void;
  onStop: () => void;
  onCancel: () => void;
  hasBestSolution: boolean;
  onClose: () => void;
  running: boolean;
  stopping: boolean;
  cancelling?: boolean;
  runningPlanName?: string;
  onViewRunningPlan: () => void;
  disabled: boolean;
  children: ReactNode;
};

export default function IlpOptimizationSettingsPanel({ newPlanName, onNewPlanNameChange, sections, onToggleSection, state, onChange, onRun, onRunLocal, onStop, onCancel, hasBestSolution, onClose, running, stopping, cancelling, runningPlanName, onViewRunningPlan, disabled, children }: Props) {
  const { t, i18n } = useTranslation("ribbon");
  const { t: panel } = useTranslation("rightPanel");
  const s = state.ilpOptimizationSettings;
  const catalog=useMemo(()=>ilpCandidateCatalog(state.pileOptionsByLoadPointId),[state.pileOptionsByLoadPointId]);
  const limitMaximums = [
    new Set(catalog.map(c => c.pile_tip_level_mm)).size,
    new Set(catalog.map(c => c.pile_size_mm)).size,
    catalog.length,
  ];
  const customCandidates=s.custom_configurations??[];
  const candidateSummary=s.candidate_source==="custom"?t("ilp.selectedCandidates",{count:customCandidates.length})
    : panel(s.candidate_source==="all_available"?"optimization.candidatesAll":"optimization.candidatesActiveLegend");
  const update = (patch: Partial<IlpOptimizationSettings>) => onChange({ ...state, ilpOptimizationSettings: { ...s, ...patch } });
  const selected = state.ilpOptimizationTargetScope === "selected";
  const number = (value: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }).format(value);
  const disclosure = (key: IlpSection, summary: string) => ({
    open: sections[key], onToggle: () => onToggleSection(key), disabled: running, summary,
  });
  const limits = (["max_pile_tip_levels", "max_pile_sizes", "max_pile_configurations"] as const)
    .flatMap((key, index) => s[key] === null ? [] : [t(`ilp.sectionSummary.${["tips", "sizes", "configurations"][index]}`, { count: s[key] })])
    .join(" · ") || t("ilp.sectionSummary.unlimited");
  const scroll=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(running)scroll.current?.scrollTo({top:0});},[running]);
  return <div className="optimization-panel ilp-panel">
    <header className="right-panel-header">
      <div><h2>{t("optimize.ilp")}</h2><span>{t(s.optimize_coherence ? "ilp.subtitle" : "ilp.costOnlySubtitle")}</span></div>
      <button className="right-panel-task-close" type="button" aria-label={t("ilp.close")} onClick={onClose}>&times;</button>
    </header>
    <div className="settings-scroll" ref={scroll}>
    <div className="ilp-actions">
      {!running && <><button className="primary-action" type="button" title={t("ilp.solverHelp")} disabled={disabled} onClick={onRun}>{t(s.optimize_coherence ? "ilp.runSolver" : "ilp.run")}</button>
        {s.optimize_coherence && <button className="primary-action" type="button" title={t("ilp.localHelp")} disabled={disabled} onClick={onRunLocal}>{t("ilp.runLocal")}</button>}</>}
      {running && <><button type="button" className="ilp-running-plan-link"
          aria-label={panel("ilp.runningPlan",{name:runningPlanName})} title={panel("ilp.viewPlan")}
          onClick={onViewRunningPlan}>{runningPlanName}</button>
        <button className="primary-action" type="button" disabled={stopping || !hasBestSolution} onClick={onStop}>{t(stopping ? "ilp.stopping" : "ilp.stopBest")}</button>
        <button className="primary-action" type="button" disabled={cancelling} onClick={onCancel}>{t("ilp.cancel")}</button>
        {stopping && <p className="ilp-stopping-help" role="status">{panel("ilp.stoppingHelp")}</p>}</>}
    </div>
      {children}
      <div className="ilp-settings">
        <IlpDisclosure title={t("ilp.targetLocations")} {...disclosure("optimize", [selected ? panel("optimization.selected", { count: state.selectedLoadPointIds.length }) : panel("optimization.allLoadPoints"), ...(s.skip_unsolvable_units ? [t("ilp.skipUnsolvable")] : [])].join(" · "))}>
          <div className="segmented-control">
            <button className={!selected ? "is-selected" : ""} type="button" onClick={() => onChange({ ...state, ilpOptimizationTargetScope: "all" })}>{panel("optimization.allLoadPoints")}</button>
            <button className={selected ? "is-selected" : ""} type="button" onClick={() => onChange({ ...state, ilpOptimizationTargetScope: "selected" })}>{panel("optimization.selected", { count: state.selectedLoadPointIds.length })}</button>
          </div>
          <label className="settings-checkbox">
            <input type="checkbox" checked={s.skip_unsolvable_units} onChange={e => update({ skip_unsolvable_units: e.target.checked })} />
            <span>{t("ilp.skipUnsolvable")}</span>
          </label>
          <p className="supporting-text">{t("ilp.skipUnsolvableHelp")}</p>
        </IlpDisclosure>
        <IlpDisclosure title={panel("optimization.candidates")} {...disclosure("candidates", candidateSummary)}>
          <div className="segmented-control optimization-candidate-source ilp-candidate-source">
            <button className={s.candidate_source === "all_available" ? "is-selected" : ""} type="button" onClick={() => update({ candidate_source: "all_available" })}>{panel("optimization.candidatesAll")}</button>
            <button className={s.candidate_source === "active_legend" ? "is-selected" : ""} type="button" onClick={() => update({ candidate_source: "active_legend" })}>{panel("optimization.candidatesActiveLegend")}</button>
            <button className={s.candidate_source === "custom" ? "is-selected" : ""} type="button" onClick={() => update({ candidate_source: "custom" })}>{t("ilp.customCandidates")}</button>
          </div>
          {s.candidate_source === "custom" && <IlpCandidateSelector catalog={catalog} selected={customCandidates} onChange={custom_configurations=>update({custom_configurations})}/>}
        </IlpDisclosure>
        <IlpDisclosure title={panel("optimization.configurationLimits")} {...disclosure("limits", limits)}>
          {(["max_pile_tip_levels", "max_pile_sizes", "max_pile_configurations"] as const).map((key, index) =>
            <LimitField key={key} label={panel(["optimization.maxTips", "optimization.maxSizes", "optimization.maxConfigurations"][index])} value={s[key]} maximum={Math.max(1, limitMaximums[index])} onChange={value => update({ [key]: value })} />)}
          <p className="supporting-text">{t("ilp.unlimitedHelp")}</p>
          {selected && <label className="settings-checkbox" title={t("ilp.outsideHelp")}>
            <input type="checkbox" checked={state.ilpOptimizationLimitScope === "whole-plan"} onChange={e => onChange({ ...state, ilpOptimizationLimitScope: e.target.checked ? "whole-plan" : "target" })} />
            <span>{t("ilp.outsideLimits")}</span>
          </label>}
        </IlpDisclosure>
        <fieldset className="ilp-settings-fields ilp-inline-settings" disabled={running}>
          <label className="settings-checkbox"><input type="checkbox" checked={s.optimize_coherence} onChange={e => update({ optimize_coherence: e.target.checked })} /><span>{t("ilp.optimizeCoherence")}</span></label>
        </fieldset>
        <IlpDisclosure title={t("ilp.utilizationAndCost")} {...disclosure("costLimits", [t("ilp.utilizationSummary",{value:number(s.max_utilization*100)}), ...(s.optimize_coherence?[t("ilp.extraCostSummary",{value:number(s.budget_basis_points/100)})]:[])].join(" · "))}>
          <ScaledField label={t("ilp.utilization")} value={Math.round(s.max_utilization * 10000)} decimals={2} min={0} max={10000} suffix="%" onChange={v => update({ max_utilization: v / 10000 })} />
          {s.optimize_coherence && <><ScaledField label={t("ilp.extraCost")} value={s.budget_basis_points} decimals={2} suffix="%" onChange={v => update({ budget_basis_points: v })} />
          <p className="supporting-text">{t("ilp.budgetHelp")}</p></>}
        </IlpDisclosure>
        {s.optimize_coherence && <>
        <IlpDisclosure title={t("ilp.transitionWeights")} {...disclosure("neighbors", t("ilp.sectionSummary.weights", { tip: number(s.transition_weights.tip_only_milli / 1000), size: number(s.transition_weights.size_only_milli / 1000) }))}>
          {(["tip_only_milli", "size_only_milli"] as const).map(key =>
            <ScaledField key={key} label={t(`ilp.${key}`)} value={s.transition_weights[key]} decimals={3} onChange={v => update({ transition_weights: { ...s.transition_weights, [key]: v } })} />)}
          <p className="supporting-text">{t("ilp.bothHelp")}</p>
          {selected && <label className="settings-checkbox" title={t("ilp.boundaryHelp")}>
            <input type="checkbox" checked={state.ilpIncludeBoundaryTransitions} onChange={e => onChange({ ...state, ilpIncludeBoundaryTransitions: e.target.checked })} />
            <span>{t("ilp.boundary")}</span>
          </label>}
        </IlpDisclosure>
        </>}
        <IlpDisclosure title={t("ilp.saveAs")} {...disclosure("saveAs", state.ilpOptimizationCreatesPilePlan ? newPlanName : t("ilp.currentPlan"))}>
          <label className="settings-checkbox"><input type="checkbox" checked={state.ilpOptimizationCreatesPilePlan} onChange={e => onChange({ ...state, ilpOptimizationCreatesPilePlan: e.target.checked })} /><span>{t("ilp.newPlan")}</span></label>
          {state.ilpOptimizationCreatesPilePlan && <label className="ilp-plan-name"><span>{t("ilp.planName")}</span>
            <input type="text" value={newPlanName} onChange={e => onNewPlanNameChange(e.target.value)}
              onBlur={() => { if (!newPlanName.trim()) onNewPlanNameChange(null); }} />
          </label>}
        </IlpDisclosure>
      </div>
    </div>
  </div>;
}

function LimitField({ label, value, maximum, onChange }: { label: string; value: number | null; maximum: number; onChange: (value: number | null) => void }) {
  const id = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  const [invalid, setInvalid] = useState(false);
  const { t } = useTranslation("ribbon");
  useEffect(() => { setText(value === null ? "" : String(value)); setInvalid(false); }, [value]);
  const commit = () => {
    const parsed = text.trim() === "" ? null : parseScaledDecimal(text, 0);
    const valid = text.trim() === "" || (parsed !== null && parsed > 0);
    setInvalid(!valid);
    if (valid) onChange(parsed);
  };
  return <><div className="optimization-number"><label htmlFor={id}>{label}</label>
    <ThemedNumberInput id={id} aria-label={label} min={1} max={maximum} step={1} placeholder="—" value={text} aria-invalid={invalid} onValueChange={setText} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  </div>{invalid && <p className="supporting-text" role="alert">{t("ilp.invalidNumber")}</p>}</>;
}

function ScaledField({ value, decimals, onChange, label, suffix = "", min = 0, max = 0xffffffff }: { value: number; decimals: number; onChange: (value: number) => void; label: string; suffix?: string; min?: number; max?: number }) {
  const id = useId();
  const format = (v: number) => String(v / 10 ** decimals);
  const [text, setText] = useState(format(value));
  const [invalid, setInvalid] = useState(false);
  const { t } = useTranslation("ribbon");
  useEffect(() => { setText(format(value)); setInvalid(false); }, [value, decimals]);
  const commit = () => {
    const parsed = parseScaledDecimal(text, decimals);
    const valid = parsed !== null && parsed >= min && parsed <= max;
    setInvalid(!valid);
    if (valid) onChange(parsed);
  };
  return <><div className="settings-number-row"><label htmlFor={id}>{label}</label>
    <ThemedNumberInput id={id} type="text" aria-label={label} inputMode="decimal" min={min / 10 ** decimals} max={max / 10 ** decimals} step={1} value={text} aria-invalid={invalid} onValueChange={setText} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    <span className="settings-number-unit">{suffix}</span>
  </div>{invalid && <p className="supporting-text" role="alert">{t("ilp.invalidNumber")}</p>}</>;
}
