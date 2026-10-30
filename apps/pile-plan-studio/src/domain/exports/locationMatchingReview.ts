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

export function nextPendingSelection(result:MatchingResult,after?:ReviewSelection|null,order?:{new:number[];old:number[]}):ReviewSelection|null {
  for(const side of ["new","old"] as const){
    const pending=side==="new"?result.unmatched_new:result.unmatched_old;
    if(!pending.length)continue;
    const sorted=order?.[side]??(side==="new"?result.new_order:result.old_order)??pending;
    const ids=[...sorted.filter(id=>pending.includes(id)),...pending.filter(id=>!sorted.includes(id))];
    const start=after?.side===side?sorted.indexOf(after.id):-1;
    const id=start>=0?sorted.slice(start+1).find(id=>pending.includes(id))??ids[0]:after?.side===side&&!order&&!result.new_order?pending.find(id=>id>after.id)??ids[0]:ids[0];
    return {side,id};
  }
  return null;
}

// Ordering is presentation only; spatial row order comes from the Rust core.
export function orderedReviewLocations<T extends {id:number;mark?:number|null}>(points:T[],ids?:number[]):T[]{
  const rank=new Map((ids??points.map(p=>p.id)).map((id,i)=>[id,i]));
  return [...points].sort((a,b)=>a.mark!=null&&b.mark!=null?a.mark-b.mark||(rank.get(a.id)??0)-(rank.get(b.id)??0):a.mark!=null?-1:b.mark!=null?1:(rank.get(a.id)??Number.MAX_SAFE_INTEGER)-(rank.get(b.id)??Number.MAX_SAFE_INTEGER));
}
