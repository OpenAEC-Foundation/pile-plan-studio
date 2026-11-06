import { Select, TextField } from "../../../openaec/react/src/index";
import NumericValueInput from "../../template/NumericValueInput.tsx";
import {useState} from "react";
import SourceColumnEditor from "../shared/SourceColumnEditor.tsx";
import {useTranslation} from "react-i18next";
import type {ExportField,PileTableInspection,PileTableMapping,RevisionSource} from "../../../core/exportRevisionContract.ts";
import ExportTablePreview from "./ExportTablePreview.tsx";

type Props={source:RevisionSource;inspection:PileTableInspection;mapping:PileTableMapping;onMapping:(mapping:PileTableMapping)=>void;onSource:(patch:Partial<RevisionSource>)=>void;disabled?:boolean;newPlan?:boolean};
export default function PileTableSourceEditor({source,inspection,mapping,onMapping,onSource,disabled=false,newPlan=false}:Props){
  const {t}=useTranslation("common");
  const [selected,setSelected]=useState(1);
  const required:ExportField[]=newPlan?["load_point_id","x","y","pile_size","tip_level"]:["x","y"];
  const fields:ExportField[]=["export_id","load_point_id","mark","x","y","pile_size","tip_level","tip_code","design_load","selected_cpts","change_code"];
  const missing=required.some(field=>field==="load_point_id"?mapping.columns[field]==null&&mapping.columns.export_id==null:mapping.columns[field]==null);
  const chosen=Math.min(selected,inspection.headers.length);
  const field=Object.entries(mapping.columns).find(([,index])=>index===chosen-1)?.[0] as ExportField|undefined;
  const caption=(index:number)=>inspection.headers[index]||t("tableImport.column",{number:index+1});
  const setField=(next:string)=>{
    const columns={...mapping.columns};
    for(const key of Object.keys(columns) as ExportField[])if(columns[key]===chosen-1)delete columns[key];
    if(next)columns[next as ExportField]=chosen-1;
    onMapping({...mapping,columns});
  };
  return <section className="pile-source-editor">
    <details className="export-disclosure source-table-preview"><summary><strong>{t("tableImport.preview")}</strong><span className="source-disclosure-count">{t("exportTools.rowCount",{count:inspection.table.rows.length})}</span></summary><div className="export-preview-slot"><ExportTablePreview table={inspection.table}/></div></details>
    <details className="export-disclosure" open={missing||inspection.ambiguous_sheet}>
      <summary><strong>{t("tableImport.settings")}</strong><span className="source-disclosure-count">{t("exportTools.recognizedFields",{count:Object.keys(mapping.columns).length})}</span></summary>
      <fieldset disabled={disabled}>
        <p className="export-help">{t(newPlan?"exportTools.sourceMappingNewHelp":"exportTools.sourceMappingOldHelp")}</p>
        <div className="export-controls-grid">
          {inspection.sheet_names.length>0&&<div className="export-field"><Select label={t("exportTools.sourceSheet")} value={source.sheet_name??(inspection.ambiguous_sheet?"":inspection.sheet_name??"")} onChange={e=>onSource({sheet_name:e.target.value,header_row:undefined})} options={[...(inspection.ambiguous_sheet?[{value:"",label:t("exportTools.chooseSheet")}]:[]),...inspection.sheet_names.map(name=>({value:name,label:name}))]}/></div>}
          <label className="oa-label export-field"><span>{t("exportTools.headerRow")}</span><NumericValueInput integer min={1} step={1} value={source.header_row??inspection.header_row} onNumberChange={row=>onSource({header_row:row})}/></label>
        </div>
        <SourceColumnEditor variant="blueprint" selected={chosen} onSelect={setSelected} columns={inspection.headers.map((_,index)=>{
          const assigned=Object.entries(mapping.columns).find(([,column])=>column===index)?.[0];
          return {column:index+1,header:caption(index),meaning:assigned?t(`exportTools.fields.${assigned}`):t("tableImport.fields.ignore")};
        })}>
          <fieldset className="source-column-details"><legend>{caption(chosen-1)}</legend>
            <Select label={t("tableImport.meaning")} value={field??""} onChange={e=>setField(e.target.value)} options={[{value:"",label:t("tableImport.fields.ignore")},...fields.map(value=>({value,label:t(`exportTools.fields.${value}`)+(required.includes(value)?" *":"")}))]}/>
            {(field==="x"||field==="y")&&<Select label={t("exportTools.coordinateUnit")} value={mapping.coordinate_unit} onChange={e=>onMapping({...mapping,coordinate_unit:e.target.value as "mm"|"m"})} options={[{value:"mm",label:"mm"},{value:"m",label:"m"}]}/>}
            {field==="tip_level"&&<Select label={t("tableImport.unit")} value={mapping.tip_unit} onChange={e=>onMapping({...mapping,tip_unit:e.target.value as "mm"|"m"})} options={[{value:"m",label:"m"},{value:"mm",label:"mm"}]}/>}
            {field==="pile_size"&&<>
              <Select label={t("exportTools.sourceShape")} value={mapping.size_shape??""} onChange={e=>onMapping({...mapping,size_shape:e.target.value===""?null:e.target.value as "square"|"round"})} options={[{value:"",label:t("exportTools.shapeAutomatic")},{value:"square",label:t("exportTools.shapeSquare")},{value:"round",label:t("exportTools.shapeRound")}]}/>
              <TextField label={t("exportTools.sourceSizeTemplate")} placeholder="{size}x{size}" value={mapping.size_template??""} onChange={e=>onMapping({...mapping,size_template:e.target.value||null})} help={t("exportTools.sourceSizeTemplateHelp")}/>
            </>}
          </fieldset>
        </SourceColumnEditor>
      </fieldset>
    </details>
  </section>;
}
