import type {ExportColumn,ExportField,ExportOptions} from "../../core/exportRevisionContract.ts";
import type {PileSizeExportFormat} from "../../core/projectTypes.ts";

export const EXPORT_FIELDS:ExportField[]=["load_point_id","mark","x","y","design_load","pile_size","tip_level","tip_code","selected_cpts","literal"];
export const DEFAULT_COLUMN_HEADERS:Partial<Record<ExportField,string>>={load_point_id:"Load Point ID",x:"X [mm]",y:"Y [mm]",design_load:"FEd [kN]",pile_size:"Pile Size [mm]",tip_level:"Pile Tip Level [m]",selected_cpts:"Selected CPTs",mark:"Mark",tip_code:"Tip code",change_code:"Change code",literal:"Extra column",source:"Source data"};
const DEFAULT_FIELDS:ExportField[]=["load_point_id","x","y","design_load","pile_size","tip_level","selected_cpts","mark","tip_code"];
export function localizeExportColumns(columns:ExportColumn[],headers:Partial<Record<ExportField,string>>):ExportColumn[]{
  return columns.filter(c=>c.enabled).map(column=>{
    if(!column.use_default_header)return column;
    let header=headers[column.field]??column.header;
    if(column.unit&&["x","y","tip_level"].includes(column.field))header=header.replace(/\[m(?:m)?\]/,`[${column.unit}]`);
    if(column.header_number)header+=` ${column.header_number}`;
    return {...column,header};
  });
}
export function defaultExportColumns(options:ExportOptions,sizeFormat:PileSizeExportFormat,headers=DEFAULT_COLUMN_HEADERS):ExportColumn[]{
  const columns=options.columns??DEFAULT_FIELDS.filter(field=>field==="mark"?options.mark.enabled:field==="tip_code"?options.tip_code.enabled:true)
    .map(field=>({key:field,field,header:headers[field]??field,enabled:true,use_default_header:true,...field==="pile_size"?{size_format:sizeFormat}:{}}));
  return localizeExportColumns(columns.map(c=>({...c,use_default_header:c.use_default_header??(c.key===c.field&&(c.header===DEFAULT_COLUMN_HEADERS[c.field]||(c.field==="tip_code"&&c.header==="Inheicode")))})),headers);
}
export function nextExportColumnCaption(base:string,columns:ExportColumn[]):{header:string;header_number?:number}{
  const used=new Set(columns.map(column=>column.header.trim().toLowerCase()));
  if(!used.has(base.trim().toLowerCase()))return {header:base};
  let number=1;while(used.has(`${base} ${number}`.trim().toLowerCase()))number++;
  return {header:`${base} ${number}`,header_number:number};
}
export function moveExportColumnTo(columns:ExportColumn[],key:string,targetKey:string):ExportColumn[]{
  const index=columns.findIndex(c=>c.key===key),target=columns.findIndex(c=>c.key===targetKey);
  if(index<0||target<0||index===target)return columns;
  const next=[...columns];const [column]=next.splice(index,1);next.splice(target,0,column);return next;
}
export function optionsWithColumns(options:ExportOptions,columns:ExportColumn[]):ExportOptions{
  return {...options,columns,mark:{...options.mark,enabled:columns.some(c=>c.enabled&&c.field==="mark")},tip_code:{...options.tip_code,enabled:columns.some(c=>c.enabled&&c.field==="tip_code")}};
}
export function normalizeExportColumns(value:unknown):ExportColumn[]|undefined{
  if(!Array.isArray(value))return undefined;
  const keys=new Set<string>();
  return value.flatMap(raw=>{
    if(!raw||typeof raw!=="object")return [];
    const c=raw as Record<string,unknown>;
    if(typeof c.key!=="string"||!c.key||keys.has(c.key)||typeof c.header!=="string"||![...EXPORT_FIELDS,"source","change_code"].includes(String(c.field)))return [];
    keys.add(c.key);
    return [{key:c.key,field:c.field as ExportField,header:c.header,enabled:c.enabled!==false,
      ...(typeof c.source_index==="number"&&Number.isInteger(c.source_index)&&c.source_index>=0?{source_index:c.source_index}:{}),
      ...(["numeric","dimensions","custom"].includes(String(c.size_format))?{size_format:c.size_format as ExportColumn["size_format"]}:{}),
      ...(typeof c.header_number==="number"&&Number.isSafeInteger(c.header_number)&&c.header_number>0?{header_number:c.header_number}:{}),
      ...(typeof c.use_default_header==="boolean"?{use_default_header:c.use_default_header}:{}),
      ...(typeof c.template==="string"?{template:c.template}:{}),...(c.unit==="mm"||c.unit==="m"?{unit:c.unit}:{}),...(typeof c.value==="string"?{value:c.value}:{})}];
  });
}
