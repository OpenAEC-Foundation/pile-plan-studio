import {useEffect,useRef,useState} from "react";
import {reconcileLocationsCore} from "../../core/exportRevisionCoreClient.ts";
import {matchingDecisions,type LocationDecisions,type LocationBulkAction,type MatchingPoint,type MatchingResult} from "../../core/exportRevisionContract.ts";

export function useLocationMatching(oldLocations:MatchingPoint[],newLocations:MatchingPoint[],initial:MatchingResult,toleranceMm:number){
  const [result,setResult]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
  const generation=useRef(0);
  useEffect(()=>()=>{generation.current+=1;},[]);
  const evaluate=async(decisions:LocationDecisions,bulkAction?:LocationBulkAction)=>{
    const token=++generation.current;setBusy(true);setError(null);
    try{
      const next=await reconcileLocationsCore({old_locations:oldLocations,new_locations:newLocations,tolerance_mm:toleranceMm,decisions,bulk_action:bulkAction});
      if(token===generation.current){setResult(next);return next;}
    }catch(reason){if(token===generation.current)setError(reason);}
    finally{if(token===generation.current)setBusy(false);}
    return null;
  };
  return {result,busy,error,evaluate,decisions:matchingDecisions(result)};
}
