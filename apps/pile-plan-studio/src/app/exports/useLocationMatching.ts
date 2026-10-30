import {useEffect,useRef,useState} from "react";
import {reconcileLocationsCore} from "../../core/exportRevisionCoreClient.ts";
import {matchingDecisions,type LocationDecisions,type LocationBulkAction,type MatchingPoint,type MatchingResult} from "../../core/exportRevisionContract.ts";
import type {ReviewSelection} from "../../domain/exports/locationMatchingReview.ts";

type Snapshot={result:MatchingResult;toleranceMm:number;selection:ReviewSelection|null};
export function useLocationMatching(oldLocations:MatchingPoint[],newLocations:MatchingPoint[],initial:MatchingResult,toleranceMm:number,customEvaluate?:(decisions:LocationDecisions,bulkAction?:LocationBulkAction,toleranceMm?:number)=>Promise<MatchingResult>){
  const [history,setHistory]=useState<{past:Snapshot[];present:Snapshot;future:Snapshot[]}>({past:[],present:{result:initial,toleranceMm,selection:null},future:[]});
  const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
  const generation=useRef(0);
  useEffect(()=>()=>{generation.current+=1;},[]);
  const evaluate=async(decisions:LocationDecisions,bulkAction?:LocationBulkAction,nextTolerance=history.present.toleranceMm,selection:ReviewSelection|null=null)=>{
    const token=++generation.current;setBusy(true);setError(null);
    try{
      const next=customEvaluate?await customEvaluate(decisions,bulkAction,nextTolerance):await reconcileLocationsCore({old_locations:oldLocations,new_locations:newLocations,tolerance_mm:nextTolerance,decisions,bulk_action:bulkAction});
      if(token===generation.current){
        setHistory(h=>JSON.stringify(h.present.result)===JSON.stringify(next)&&h.present.toleranceMm===nextTolerance?h:{past:[...h.past,{...h.present,selection}],present:{result:next,toleranceMm:nextTolerance,selection:null},future:[]});
        return next;
      }
    }catch(reason){if(token===generation.current)setError(reason);}
    finally{if(token===generation.current)setBusy(false);}
    return null;
  };
  const restore=(direction:"undo"|"redo",selection:ReviewSelection|null)=>{
    if(busy)return null;
    const source=direction==="undo"?history.past:history.future;
    const next=source[source.length-1];if(!next)return null;
    const current={...history.present,selection};
    setHistory(direction==="undo"?{past:history.past.slice(0,-1),present:next,future:[...history.future,current]}:{past:[...history.past,current],present:next,future:history.future.slice(0,-1)});
    setError(null);return next;
  };
  return {result:history.present.result,tolerance:history.present.toleranceMm,busy,error,evaluate,decisions:matchingDecisions(history.present.result),
    canUndo:history.past.length>0,canRedo:history.future.length>0,undo:(selection:ReviewSelection|null)=>restore("undo",selection),redo:(selection:ReviewSelection|null)=>restore("redo",selection)};
}
