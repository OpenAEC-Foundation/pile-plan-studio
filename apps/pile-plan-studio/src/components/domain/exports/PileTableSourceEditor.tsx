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
          {inspection.sheet_names.length>0&&<label className="export-field"><span>{t("exportTools.sourceSheet")}</span><select value={source.sheet_name??(inspection.ambiguous_sheet?"":inspection.sheet_name??"")} onChange={e=>onSource({sheet_name:e.target.value,header_row:undefined})}>
            {inspection.ambiguous_sheet&&<option value="">{t("exportTools.chooseSheet")}</option>}{inspection.sheet_names.map(name=><option key={name} value={name}>{name}</option>)}</select></label>}
          <label className="export-field"><span>{t("exportTools.headerRow")}</span><NumericValueInput integer min={1} step={1} value={source.header_row??inspection.header_row} onNumberChange={row=>onSource({header_row:row})}/></label>
        </div>
        <SourceColumnEditor selected={chosen} onSelect={setSelected} columns={inspection.headers.map((_,index)=>{
          const assigned=Object.entries(mapping.columns).find(([,column])=>column===index)?.[0];
          return {column:index+1,header:caption(index),meaning:assigned?t(`exportTools.fields.${assigned}`):t("tableImport.fields.ignore")};
        })}>
          <fieldset className="source-column-details"><legend>{caption(chosen-1)}</legend>
            <label><span>{t("tableImport.meaning")}</span><select value={field??""} onChange={e=>setField(e.target.value)}>
              <option value="">{t("tableImport.fields.ignore")}</option>{fields.map(value=><option key={value} value={value}>{t(`exportTools.fields.${value}`)}{required.includes(value)?" *":""}</option>)}
            </select></label>
            {(field==="x"||field==="y")&&<label><span>{t("exportTools.coordinateUnit")}</span><select value={mapping.coordinate_unit} onChange={e=>onMapping({...mapping,coordinate_unit:e.target.value as "mm"|"m"})}><option value="mm">mm</option><option value="m">m</option></select></label>}
            {field==="tip_level"&&<label><span>{t("tableImport.unit")}</span><select value={mapping.tip_unit} onChange={e=>onMapping({...mapping,tip_unit:e.target.value as "mm"|"m"})}><option value="m">m</option><option value="mm">mm</option></select></label>}
            {field==="pile_size"&&<>
              <label><span>{t("exportTools.sourceShape")}</span><select value={mapping.size_shape??""} onChange={e=>onMapping({...mapping,size_shape:e.target.value===""?null:e.target.value as "square"|"round"})}>
                <option value="">{t("exportTools.shapeAutomatic")}</option><option value="square">{t("exportTools.shapeSquare")}</option><option value="round">{t("exportTools.shapeRound")}</option></select></label>
              <label><span>{t("exportTools.sourceSizeTemplate")}</span><input placeholder="{size}x{size}" value={mapping.size_template??""} onChange={e=>onMapping({...mapping,size_template:e.target.value||null})}/><small>{t("exportTools.sourceSizeTemplateHelp")}</small></label>
            </>}
          </fieldset>
        </SourceColumnEditor>
      </fieldset>
    </details>
  </section>;
}
