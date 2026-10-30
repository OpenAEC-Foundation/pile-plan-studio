import {useMemo,useRef,useState} from "react";
import type {ImportSourceInput} from "../../core/coreImportContract.ts";
import type {LoadPointRefreshPreview,LocationDecisions,LoadPointRefreshSelection} from "../../core/exportRevisionContract.ts";

export type PrepareLoadPointRefresh=(sources:ImportSourceInput[],toleranceMm:number,decisions?:LocationDecisions)=>Promise<LoadPointRefreshPreview>;
export function useLoadPointRefreshReview(contextKey:string,file:File|null,profileKey:string,prepare:PrepareLoadPointRefresh|undefined){
  const [tolerance,setTolerance]=useState(1);
  const identity=useMemo(()=>({}),[contextKey,file,profileKey]);
  const current=useRef({identity,tolerance});current.current={identity,tolerance};
  const [candidate,setCandidate]=useState<{identity:object;tolerance:number;preview:LoadPointRefreshPreview}|null>(null);
  const [confirmed,setConfirmed]=useState<{identity:object;tolerance:number;selection:LoadPointRefreshSelection}|null>(null);
  const open=async(sources:ImportSourceInput[])=>{
    if(!prepare)return;
    const captured=identity;
    const preview=confirmed?.identity===identity&&confirmed.tolerance===tolerance ? await prepare(sources,tolerance,confirmed.selection.decisions) : await prepare(sources,tolerance);
    if(current.current.identity!==captured||current.current.tolerance!==tolerance)throw new Error("project_changed");
    setCandidate({identity:captured,tolerance,preview});
  };
  return {tolerance,setTolerance,prepare:open,
    preview:candidate?.identity===identity&&candidate.tolerance===tolerance?candidate.preview:null,
    selection:confirmed?.identity===identity&&confirmed.tolerance===tolerance?confirmed.selection:undefined,
    confirm:(decisions:LocationDecisions,nextTolerance=tolerance)=>{setTolerance(nextTolerance);setConfirmed({identity,tolerance:nextTolerance,selection:{contextKey,decisions}});setCandidate(null);},
    cancel:()=>setCandidate(null),
  };
}
