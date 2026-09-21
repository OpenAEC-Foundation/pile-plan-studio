import type {PileConfigurationKey, PileConfigurationOption} from "../../../core/projectTypes.ts";
import type {IlpOptimizationSettings} from "../../../core/ilpOptimizationTypes.ts";
import type {PilePlanData} from "../../../core/projectFile.ts";

export const candidateKey=(c:PileConfigurationKey)=>`${c.pile_size_mm}:${c.pile_tip_level_mm}`;

export function ilpCandidateCatalog(options:Map<number,PileConfigurationOption[]>):PileConfigurationKey[] {
  return [...new Map([...options.values()].flat().map(o=>[candidateKey(o.configuration),o.configuration])).values()]
    .sort((a,b)=>b.pile_tip_level_mm-a.pile_tip_level_mm || a.pile_size_mm-b.pile_size_mm);
}

export function ilpCandidates(settings:IlpOptimizationSettings,catalog:PileConfigurationKey[],plan:Pick<PilePlanData,"activePileSizes"|"activePileTipLevelMms">):PileConfigurationKey[] {
  if(settings.candidate_source==="custom")return settings.custom_configurations??[];
  if(settings.candidate_source==="all_available")return catalog;
  return catalog.filter(c=>plan.activePileSizes.includes(c.pile_size_mm) && plan.activePileTipLevelMms.includes(c.pile_tip_level_mm));
}

export function toggleIlpCandidate(selected:PileConfigurationKey[],candidate:PileConfigurationKey,enabled:boolean):PileConfigurationKey[] {
  const others=selected.filter(c=>candidateKey(c)!==candidateKey(candidate));
  return enabled?[...others,{...candidate}]:others;
}

export type IlpCandidateAxis="pile_size_mm"|"pile_tip_level_mm";

export function ilpCandidateGroupState(selected:PileConfigurationKey[],catalog:PileConfigurationKey[],axis:IlpCandidateAxis,value:number) {
  const group=new Set([...catalog,...selected].filter(c=>c[axis]===value).map(candidateKey));
  const checked=new Set(selected.map(candidateKey));
  const count=[...group].filter(key=>checked.has(key)).length;
  return {checked:group.size>0 && count===group.size,indeterminate:count>0 && count<group.size};
}

export function toggleIlpCandidateGroup(selected:PileConfigurationKey[],catalog:PileConfigurationKey[],axis:IlpCandidateAxis,value:number,enabled:boolean):PileConfigurationKey[] {
  if(!enabled)return selected.filter(c=>c[axis]!==value);
  const combined=new Map(selected.map(c=>[candidateKey(c),c]));
  for(const candidate of catalog.filter(c=>c[axis]===value))combined.set(candidateKey(candidate),{...candidate});
  return [...combined.values()];
}
