import {ilpCandidateCatalog,ilpCandidates} from "../../domain/pile-plans/ilp-optimization/ilpCandidates.ts";
import {generatedPilePlanName} from "../../domain/pile-plans/pilePlanManagement.ts";
import {useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction} from "react";
import type {ProjectState} from "../../domain/project/projectState.ts";
import type {LoadPointGroup} from "../../core/loadPointGroupContract.ts";
import {createIlpOptimizationClient} from "../../core/ilpOptimizationClient.ts";
import {IlpOptimizationController,type IlpRunState} from "./ilpOptimizationController.ts";
import {enableSkippingUnsolvableTargets} from "../../domain/pile-plans/ilp-optimization/ilpResultApplication.ts";
import type {IlpOptimizationOutcome} from "../../core/ilpOptimizationTypes.ts";

import {createIlpPlanRun,isIlpPlanRunCurrent,displayIlpPlanRun,completeIlpPlanRun,isIlpResultStale,type IlpPlanRun} from "../../domain/pile-plans/ilp-optimization/ilpPlanRun.ts";

type StateUpdate=Dispatch<SetStateAction<ProjectState>>;
export function useIlpOptimization(state:ProjectState,groups:LoadPointGroup[],ready:boolean,commit:StateUpdate,language:"nl"|"en") {
  const [newPlanNameDraft,setNewPlanName]=useState<string|null>(null);
  const newPlanName=newPlanNameDraft??generatedPilePlanName(state.pilePlans,"optimization",language);
  const [runState,setRunState]=useState<IlpRunState>({running:false,stopping:false,progress:null,outcome:null});
  const controller=useRef<IlpOptimizationController|null>(null);
  if(!controller.current)controller.current=new IlpOptimizationController(createIlpOptimizationClient(),setRunState);
  const current=useRef({state,groups}); current.current={state,groups};
  const session=useRef<IlpPlanRun|null>(null);
  const viewingTarget=useRef(true);
  const [,refreshView]=useState(0);
  const validation=useRef<{state:ProjectState;run:IlpPlanRun;valid:boolean}|null>(null);
  const isCurrent=()=>{
    const now=current.current.state,run=session.current;
    if(!run)return false;
    if(validation.current?.state!==now || validation.current.run!==run)
      validation.current={state:now,run,valid:isIlpPlanRunCurrent(now,run)};
    return validation.current.valid;
  };
  useEffect(()=>{if(controller.current?.state.running && !isCurrent())controller.current.cancel();});
  useEffect(()=>()=>controller.current?.dispose(),[]);
  const apply=(outcome:IlpOptimizationOutcome)=>{
    if(outcome.status!=="solved" || !session.current)return;
    const run=session.current,showTarget=viewingTarget.current;
    commit(now=>completeIlpPlanRun(now,run,outcome,showTarget));
  };
  const start=(localOnly=false)=>{
    if(!ready || controller.current?.state.running
      || (state.ilpOptimizationSettings.candidate_source==="custom" && !state.ilpOptimizationSettings.custom_configurations?.length))return;
    const active=state.pilePlans.find(p=>p.id===state.activePilePlanId);if(!active)return;
    const ids=state.ilpOptimizationTargetScope==="all"?state.loadPoints.map(p=>p.id):state.selectedLoadPointIds;
    if(ids.length===0)return;
    const candidates=ilpCandidates(state.ilpOptimizationSettings,ilpCandidateCatalog(state.pileOptionsByLoadPointId),active);
    session.current=createIlpPlanRun(state,language,localOnly,newPlanName);
    viewingTarget.current=true;
    void controller.current?.start({runId:crypto.randomUUID(),timeLimitMs:600_000,localOnly,input:{
      loadPoints:state.loadPoints,groups,optionsByLoadPoint:state.pileOptionsByLoadPointId,
      targetLoadPointIds:ids,lockedLoadPointIds:active.lockedLoadPointIds,currentAssignments:state.selectedPileConfigurationsByLoadPoint,
      candidateConfigurations:candidates,pileHeadLevelM:state.pileHeadLevelM,costSettings:state.pileCostSettings,
      settings:state.ilpOptimizationSettings,limitScope:state.ilpOptimizationLimitScope,includeBoundaryTransitions:state.ilpIncludeBoundaryTransitions,
    }},isCurrent,apply);
  };
  const enableSkipUnsolvable=()=>{
    const outcome=runState.outcome;
    if(!isCurrent() || runState.running || !outcome)return;
    commit(now=>isCurrent()?enableSkippingUnsolvableTargets(now,outcome):now);
  };
  const applyProposal=()=>{
    const outcome=runState.outcome;if(!isCurrent() || outcome?.status!=="infeasible" || !outcome.proposal)return;
    const {required_limits:limits,increases}=outcome.proposal;
    commit(now=>({...now,ilpOptimizationSettings:{...now.ilpOptimizationSettings,
      ...(increases.tip_levels>0?{max_pile_tip_levels:limits.tip_levels}:{}),
      ...(increases.pile_sizes>0?{max_pile_sizes:limits.pile_sizes}:{}),
      ...(increases.configurations>0?{max_pile_configurations:limits.configurations}:{}),
    }}));
  };
  const run=session.current;
  const liveSolution=runState.running && isCurrent()?runState.previewSolution:undefined;
  const displayState=useMemo(()=>run && liveSolution
    ? displayIlpPlanRun(state,run,liveSolution,viewingTarget.current) : state,
    [state,run,liveSolution,viewingTarget.current]);
  const active=displayState.pilePlans.find(p=>p.id===displayState.activePilePlanId);
  const saved=active?.ilpResult;
  const viewingRunPlan=!!run && (displayState.activePilePlanId===run.target.id
    || (!liveSolution && viewingTarget.current && displayState.activePilePlanId===run.sourceId));
  const transientOutcome=!runState.running && runState.outcome?.status!=="solved" && runState.outcome?.status!=="cancelled"
    && run && displayState.activePilePlanId===run.sourceId;
  const resultRun:IlpRunState={running:false,stopping:false,progress:null,
    outcome:saved?{status:"solved",solution:saved.solution,diagnostics:saved.diagnostics}:null,
    context:saved?{optimizeCoherence:saved.settings.optimize_coherence,budgetBasisPoints:saved.settings.budget_basis_points,
      wholePlanLimits:saved.whole_plan_limits,boundaryTransitions:saved.boundary_transitions,localOnly:saved.local_only}:undefined};
  // Returns true only for a temporary target, whose activation must stay out of project history.
  const viewPlan=(id:string)=>{
    viewingTarget.current=!!run && id===run.target.id;
    refreshView(n=>n+1);
    return !!liveSolution && id===run?.target.id;
  };
  return {...runState,newPlanName:runState.running?run?.target.name??newPlanName:newPlanName,setNewPlanName,displayState,previewPlanId:liveSolution?run?.target.id:undefined,
    runningPlanName:run?.target.name,runningPlanId:run?.target.id,viewPlan,viewingRunPlan,resultRun,notificationRun:transientOutcome?runState:null,
    resultStale:!!active && !!saved && isIlpResultStale(displayState,active),
    resultCurrency:saved?.currency_code??state.currencyCode,resultSettings:saved?.settings,
    previewSolution:liveSolution,start:()=>start(),startLocal:()=>start(true),stop:()=>controller.current?.stop(),cancel:()=>controller.current?.cancel(),enableSkipUnsolvable,applyProposal,actionsAvailable:isCurrent()&&!runState.running,
    disabled:!ready || runState.running || (state.ilpOptimizationSettings.candidate_source==="custom" && !state.ilpOptimizationSettings.custom_configurations?.length) || (state.ilpOptimizationTargetScope==="selected" && state.selectedLoadPointIds.length===0)};
}
