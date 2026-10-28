import {useTranslation} from "react-i18next";
import type {ExportField,PileTableInspection,PileTableMapping,RevisionSource} from "../../../core/exportRevisionContract.ts";
import ExportTablePreview from "./ExportTablePreview.tsx";

type Props={source:RevisionSource;inspection:PileTableInspection;mapping:PileTableMapping;onMapping:(mapping:PileTableMapping)=>void;onSource:(patch:Partial<RevisionSource>)=>void;disabled?:boolean;newPlan?:boolean};
export default function PileTableSourceEditor({source,inspection,mapping,onMapping,onSource,disabled=false,newPlan=false}:Props){
  const {t}=useTranslation("common");
  const required:ExportField[]=newPlan?["load_point_id","x","y","pile_size","tip_level"]:["x","y"];
  const fields:ExportField[]=["load_point_id","mark","x","y","pile_size","tip_level","tip_code","design_load","selected_cpts","change_code"];
  const missing=required.some(field=>mapping.columns[field]==null);
  return <section className="pile-source-editor">
    <details open={missing||inspection.ambiguous_sheet}>
      <summary>{t("exportTools.sourceMapping")}<small>{t("exportTools.recognizedFields",{count:Object.keys(mapping.columns).length})}</small></summary>
      <fieldset disabled={disabled}>
        <p className="export-help">{t(newPlan?"exportTools.sourceMappingNewHelp":"exportTools.sourceMappingOldHelp")}</p>
        <div className="export-controls-grid">
          {inspection.sheet_names.length>0&&<label className="export-field"><span>{t("exportTools.sourceSheet")}</span><select value={source.sheet_name??(inspection.ambiguous_sheet?"":inspection.sheet_name??"")} onChange={e=>onSource({sheet_name:e.target.value,header_row:undefined})}>
            {inspection.ambiguous_sheet&&<option value="">{t("exportTools.chooseSheet")}</option>}{inspection.sheet_names.map(name=><option key={name} value={name}>{name}</option>)}</select></label>}
          <label className="export-field"><span>{t("exportTools.headerRow")}</span><input type="number" min={1} value={source.header_row??inspection.header_row} onChange={e=>{const row=Number(e.target.value);if(Number.isInteger(row)&&row>0)onSource({header_row:row});}}/></label>
        </div>
        <div className="source-mapping-grid">{fields.map(field=><label className="export-field" key={field}><span>{t(`exportTools.fields.${field}`)}{required.includes(field)&&<b aria-hidden="true"> *</b>}</span>
          <select aria-label={t("exportTools.sourceField",{name:t(`exportTools.fields.${field}`)})} value={mapping.columns[field]??""} onChange={e=>{const columns={...mapping.columns};if(e.target.value==="")delete columns[field];else columns[field]=Number(e.target.value);onMapping({...mapping,columns});}}>
            <option value="">{t("exportTools.notInSource")}</option>{inspection.headers.map((header,index)=><option key={index} value={index}>{header||t("exportTools.unnamedColumn",{number:index+1})}</option>)}</select>
        </label>)}</div>
        <details className="source-interpretation"><summary>{t("exportTools.sourceUnits")}</summary><div className="export-controls-grid">
          <label className="export-field"><span>{t("exportTools.coordinateUnit")}</span><select value={mapping.coordinate_unit} onChange={e=>onMapping({...mapping,coordinate_unit:e.target.value as "mm"|"m"})}><option value="mm">mm</option><option value="m">m</option></select></label>
          <label className="export-field"><span>{t("exportTools.tipUnit")}</span><select value={mapping.tip_unit} onChange={e=>onMapping({...mapping,tip_unit:e.target.value as "mm"|"m"})}><option value="m">m</option><option value="mm">mm</option></select></label>
          <label className="export-field"><span>{t("exportTools.sourceShape")}</span><select value={mapping.size_shape??""} onChange={e=>onMapping({...mapping,size_shape:e.target.value===""?null:e.target.value as "square"|"round"})}>
            <option value="">{t("exportTools.shapeAutomatic")}</option><option value="square">{t("exportTools.shapeSquare")}</option><option value="round">{t("exportTools.shapeRound")}</option></select></label>
          <label className="export-field"><span>{t("exportTools.sourceSizeTemplate")}</span><input placeholder="{size}x{size}" value={mapping.size_template??""} onChange={e=>onMapping({...mapping,size_template:e.target.value||null})}/><small>{t("exportTools.sourceSizeTemplateHelp")}</small></label>
        </div></details>
      </fieldset>
    </details>
    <details className="source-table-preview"><summary>{t("exportTools.sourcePreview")}</summary><ExportTablePreview table={inspection.table}/></details>
  </section>;
}
