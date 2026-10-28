import {toStringKeyedRecord,toWasmNumberKeyedMap} from "./coreSerialization.ts";
import type {LoadPoint,PilePlanExportInput,PileCostShape} from "./projectTypes.ts";

export type NumberingDirection="ascending"|"descending";
export type PileNumberingRule={axis:"x"|"y";x_direction:NumberingDirection;y_direction:NumberingDirection;tolerance_mm:number};
export type ExportOptions={
  mark:{enabled:boolean;start:number;rule:PileNumberingRule;revision_mode?:"preserve"|"renumber"};
  tip_code:{enabled:boolean;sequence:"letters"|"numbers";direction:NumberingDirection};
  columns?:ExportColumn[]|null;
  change_codes?:ChangeCodeOptions;
};
export type ExportField="load_point_id"|"mark"|"x"|"y"|"design_load"|"pile_size"|"tip_level"|"tip_code"|"selected_cpts"|"change_code"|"source"|"literal";
export type ExportColumn={key:string;field:ExportField;header:string;enabled:boolean;use_default_header?:boolean;header_number?:number;source_index?:number|null;size_format?:"numeric"|"dimensions"|"custom"|null;template?:string|null;unit?:"mm"|"m"|null;value?:string};
export type PileTableMapping={columns:Partial<Record<ExportField,number>>;coordinate_unit:"mm"|"m";tip_unit:"mm"|"m";size_template?:string|null;size_shape?:PileCostShape|null};
export type PileTableInspection={sheet_names:string[];sheet_name:string|null;header_row:number;ambiguous_sheet:boolean;headers:string[];mapping:PileTableMapping;table:ExportTable;source_columns:ExportColumn[]};
export type ChangeCodeRule={enabled:boolean;text:string};
export type ChangeCodeOptions={moved:ChangeCodeRule;size:ChangeCodeRule;level:ChangeCodeRule;added:ChangeCodeRule;removed:ChangeCodeRule;separator:string;movement_threshold_mm:number};
export const DEFAULT_CHANGE_CODES:ChangeCodeOptions={moved:{enabled:true,text:"M"},size:{enabled:true,text:"S"},level:{enabled:true,text:"L"},added:{enabled:true,text:"A"},removed:{enabled:true,text:"R"},separator:",",movement_threshold_mm:99};
export const DEFAULT_EXPORT_OPTIONS:ExportOptions={
  mark:{enabled:false,start:1,rule:{axis:"y",x_direction:"ascending",y_direction:"descending",tolerance_mm:1}},
  tip_code:{enabled:false,sequence:"letters",direction:"descending"},
};

export type ExportCell=string|number|boolean|null;
export type ExportTable={headers:string[];rows:ExportCell[][]};
export type TipLevelCode={level_mm:number;code:string};
export type ExportPreview={table:ExportTable;annotations:{load_point_id:number;mark:number|null;tip_code:string|null}[];tip_codes:TipLevelCode[]};
export type MatchingPoint={id:number;x_mm:number;y_mm:number};
export type LocationDecisions={links:{old_id:number;new_id:number}[];added:number[];removed:number[]};
export type LocationBulkAction="nearest"|"separate";
export type LocationMatchingRequest={old_locations:MatchingPoint[];new_locations:MatchingPoint[];tolerance_mm:number;decisions:LocationDecisions|null;bulk_action?:LocationBulkAction|null};
export type MatchingResult={
  links:{old_id:number;new_id:number;distance_mm:number}[];
  added:number[];removed:number[];unmatched_old:number[];unmatched_new:number[];
  proposals:{new_id:number;candidates:{old_id:number;distance_mm:number}[]}[];
  complete:boolean;
};
export type RevisionSource={file_name:string;format:"csv"|"xlsx";bytes:number[];sheet_name?:string|null;header_row?:number|null};
export type RevisionLocation=MatchingPoint&{source_id:number|null;mark:number|null;pile_size_mm:number|null;shape:PileCostShape|null;tip_level_mm:number|null;design_load_kn?:number|null};
export type NumberingDetection={rule:PileNumberingRule;matching_positions:number;total_positions:number;equally_matching_rules:number};
export type RevisionPreview={old_locations:RevisionLocation[];new_locations:RevisionLocation[];matching:MatchingResult;numbering:NumberingDetection;first_new_mark:number;table:ExportTable|null;tip_codes:TipLevelCode[];source_columns?:ExportColumn[];generated_mark_count?:number;missing_comparisons?:ExportField[]};
export type RevitRevisionInput={oldSource:RevisionSource;newPlan:PilePlanExportInput;newSource?:RevisionSource|null;options:ExportOptions;toleranceMm:number;decisions:LocationDecisions|null;useDetectedNumbering:boolean;oldMapping?:PileTableMapping|null;newMapping?:PileTableMapping|null;outputColumns?:ExportColumn[]|null;changeCodes?:ChangeCodeOptions};
export type LoadPointRefreshPreview={old_locations:LoadPoint[];new_locations:LoadPoint[];matching:MatchingResult};
export type LoadPointRefreshSelection={contextKey:string;decisions:LocationDecisions};

export function toCoreExportPlan(input:PilePlanExportInput,desktop:boolean){
  return {
    load_points:input.loadPoints,
    selected_piles:desktop?toStringKeyedRecord(input.selectedPiles):toWasmNumberKeyedMap(input.selectedPiles),
    selected_cpts:desktop?toStringKeyedRecord(input.selectedCpts):toWasmNumberKeyedMap(input.selectedCpts),
    pile_shapes:desktop?toStringKeyedRecord(input.pileShapes):toWasmNumberKeyedMap(input.pileShapes),
    pile_size_format:input.pileSizeFormat,
  };
}

export function toConfiguredExportRequest(input:PilePlanExportInput,options:ExportOptions,desktop:boolean){
  return {plan:toCoreExportPlan(input,desktop),export_options:options};
}

export function matchingDecisions(result:MatchingResult):LocationDecisions{
  return {links:result.links.map(({old_id,new_id})=>({old_id,new_id})),added:[...result.added],removed:[...result.removed]};
}
