import type {DirectionAssessment,DirectionStatus,ResistanceDirection} from "../../core/projectTypes.ts";
type Facts={compression?:DirectionAssessment|null;tension?:DirectionAssessment|null};
export type CombinedOptionStatus={key:string;className:string;switchTo?:ResistanceDirection};
function aggregate(values:Array<DirectionAssessment|null|undefined>):DirectionStatus|null{
 const statuses=values.flatMap(v=>v?[v.status]:[]);if(!statuses.length)return null;
 for(const status of ["missing_demand","missing_capacity_data","insufficient_capacity"] as const){if(statuses.includes(status))return status;}
 if(statuses.every(s=>s==="not_assessed"))return "not_assessed";
 if(statuses.every(s=>s==="no_load"||s==="not_assessed"))return "no_load";
 return "valid";
}
export function combinedOptionStatus(facts:Facts[],mode:ResistanceDirection):CombinedOptionStatus|null{
 const other:ResistanceDirection=mode==="compression"?"tension":"compression";
 const active=aggregate(facts.map(f=>f[mode]));if(active===null)return null;
 const alternate=aggregate(facts.map(f=>f[other]));
 const fails=(value:DirectionStatus|null)=>value==="missing_demand"||value==="missing_capacity_data"||value==="insufficient_capacity";
 const className=(value:DirectionStatus)=>value==="insufficient_capacity"?"is-not-ok":value==="missing_capacity_data"||value==="missing_demand"?"is-missing":value==="not_assessed"?"is-not-assessed":"is-ok";
 if(fails(active))return {key:active,className:className(active)};
 if(active!=="not_assessed"&&fails(alternate))return {key:`${other}_${alternate}`,className:className(alternate!),switchTo:other};
 return {key:active,className:className(active)};
}
