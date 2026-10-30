import NumericValueInput from "../../template/NumericValueInput.tsx";
import SourceColumnEditor from "../shared/SourceColumnEditor.tsx";
import {useRef,useState,type ReactNode} from "react";
import {useTranslation} from "react-i18next";
import type {ImportColumnMapping,ImportDiagnostic,SourceTablePreview,TableImportSettings} from "../../../core/coreImportContract.ts";
import {importDiagnosticText} from "../../../core/importDiagnosticText.ts";
import type {ImportFileRole} from "../../../core/importFiles.ts";
import "./sourceTableEditor.css";

type Props={preview?:SourceTablePreview|null;settings?:TableImportSettings|null;diagnostics?:ImportDiagnostic[];sourceErrors?:Array<{row:number;column:number|null;message:string}>;role:ImportFileRole|"pile-plan";matrix?:boolean;processed?:boolean;csv?:boolean;children?:ReactNode;onChange:(settings:TableImportSettings)=>void};
export default function SourceTableEditor({preview,settings,diagnostics=[],sourceErrors=[],role,matrix=false,processed=false,csv=false,children,onChange}:Props){
 const {t}=useTranslation("common");const [selected,setSelected]=useState(1);
 const errors=[...diagnostics.filter(d=>d.location?.row!=null&&d.severity==="error").map(d=>({row:d.location!.row!,column:d.location!.column,message:importDiagnosticText(d,t)})),...sourceErrors];
 const settingsRef=useRef<HTMLDetailsElement>(null);
 const previewRef=useRef<HTMLDetailsElement>(null);
 const value=settings??preview?.settings??{};
 const columns=value.columns??[];
 const isProcessed=processed||preview?.processed;
 const previewRows=preview?.rows.filter(row=>isProcessed||((!value.has_headers||row.number!==value.header_row)&&row.number>=(value.first_data_row??1)))??[];
 const chosen=preview?.columns.find(c=>c.column===selected)??preview?.columns[0];
 const mapping=columns.find(c=>c.column===chosen?.column);
 const fields=role==="pile-plan"?["ignore","id","x","y","pile-size","tip-level","selected-cpts","pile-count"]:role==="cpts"?["ignore","id","x","y"]:role==="load-points"?["ignore","id","x","y","compression","tension"]:matrix?["ignore","id","tip-level","resistance"]:["ignore","id","tip-level","pile-size","resistance","tension"];
 const label=(field:string)=>t(`tableImport.fields.${role==="bearing-capacities"&&field==="id"?"cpt":role==="bearing-capacities"&&field==="tension"?"tensionResistance":field}`);
 const caption=(column:{column:number;header:string})=>column.header||t("tableImport.column",{number:column.column});
 const update=(patch:Partial<TableImportSettings>)=>onChange({...value,...patch});
 const updateColumn=(patch:Partial<ImportColumnMapping>)=>{
  if(!chosen)return;
  const next=columns.map(c=>c.column===chosen.column?{...c,...patch}:patch.field&&patch.field!=="ignore"&&!(matrix&&patch.field==="resistance")&&c.field===patch.field?{...c,field:"ignore",pile_size_mm:null}:c);
  if(!next.some(c=>c.column===chosen.column))next.push({column:chosen.column,field:"ignore",...patch});
  update({columns:next,...(patch.field==="pile-size"?{fixed_pile_size_mm:null}:{})});
 };
 const select=(column:number)=>{setSelected(column);if(settingsRef.current)settingsRef.current.open=true;};
 return <div className="source-table-editor">
  {errors.map((d,i)=><button className="source-error-link" type="button" key={i} title={d.message} onClick={()=>{if(previewRef.current)previewRef.current.open=true;if(d.column)setSelected(d.column);requestAnimationFrame(()=>{const row=previewRef.current?.querySelector<HTMLElement>(`[data-source-row="${d.row}"]`);row?.focus();row?.scrollIntoView?.({block:"nearest"});});}}>{t("tableImport.showError",{row:d.row,column:d.column??"—"})}</button>)}
  <details ref={previewRef} className="source-import-disclosure">
   <summary><strong>{t("tableImport.preview")}</strong><span>{preview?t("tableImport.rowCount",{count:preview.row_count}):t("tableImport.notAvailable")}{isProcessed?` · ${t("tableImport.processed")}`:""}</span></summary>
   {preview?<div className="source-preview-scroll"><table className="source-preview-table"><thead><tr><th aria-label={t("tableImport.row")}>#</th>{preview.columns.map(c=><th key={c.column} className={chosen?.column===c.column&&!isProcessed?"is-selected":""}>{isProcessed?caption(c):<button type="button" aria-label={t("tableImport.selectColumn",{name:caption(c)})} onClick={()=>select(c.column)}><strong>{caption(c)}</strong><small>{label(columns.find(m=>m.column===c.column)?.field??"ignore")}</small></button>}</th>)}</tr></thead>
    <tbody>{previewRows.map(r=><tr key={r.number} data-source-row={r.number} tabIndex={-1} className={errors.some(d=>d.row===r.number)?"is-error":undefined}><th scope="row">{r.number}</th>{r.cells.map((cell,i)=><td key={i} className={chosen?.column===i+1&&!isProcessed?"is-selected":""}>{cell||<span className="source-empty-cell">—</span>}</td>)}</tr>)}</tbody></table></div>:<p className="source-import-help">{t("tableImport.notAvailable")}</p>}
   {preview&&preview.row_count>preview.rows.length&&<p className="source-import-help">{t("tableImport.previewLimit",{count:preview.rows.length})}</p>}
  </details>
  <details ref={settingsRef} className="source-import-disclosure">
   <summary><strong>{t("tableImport.settings")}</strong><span>{isProcessed?t("tableImport.rfemSettings"):t("tableImport.mappedCount",{count:columns.filter(c=>c.field!=="ignore").length})}</span></summary>
   <div className="source-import-settings">
    {children}
    {preview&&!isProcessed&&<>
     {role==="bearing-capacities"&&<>
      <div className="source-import-file-settings">
       <label><span>{t("tableImport.adviceApplicability")}</span><select value={value.pile_count==null?"all":"specific"} onChange={e=>update({pile_count:e.target.value==="all"?null:1})}><option value="all">{t("tableImport.allPileCounts")}</option><option value="specific">{t("tableImport.specificPileCount")}</option></select></label>
       {value.pile_count!=null&&<label><span>{t("tableImport.capPileCount")}</span><NumericValueInput integer min={1} max={4294967295} value={value.pile_count} onNumberChange={pile_count=>update({pile_count})}/></label>}
      </div>
      {!matrix&&<div className="source-import-file-settings">
       <label><span>{t("tableImport.sizeSource")}</span><select value={value.fixed_pile_size_mm!=null?"fixed":"column"} onChange={e=>update({fixed_pile_size_mm:e.target.value==="fixed"?0:null,...(e.target.value==="fixed"?{columns:columns.map(c=>c.field==="pile-size"?{...c,field:"ignore"}:c)}:{})})}><option value="column">{t("tableImport.sizeFromColumn")}</option><option value="fixed">{t("tableImport.fixedSheetSize")}</option></select></label>
       {value.fixed_pile_size_mm!=null&&<label><span>{t("tableImport.fixedPileSize")}</span><NumericValueInput integer min={1} max={4294967295} value={value.fixed_pile_size_mm||""} onNumberChange={fixed_pile_size_mm=>update({fixed_pile_size_mm})}/></label>}
      </div>}
      <p className="source-import-help">{t("tableImport.applicabilityHelp")}</p>
     </>}
     <div className="source-import-file-settings">
      {preview.sheets.length>1&&<label><span>{t("tableImport.sheet")}</span><select value={value.sheet_name??""} onChange={e=>onChange({sheet_name:e.target.value,delimiter:value.delimiter})}>{preview.sheets.map(s=><option key={s} value={s}>{s}</option>)}</select></label>}
      <label className="source-import-checkbox"><input type="checkbox" checked={value.has_headers??false} onChange={e=>update({has_headers:e.target.checked,header_row:e.target.checked?(value.header_row??1):null,first_data_row:e.target.checked?(value.header_row??1)+1:1})}/><span>{t("tableImport.hasHeaders")}</span></label>
      {value.has_headers&&<label><span>{t("tableImport.headerRow")}</span><NumericValueInput integer min={1} step={1} value={value.header_row??1} onNumberChange={n=>update({header_row:n,first_data_row:n+1,columns:null})}/></label>}
      <label><span>{t("tableImport.dataRow")}</span><NumericValueInput integer min={1} step={1} value={value.first_data_row??1} onNumberChange={n=>update({first_data_row:n})}/></label>
      {csv&&<label><span>{t("tableImport.delimiter")}</span><select value={value.delimiter??"auto"} onChange={e=>update({delimiter:e.target.value==="auto"?null:e.target.value,columns:null})}><option value="auto">{t("tableImport.automatic")}</option><option value=",">{t("tableImport.comma")}</option><option value=";">{t("tableImport.semicolon")}</option><option value="tab">Tab</option></select></label>}
     </div>
     <SourceColumnEditor selected={chosen?.column??1} onSelect={setSelected} columns={preview.columns.map(c=>{
      const assigned=columns.find(m=>m.column===c.column);
      return {column:c.column,header:caption(c),meaning:label(assigned?.field??"ignore")+(matrix&&assigned?.pile_size_mm?` · ${assigned.pile_size_mm} mm`:""),empty:c.nonempty_count===0};
     })}>
      {chosen&&<fieldset className="source-column-details"><legend>{caption(chosen)}</legend>
       <label><span>{t("tableImport.meaning")}</span><select value={mapping?.field??"ignore"} onChange={e=>updateColumn({field:e.target.value})}>{fields.map(field=><option key={field} value={field} disabled={field!=="ignore"&&chosen.nonempty_count===0&&!(role==="pile-plan"&&["pile-size","tip-level","selected-cpts"].includes(field))}>{label(field)}</option>)}</select></label>
       {chosen.nonempty_count===0&&<p className="source-import-help">{t(role==="pile-plan"?"pilePlanMatching.emptyColumnHelp":"tableImport.emptyHelp")}</p>}
       {["x","y","tip-level"].includes(mapping?.field??"")&&<label><span>{t("tableImport.unit")}</span><select value={mapping?.unit??(mapping?.field==="tip-level"?"m":"mm")} onChange={e=>updateColumn({unit:e.target.value})}><option value="mm">mm</option><option value="m">m</option></select></label>}
       {matrix&&mapping?.field==="resistance"&&<label><span>{t("tableImport.pileSize")}</span><NumericValueInput key={chosen.column} integer min={1} step={1} value={mapping.pile_size_mm??""} onNumberChange={size=>updateColumn({pile_size_mm:size})}/><small>mm</small></label>}
       <p className="source-import-help">{t("tableImport.columnSummary",{filled:chosen.nonempty_count,numeric:chosen.numeric_count})}</p>
      </fieldset>}
     </SourceColumnEditor>
    </>}
   </div>
  </details>
 </div>;
}
