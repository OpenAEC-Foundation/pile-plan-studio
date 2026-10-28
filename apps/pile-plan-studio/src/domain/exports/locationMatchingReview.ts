import type {LocationDecisions,MatchingResult} from "../../core/exportRevisionContract.ts";

export type ReviewSelection={side:"old"|"new";id:number};

// An immutable edit proposal. The Rust core validates the resulting mapping.
export function withLocationChoice(decisions:LocationDecisions,newId:number,oldId:number|"added"|null):LocationDecisions {
  const next={
    links:decisions.links.filter(link=>link.new_id!==newId&&(typeof oldId!=="number"||link.old_id!==oldId)),
    added:decisions.added.filter(id=>id!==newId),
    removed:decisions.removed.filter(id=>id!==oldId),
  };
  if(typeof oldId==="number")next.links.push({old_id:oldId,new_id:newId});
  if(oldId==="added")next.added.push(newId);
  return next;
}

export function nextPendingSelection(result:MatchingResult,after?:ReviewSelection|null):ReviewSelection|null {
  if(result.unmatched_new.length){
    const id=after?.side==="new"?result.unmatched_new.find(id=>id>after.id)??result.unmatched_new[0]:result.unmatched_new[0];
    return {side:"new",id};
  }
  if(result.unmatched_old.length){
    const id=after?.side==="old"?result.unmatched_old.find(id=>id>after.id)??result.unmatched_old[0]:result.unmatched_old[0];
    return {side:"old",id};
  }
  return null;
}
