import {useEffect,useState} from "react";
import {inspectFoundationAdviceCore} from "../../core/foundationAdviceInspectionCoreClient.ts";
import type {ProjectState} from "../../domain/project/projectState.ts";
import type {CptBearingCapacityRow} from "../../core/projectTypes.ts";
export function useFoundationAdviceInspection(state:ProjectState){
 const [result,setResult]=useState<{key:unknown[];rows:CptBearingCapacityRow[];failed:boolean}|null>(null);
 const ids=state.selectedLoadPointIds.join(","),plan=state.pilePlans.find(p=>p.id===state.activePilePlanId);
 const key=[state.selectedCptId,ids,state.selectedPileConfigurationsByLoadPoint,state.loadPoints,state.bearingCapacities,state.loadPointGroupingSettings,plan?.pileCapProposals];
 const current=result?.key.length===key.length&&key.every((value,i)=>value===result?.key[i]);
 useEffect(()=>{
  if(state.selectedCptId==null||!state.selectedLoadPointIds.length)return;
  const selectedPiles=new Map([...state.selectedPileConfigurationsByLoadPoint].filter(([id])=>state.selectedLoadPointIds.includes(id)));
  if(!selectedPiles.size)return;
  let cancelled=false;
  void inspectFoundationAdviceCore({loadPoints:state.loadPoints,groupingSettings:state.loadPointGroupingSettings,bearingCapacities:state.bearingCapacities,selectedPiles,cptId:state.selectedCptId,proposals:plan?.pileCapProposals??[]}).then(rows=>{if(!cancelled)setResult({key,rows,failed:false});},()=>{if(!cancelled)setResult({key,rows:[],failed:true});});
  return()=>{cancelled=true;};
 },[state.selectedCptId,ids,state.selectedPileConfigurationsByLoadPoint,state.loadPoints,state.bearingCapacities,state.loadPointGroupingSettings,plan?.pileCapProposals]);
 return {rows:current?result!.rows:[],failed:current&&result!.failed};
}
