import IlpPileCountSelector from "./IlpPileCountSelector.tsx";
import {ilpCandidateCatalog} from "../../../../domain/pile-plans/ilp-optimization/ilpCandidates.ts";
import IlpCandidateSelector from "./IlpCandidateSelector.tsx";
import { useEffect, useMemo, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../../domain/project/projectState.ts";
import { parseScaledDecimal } from "../../../../domain/pile-plans/ilp-optimization/ilpSettingsModel.ts";
import type { IlpOptimizationSettings } from "../../../../core/ilpOptimizationTypes.ts";
import type { IlpSection, IlpSections } from "../../../../domain/settings/userSettings.ts";
import IlpDisclosure from "./IlpDisclosure.tsx";
import IlpNumberField from "./IlpNumberField.tsx";
import { Button, Checkbox, IconButton, OpenAECProvider, Panel, Radio, TextField } from "../../../../openaec/react/src/index";
import spriteUrl from "../../../../openaec/studioSprite.ts";
import "../../../../openaec/openaec-components.css";
import "./ilpOptimization.css";

type Props = {
  groups?:import("../../../../core/loadPointGroupContract.ts").LoadPointGroup[];
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
  timeLimitSeconds: number | null;
  onTimeLimitChange: (seconds: number | null) => void;
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

export default function IlpOptimizationSettingsPanel({ groups=[],newPlanName, onNewPlanNameChange, sections, onToggleSection, state, onChange, onRun, onRunLocal, onStop, onCancel, timeLimitSeconds, onTimeLimitChange, hasBestSolution, onClose, running, stopping, cancelling, runningPlanName, onViewRunningPlan, disabled, children }: Props) {
  const { t, i18n } = useTranslation("ribbon");
  const {t:common}=useTranslation("common");
  const targetIds=new Set(state.ilpOptimizationTargetScope==="all"?state.loadPoints.map(p=>p.id):[...state.selectedLoadPointIds,...groups.filter(g=>g.load_point_ids.some(id=>state.selectedLoadPointIds.includes(id))).flatMap(g=>g.load_point_ids)]);
  const targets=state.loadPoints.filter(p=>targetIds.has(p.id));
  const hasTension=targets.some(p=>p.tension&&p.tension.state!=="not_imported");
  const tensionCounts={pressure:targets.length,tension:targets.filter(p=>p.tension?.state==="known"&&p.tension.value_kn>0).length,zero:targets.filter(p=>p.tension?.state==="known"&&p.tension.value_kn===0).length,absent:targets.filter(p=>!p.tension||p.tension.state==="not_imported").length,missing:targets.filter(p=>p.tension?.state==="missing").length};
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
  const durationInputId=useId();
  const scopeName=useId(), candidateName=useId();
  const [minutesDraft,setMinutesDraft]=useState(String(Math.round((timeLimitSeconds??600)/60)));
  const [minutesInvalid,setMinutesInvalid]=useState(false);
  useEffect(()=>{if(timeLimitSeconds!==null){setMinutesDraft(String(Math.round(timeLimitSeconds/60)));setMinutesInvalid(false);}},[timeLimitSeconds]);
  const commitMinutes=()=>{
    const minutes=Number(minutesDraft);
    if(!Number.isInteger(minutes)||minutes<1||minutes>120){setMinutesInvalid(true);return;}
    setMinutesInvalid(false);onTimeLimitChange(minutes*60);
  };
  useEffect(()=>{if(running)scroll.current?.scrollTo?.({top:0});},[running]);
  return <OpenAECProvider sprite={spriteUrl}>
    <div className="ilp-settings-shell" onKeyDown={event => {
      if ((event.key === " " || event.key === "Enter") && event.target instanceof Element
        && event.target.closest("button, input[type='checkbox'], input[type='radio']")) event.stopPropagation();
    }}>
    <Panel className="oa-app optimization-panel ilp-panel ilp-blueprint" title={t("optimize.ilp")}
      actions={<IconButton small icon="ui.close" label={t("ilp.close")} onClick={onClose} />}>
    <div className="ilp-settings-scroll" ref={scroll}>
    <p className="ilp-settings-subtitle oa-secondary">{t(s.optimize_coherence ? "ilp.subtitle" : "ilp.costOnlySubtitle")}</p>
    <div className="ilp-actions">
      {!running && <><Button kind="primary" title={t("ilp.solverHelp")} data-tour-target="run-optimization" disabled={disabled} onClick={onRun}>{t(s.optimize_coherence ? "ilp.runSolver" : "ilp.run")}</Button>
        {s.optimize_coherence && <Button kind="primary" title={t("ilp.localHelp")} disabled={disabled} onClick={onRunLocal}>{t("ilp.runLocal")}</Button>}</>}
      {running && <><Button kind="quiet" className="ilp-running-plan-link"
          aria-label={panel("ilp.runningPlan",{name:runningPlanName})} title={panel("ilp.viewPlan")}
          onClick={onViewRunningPlan}>{runningPlanName}</Button>
        <Button kind="primary" disabled={stopping || !hasBestSolution} onClick={onStop}>{t(stopping ? "ilp.stopping" : "ilp.stopBest")}</Button>
        <Button kind="primary" disabled={cancelling} onClick={onCancel}>{t("ilp.cancel")}</Button>
        {stopping && <p className="ilp-stopping-help" role="status">{panel("ilp.stoppingHelp")}</p>}</>}
    </div>
      {children}
      <div className="ilp-settings">
        <IlpDisclosure title={t("ilp.runSettings")} {...disclosure("optimize", [selected ? panel("optimization.selected", { count: state.selectedLoadPointIds.length }) : panel("optimization.allLoadPoints"), timeLimitSeconds===null?t("ilp.noTimeLimit"):t("ilp.timeLimitSummary",{count:Math.round(timeLimitSeconds/60)}), ...(s.skip_unsolvable_units ? [t("ilp.skipUnsolvable")] : []), ...(s.allow_pile_count_changes ? [t("ilp.allowPileCountChanges")] : [])].join(" · "))}>
          <Checkbox checked={hasTension&&(s.include_tension??true)} disabled={running||!hasTension} onChange={e=>update({include_tension:e.target.checked})} label={common("loadDirection.includeTension")} />
          <p className="ilp-help oa-secondary">{common("loadDirection.scopeCounts",tensionCounts)}</p>
          <p className="ilp-help oa-secondary">{common(hasTension?"loadDirection.optimizerHelp":"loadDirection.noTensionImported")}</p>
          <p className="ilp-run-setting-label">{t("ilp.targetLocations")}</p>
          <div className="ilp-choice-group" role="radiogroup" aria-label={t("ilp.targetLocations")}>
            <Radio name={scopeName} checked={!selected} label={panel("optimization.allLoadPoints")} onChange={() => onChange({ ...state, ilpOptimizationTargetScope: "all" })} />
            <Radio name={scopeName} checked={selected} label={panel("optimization.selected", { count: state.selectedLoadPointIds.length })} onChange={() => onChange({ ...state, ilpOptimizationTargetScope: "selected" })} />
          </div>
          <Checkbox checked={s.skip_unsolvable_units} onChange={e => update({ skip_unsolvable_units: e.target.checked })} label={t("ilp.skipUnsolvable")} />
          <p className="ilp-help oa-secondary">{t("ilp.skipUnsolvableHelp")}</p>
          <Checkbox checked={s.allow_pile_count_changes??false} disabled={running}
              onChange={e=>update({allow_pile_count_changes:e.target.checked})} label={t("ilp.allowPileCountChanges")} />
          <p className="ilp-help oa-secondary">{t("ilp.pileCountChangesHelp")}</p>
          <IlpPileCountSelector settings={s} disabled={running || !s.allow_pile_count_changes} onChange={update}/>
          <div className="ilp-duration-settings">
            <IlpNumberField id={durationInputId} label={t("ilp.timeLimitMinutes")} min={1} max={120} step={1}
              value={minutesDraft} disabled={timeLimitSeconds===null} onValueChange={setMinutesDraft}
              error={minutesInvalid ? <span role="alert">{t("ilp.invalidNumber")}</span> : undefined}
              onBlur={commitMinutes} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}} />
            <Checkbox checked={timeLimitSeconds===null}
              onChange={e=>{setMinutesInvalid(false);onTimeLimitChange(e.target.checked?null:600);}} label={t("ilp.noTimeLimit")} />
          </div>
        </IlpDisclosure>
        <IlpDisclosure title={panel("optimization.candidates")} {...disclosure("candidates", candidateSummary)}>
          <div className="ilp-choice-group" role="radiogroup" aria-label={panel("optimization.candidates")}>
            <Radio name={candidateName} checked={s.candidate_source === "all_available"} label={panel("optimization.candidatesAll")} onChange={() => update({ candidate_source: "all_available" })} />
            <Radio name={candidateName} checked={s.candidate_source === "active_legend"} label={panel("optimization.candidatesActiveLegend")} onChange={() => update({ candidate_source: "active_legend" })} />
            <Radio name={candidateName} checked={s.candidate_source === "custom"} label={t("ilp.customCandidates")} onChange={() => update({ candidate_source: "custom" })} />
          </div>
          {s.candidate_source === "custom" && <IlpCandidateSelector catalog={catalog} selected={customCandidates} onChange={custom_configurations=>update({custom_configurations})}/>}
        </IlpDisclosure>
        <IlpDisclosure title={panel("optimization.configurationLimits")} {...disclosure("limits", limits)}>
          {(["max_pile_tip_levels", "max_pile_sizes", "max_pile_configurations"] as const).map((key, index) =>
            <LimitField key={key} label={panel(["optimization.maxTips", "optimization.maxSizes", "optimization.maxConfigurations"][index])} value={s[key]} maximum={Math.max(1, limitMaximums[index])} onChange={value => update({ [key]: value })} />)}
          <p className="ilp-help oa-secondary">{t("ilp.unlimitedHelp")}</p>
          {selected && <Checkbox title={t("ilp.outsideHelp")} checked={state.ilpOptimizationLimitScope === "whole-plan"} onChange={e => onChange({ ...state, ilpOptimizationLimitScope: e.target.checked ? "whole-plan" : "target" })} label={t("ilp.outsideLimits")} />}
        </IlpDisclosure>
        <fieldset className="ilp-settings-fields ilp-inline-settings" disabled={running}>
          <Checkbox checked={s.optimize_coherence} onChange={e => update({ optimize_coherence: e.target.checked })} label={t("ilp.optimizeCoherence")} />
        </fieldset>
        <IlpDisclosure title={t("ilp.utilizationAndCost")} {...disclosure("costLimits", [t("ilp.utilizationSummary",{value:number(s.max_utilization*100)}), ...(s.optimize_coherence?[t("ilp.extraCostSummary",{value:number(s.budget_basis_points/100)})]:[])].join(" · "))}>
          <ScaledField label={t("ilp.utilization")} value={Math.round(s.max_utilization * 10000)} decimals={2} min={0} max={10000} suffix="%" onChange={v => update({ max_utilization: v / 10000 })} />
          {s.optimize_coherence && <><ScaledField label={t("ilp.extraCost")} value={s.budget_basis_points} decimals={2} suffix="%" onChange={v => update({ budget_basis_points: v })} />
          <p className="ilp-help oa-secondary">{t("ilp.budgetHelp")}</p></>}
        </IlpDisclosure>
        {s.optimize_coherence && <>
        <IlpDisclosure title={t("ilp.transitionWeights")} {...disclosure("neighbors", t("ilp.sectionSummary.weights", { tip: number(s.transition_weights.tip_only_milli / 1000), size: number(s.transition_weights.size_only_milli / 1000), count: number((s.transition_weights.pile_count_milli??0)/1000) }))}>
          {(["tip_only_milli", "size_only_milli", "pile_count_milli"] as const).map(key =>
            <ScaledField key={key} label={t(`ilp.${key}`)} value={s.transition_weights[key]??0} decimals={3} onChange={v => update({ transition_weights: { ...s.transition_weights, [key]: v } })} />)}
          <p className="ilp-help oa-secondary">{t("ilp.bothHelp")}</p>
          <p className="ilp-help oa-secondary">{t("ilp.pileCountWeightHelp")}</p>
          {selected && <Checkbox title={t("ilp.boundaryHelp")} checked={state.ilpIncludeBoundaryTransitions} onChange={e => onChange({ ...state, ilpIncludeBoundaryTransitions: e.target.checked })} label={t("ilp.boundary")} />}
        </IlpDisclosure>
        </>}
        <IlpDisclosure title={t("ilp.saveAs")} {...disclosure("saveAs", state.ilpOptimizationCreatesPilePlan ? newPlanName : t("ilp.currentPlan"))}>
          <Checkbox checked={state.ilpOptimizationCreatesPilePlan} onChange={e => onChange({ ...state, ilpOptimizationCreatesPilePlan: e.target.checked })} label={t("ilp.newPlan")} />
          {state.ilpOptimizationCreatesPilePlan && <TextField label={t("ilp.planName")} value={newPlanName}
            onChange={e => onNewPlanNameChange(e.target.value)} onBlur={() => { if (!newPlanName.trim()) onNewPlanNameChange(null); }} />}
        </IlpDisclosure>
      </div>
    </div>
  </Panel></div></OpenAECProvider>;
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
  return <IlpNumberField id={id} label={label} min={1} max={maximum} step={1} placeholder="—" value={text}
    error={invalid ? <span role="alert">{t("ilp.invalidNumber")}</span> : undefined}
    onValueChange={setText} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
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
  return <IlpNumberField id={id} type="text" label={label} inputMode="decimal" min={min / 10 ** decimals}
    max={max / 10 ** decimals} step={1} value={text} suffix={suffix}
    error={invalid ? <span role="alert">{t("ilp.invalidNumber")}</span> : undefined}
    onValueChange={setText} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}
