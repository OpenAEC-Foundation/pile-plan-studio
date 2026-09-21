import {useTranslation} from "react-i18next";
import {useEffect,useState} from "react";
import type {IlpOptimizationOutcome,IlpOptimizationSettings} from "../../../../core/ilpOptimizationTypes.ts";
import type {IlpRunState} from "../../../../app/optimization/ilpOptimizationController.ts";
import {canSkipUnsolvableIlpTargets} from "../../../../domain/pile-plans/ilp-optimization/ilpResultApplication.ts";
import IlpDisclosure from "./IlpDisclosure.tsx";
import "./ilpOptimization.css";
type Props={planName?:string;stale?:boolean;settings?:IlpOptimizationSettings;skipUnsolvableEnabled:boolean;detailsOpen:boolean;onToggleDetails:()=>void;run:IlpRunState;currency:string;onEnableSkipUnsolvable:()=>void;onApplyProposal:()=>void;actionsEnabled:boolean};
export default function IlpOptimizationResultPanel({planName,stale,settings,skipUnsolvableEnabled,detailsOpen,onToggleDetails,run,currency,onEnableSkipUnsolvable,onApplyProposal,actionsEnabled}:Props){
  const {t,i18n}=useTranslation("rightPanel");const o=run.outcome;
  const [expandedDiagnostics,setExpandedDiagnostics]=useState<IlpOptimizationOutcome|null>(null);
  const skipped = o && "diagnostics" in o ? o.diagnostics.find(d=>d.code==="skipped_unsolvable_units") : undefined;
  const fallbackNotice = o?.status === "solved" ? o.diagnostics.find(d => d.code === "spatial_reference_fallback" || d.code === "spatial_current_plan_fallback" || d.code === "spatial_improved_start_fallback" || d.code === "local_optimization") : undefined;
  const coherence = run.context?.optimizeCoherence !== false;
  const weights = settings?.transition_weights;
  const legacyWeights = weights?.both_milli !== undefined
    && weights.both_milli !== weights.tip_only_milli + weights.size_only_milli;
  const money=(v:number)=>new Intl.NumberFormat(i18n.language,{style:"currency",currency}).format(v);
  const number=(v:number)=>new Intl.NumberFormat(i18n.language,{maximumFractionDigits:3}).format(v);
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{
    if(!run.running)return;
    const received=Date.now(),base=run.progress?.elapsed_ms??0;
    setElapsed(base);
    const timer=setInterval(()=>setElapsed(base+Date.now()-received),1000);
    return ()=>clearInterval(timer);
  },[run.running,run.progress?.elapsed_ms]);
  const spatial=run.progress?.phase==="spatial";
  const best=run.progress?.incumbent_objective;
  const bound=run.progress?.best_bound;
  const objectiveValue=(v:number)=>spatial?number(v/1000):money(v);
  const diagnosticItems = o && "diagnostics" in o ? o.diagnostics.filter(d => d !== fallbackNotice) : [];
  const blockedLocationCount = o?.status === "blocked"
    ? new Set(o.diagnostics.filter(d => d.blocking).flatMap(d => d.load_point_ids)).size : 0;
  const diagnosticLocationCount = new Set(diagnosticItems.flatMap(d => d.load_point_ids)).size;
  const diagnostics = diagnosticItems.map((d,index)=><div className="panel-message" key={index}>
      <strong>{t(`ilp.diagnostics.${d.code}`,{count:d.load_point_ids.length,defaultValue:t("ilp.diagnostics.unknown")})}</strong>
      {d.load_point_ids.length>0&&<div>{t("ilp.locations",{ids:d.load_point_ids.join(", ")})}</div>}
    </div>);
  return <section className="ilp-result" aria-live="polite"><h3>{planName?t("ilp.planResult",{name:planName}):t("ilp.title")}</h3>
    {stale && <p className="panel-message">{t("ilp.resultStale")}</p>}
    {run.running?<p>{t(run.stopping?"ilp.stopping":spatial&&run.context?.localOnly?"ilp.localSearch":`ilp.phases.${run.progress?.phase??"preparation"}`)}</p>:!o?<p>{t("ilp.ready")}</p>:<p>{t(`ilp.status.${o.status}`)}</p>}
    {run.running && run.previewSolution && <p className="panel-message">{t("ilp.livePreview",{score:number(run.previewSolution.score_milli/1000)})}</p>}
    {run.running && <><p>{t("ilp.elapsed",{seconds:Math.floor(elapsed/1000)})}</p>
      {run.progress && (spatial || run.progress.phase==="cost_reference") && <dl>
        <dt>{t(spatial?"ilp.bestScore":"ilp.bestCost")}</dt><dd>{best!=null?objectiveValue(best):"—"}</dd>
        <dt>{t("ilp.lowerBound")}</dt><dd>{bound!=null?objectiveValue(bound):"—"}</dd>
        <dt>{t("ilp.remainingGap")}</dt><dd>{run.progress.relative_gap!=null?`${number(run.progress.relative_gap*100)}%`:"—"}</dd>
      </dl>}
      <p className="supporting-text">{t(run.context?.localOnly?"ilp.localHelp":"ilp.searchHelp")}</p></>}
    {o?.status==="solved" && <>{coherence ? <div className="ilp-result-score" role="group" aria-label={t("ilp.score")}>
      <p className="ilp-result-score-label">{t("ilp.score")}</p>
      <strong className="ilp-result-score-value">{number(o.solution.score_milli/1000)}</strong>
      <p className="ilp-result-score-proof">{t(`ilp.proof.${o.solution.proof}`)}</p>
      <p className="ilp-result-score-help">{t("ilp.scoreHelp")}</p>
    </div> : <p>{t(`ilp.proof.${o.solution.proof}`)}</p>}
      {o.solution.termination==="time_limit" && !fallbackNotice && <p className="panel-message">{t("ilp.timeLimitBest")}</p>}
      {fallbackNotice && <p className="panel-message">{t(`ilp.diagnostics.${fallbackNotice.code}`)}</p>}
      <dl className="ilp-result-overview">
        <dt>{t("ilp.cost")}</dt><dd>{money(o.solution.cost)}</dd>
        <dt>{t("ilp.targets")}</dt><dd>{o.solution.assignments.length}</dd>
        {skipped && <><dt>{t("ilp.skipped")}</dt><dd>{skipped.load_point_ids.length}</dd></>}
      </dl>
      <IlpDisclosure title={t("ilp.details")} open={detailsOpen} onToggle={onToggleDetails}><dl>
      <dt>{t("ilp.objective")}</dt><dd>{t(coherence ? "ilp.coherenceObjective" : "ilp.costObjective")}</dd>
      {run.context&&<>{coherence && <><dt>{t("ilp.extraCost")}</dt><dd>{number(run.context.budgetBasisPoints/100)}%</dd></>}
        <dt>{t("ilp.limitScope")}</dt><dd>{t(run.context.wholePlanLimits?"ilp.wholePlan":"ilp.targetOnly")}</dd>
        {coherence && <><dt>{t("ilp.boundary")}</dt><dd>{t(run.context.boundaryTransitions?"ilp.yes":"ilp.no")}</dd></>}</>}
      {weights && <><dt>{t(legacyWeights ? "ilp.legacyUsedWeights" : "ilp.usedWeights")}</dt><dd>{[weights.tip_only_milli,weights.size_only_milli,...(legacyWeights ? [weights.both_milli!] : [])].map(v=>number(v/1000)).join(" / ")}</dd></>}
      <dt>{t("ilp.reference")}</dt><dd>{money(o.solution.reference.cost)}</dd>
      <dt>{t("ilp.referenceProof")}</dt><dd>{t(`ilp.proof.${o.solution.reference.proof}`)}</dd>
      <dt>{t("ilp.solutionProof")}</dt><dd>{t(`ilp.proof.${o.solution.proof}`)}</dd>
      {fallbackNotice && <><dt>{t("ilp.solutionOrigin")}</dt><dd>{t(fallbackNotice.code === "spatial_reference_fallback" ? "ilp.costReferencePlan" : fallbackNotice.code === "spatial_current_plan_fallback" ? "ilp.reusedPlan" : "ilp.locallyImprovedPlan")}</dd></>}
      {coherence && <><dt>{t("ilp.budget")}</dt><dd>{money(o.solution.budget)}</dd></>}
      <dt>{t("ilp.configurations")}</dt><dd>{o.solution.counts.configurations}</dd>
      <dt>{t("ilp.tips")}</dt><dd>{o.solution.counts.tip_levels}</dd><dt>{t("ilp.sizes")}</dt><dd>{o.solution.counts.pile_sizes}</dd>
      <dt>{t("ilp.tipOnly")}</dt><dd>{o.solution.transitions.tip_only}</dd><dt>{t("ilp.sizeOnly")}</dt><dd>{o.solution.transitions.size_only}</dd>
      <dt>{t("ilp.both")}</dt><dd>{o.solution.transitions.both}</dd>
    </dl></IlpDisclosure></>}
    {blockedLocationCount>0 && <p className="panel-message">{t("ilp.unsolvableSummary",{count:blockedLocationCount})}</p>}
    {o&&canSkipUnsolvableIlpTargets(o)&&<button className="primary-action" type="button" disabled={!actionsEnabled || skipUnsolvableEnabled} onClick={onEnableSkipUnsolvable}>{t(skipUnsolvableEnabled ? "ilp.skipUnsolvableEnabled" : "ilp.enableSkipUnsolvable")}</button>}
    {diagnosticItems.length>0 && <IlpDisclosure
      title={t("ilp.messages",{count:diagnosticItems.length})}
      summary={diagnosticLocationCount>0 ? t("ilp.messageLocations",{count:diagnosticLocationCount}) : undefined}
      open={expandedDiagnostics===o} onToggle={()=>setExpandedDiagnostics(expandedDiagnostics===o?null:o)}>
      {diagnostics}
    </IlpDisclosure>}
    {o?.status==="infeasible"&&o.proposal&&<><p>{t(o.proposal.minimality_proven?"ilp.minimalProposal":"ilp.possibleProposal")}</p>
      <dl>{(["tip_levels","pile_sizes","configurations"] as const).filter(k=>o.proposal!.increases[k]>0).map(k=><div key={k}>
        <dt>{t(`ilp.limitLabels.${k}`)}</dt><dd>{o.proposal!.required_limits[k]} (+{o.proposal!.increases[k]})</dd></div>)}</dl>
      <button className="primary-action" type="button" disabled={!actionsEnabled} onClick={onApplyProposal}>{t("ilp.applyProposal")}</button><p>{t("ilp.runAgain")}</p></>}
    {o?.status==="failed"&&<p>{t(`ilp.diagnostics.${o.code}`,{defaultValue:t("ilp.diagnostics.solver_error")})}</p>}
  </section>;
}
