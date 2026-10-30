import type {LoadPoint, PileConfigurationOption,ResistanceDirection} from "../../core/projectTypes.ts";
export function directionalLoad(point:LoadPoint,mode:ResistanceDirection):number|null {
 return mode==="compression"?point.design_load_kn:point.tension?.state==="known"?point.tension.value_kn:null;
}
export function directionalOption(option:PileConfigurationOption,mode:ResistanceDirection):PileConfigurationOption {
 const assessment=option[mode];if(!assessment)return option;
 return {...option,displayDirectionStatus:assessment.status,governing_cpt_id:assessment.governing_cpt_id??null,governing_frd_kn:assessment.governing_frd_kn??null,utilization:assessment.utilization??null,missing_cpt_ids:assessment.missing_cpt_ids,
   technicalStatus:assessment.status==="valid"||assessment.status==="no_load"?"valid":assessment.status==="insufficient_capacity"?"insufficient_capacity":"missing_capacity_data",
   isOption:assessment.status==="valid"||assessment.status==="no_load"};
}
export function directionalLoadPoint(point:LoadPoint,mode:ResistanceDirection):LoadPoint {return mode==="compression"?point:{...point,design_load_kn:directionalLoad(point,mode)??NaN};}
