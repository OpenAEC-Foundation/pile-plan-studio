import {useMemo,useRef,useState} from "react";
import type {ImportSourceInput} from "../../core/coreImportContract.ts";
import type {LoadPointRefreshPreview,LocationDecisions,LoadPointRefreshSelection} from "../../core/exportRevisionContract.ts";

export type PrepareLoadPointRefresh=(sources:ImportSourceInput[],toleranceMm:number,decisions?:LocationDecisions)=>Promise<LoadPointRefreshPreview>;
export function useLoadPointRefreshReview(contextKey:string,file:File|null,profileKey:string,prepare:PrepareLoadPointRefresh|undefined){
  const [tolerance,setTolerance]=useState(1);
  const identity=useMemo(()=>({}),[contextKey,file,profileKey,tolerance]);
  const current=useRef(identity);current.current=identity;
  const [candidate,setCandidate]=useState<{identity:object;preview:LoadPointRefreshPreview}|null>(null);
  const [confirmed,setConfirmed]=useState<{identity:object;selection:LoadPointRefreshSelection}|null>(null);
  const open=async(sources:ImportSourceInput[])=>{
    if(!prepare)return;
    const captured=identity;
    const preview=confirmed?.identity===identity ? await prepare(sources,tolerance,confirmed.selection.decisions) : await prepare(sources,tolerance);
    if(current.current!==captured)throw new Error("project_changed");
    setCandidate({identity:captured,preview});
  };
  return {tolerance,setTolerance,prepare:open,
    preview:candidate?.identity===identity?candidate.preview:null,
    selection:confirmed?.identity===identity?confirmed.selection:undefined,
    confirm:(decisions:LocationDecisions)=>{setConfirmed({identity,selection:{contextKey,decisions}});setCandidate(null);},
    cancel:()=>setCandidate(null),
  };
}
