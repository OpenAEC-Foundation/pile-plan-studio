import {DEFAULT_EXPORT_OPTIONS,DEFAULT_CHANGE_CODES,type ChangeCodeOptions,type ExportOptions,type NumberingDirection} from "../../core/exportRevisionContract.ts";
import {normalizeExportColumns} from "./exportColumns.ts";

function record(value:unknown):Record<string,unknown>{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function direction(value:unknown,fallback:NumberingDirection):NumberingDirection{return value==="ascending"||value==="descending"?value:fallback;}

export function normalizeExportOptions(value:unknown):ExportOptions{
  const root=record(value),mark=record(root.mark),rule=record(mark.rule),code=record(root.tip_code);
  const start=mark.start,tolerance=rule.tolerance_mm;
  return {
    ...(Array.isArray(root.columns)?{columns:normalizeExportColumns(root.columns)}:{}),
    ...(root.change_codes?{change_codes:normalizeChangeCodes(root.change_codes)}:{}),
    mark:{...(mark.revision_mode==="renumber"?{revision_mode:"renumber" as const}:{}),enabled:mark.enabled===true,start:typeof start==="number"&&Number.isInteger(start)&&start>=1&&start<=4294967295?start:1,
      rule:{axis:rule.axis==="x"?"x":"y",x_direction:direction(rule.x_direction,"ascending"),y_direction:direction(rule.y_direction,"descending"),
        tolerance_mm:typeof tolerance==="number"&&Number.isFinite(tolerance)&&tolerance>=0?tolerance:DEFAULT_EXPORT_OPTIONS.mark.rule.tolerance_mm}},
    tip_code:{enabled:code.enabled===true,sequence:code.sequence==="numbers"?"numbers":"letters",direction:direction(code.direction,"descending")},
  };
}

function normalizeChangeCodes(value:unknown):ChangeCodeOptions{
  const raw=record(value),result=structuredClone(DEFAULT_CHANGE_CODES);
  for(const key of ["moved","size","level","added","removed"] as const){const rule=record(raw[key]);result[key]={enabled:rule.enabled!==false,text:typeof rule.text==="string"?rule.text:result[key].text};}
  if(typeof raw.separator==="string")result.separator=raw.separator;
  if(typeof raw.movement_threshold_mm==="number"&&Number.isFinite(raw.movement_threshold_mm)&&raw.movement_threshold_mm>=0)result.movement_threshold_mm=raw.movement_threshold_mm;
  return result;
}
