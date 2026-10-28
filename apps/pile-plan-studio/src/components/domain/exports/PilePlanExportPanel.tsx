import {useState} from "react";
import {useTranslation} from "react-i18next";
import {usePilePlanExportPreview} from "../../../app/exports/usePilePlanExportPreview.ts";
import {DEFAULT_CHANGE_CODES,DEFAULT_EXPORT_OPTIONS,type ExportOptions,type RevitRevisionInput} from "../../../core/exportRevisionContract.ts";
import {defaultExportColumns,optionsWithColumns,DEFAULT_COLUMN_HEADERS} from "../../../domain/exports/exportColumns.ts";
import type {PilePlanExportInput,PileSizeExportFormat} from "../../../core/projectTypes.ts";
import ExportColumnsEditor from "./ExportColumnsEditor.tsx";
import ExportTablePreview from "./ExportTablePreview.tsx";
import PileTableSourceEditor from "./PileTableSourceEditor.tsx";
import LocationMatchingWorkspace from "../location-matching/LocationMatchingWorkspace.tsx";
import {exportErrorText} from "./exportErrorText.ts";
import "./exports.css";

export type ExportFeatureProps={
  exportPlans?:{id:string;name:string}[];exportPlanId?:string;onExportPlanChange?:(id:string)=>void;
  exportPlan?:PilePlanExportInput|null;exportContextKey?:string;exportOptions?:ExportOptions;
  onExportOptionsChange?:(options:ExportOptions)=>void;
  onExportRevision?:(format:"csv"|"xlsx",request:RevitRevisionInput,contextKey:string)=>Promise<void>;
};
type Props=ExportFeatureProps&{activePilePlanName:string;pileSizeFormat:PileSizeExportFormat;onPileSizeFormatChange?:(format:PileSizeExportFormat)=>void;
  onExportPilePlanXlsx:(format:PileSizeExportFormat,options?:ExportOptions)=>Promise<void>;onExportPilePlanCsv:(format:PileSizeExportFormat,options?:ExportOptions)=>Promise<void>;
  running:boolean;runExport:(run:()=>Promise<void>)=>void};

export default function PilePlanExportPanel({activePilePlanName,pileSizeFormat,onExportPilePlanXlsx,onExportPilePlanCsv,exportPlan,exportContextKey="",exportOptions,onExportOptionsChange,onExportRevision,exportPlans,exportPlanId,onExportPlanChange,running,runExport}:Props){
  const {t}=useTranslation("common");const {t:tb}=useTranslation("backstage");
  const [mode,setMode]=useState<"normal"|"revision">("normal"),[localOptions,setLocalOptions]=useState(DEFAULT_EXPORT_OPTIONS);
  const headers=Object.fromEntries(Object.keys(DEFAULT_COLUMN_HEADERS).map(field=>[field,t(`exportTools.headers.${field}`)]));
  const options=exportOptions??localOptions,normalColumns=defaultExportColumns(options,pileSizeFormat,headers);
  const normalOptions={...options,columns:normalColumns};
  const input=exportPlan?{...exportPlan,pileSizeFormat}:null;
  const state=usePilePlanExportPreview(input,mode==="normal"?normalOptions:options,exportContextKey,mode,headers);
  const revision=state.revisionDisplay,disabled=running||state.reading;
  const error=state.fileError??(mode==="normal"?state.normal.error:state.oldInspection.error??state.newInspection.error??state.revision.error);
  const changeOptions=(next:ExportOptions)=>{
    if(mode==="revision"){
      if(JSON.stringify(next.mark.rule)!==JSON.stringify(state.displayOptions.mark.rule))state.overrideRule(next.mark.rule);
      else next={...next,mark:{...next.mark,rule:options.mark.rule}};
    }
    setLocalOptions(next);onExportOptionsChange?.(next);
  };
  const selectedPlanName=exportPlans?.find(plan=>plan.id===exportPlanId)?.name??activePilePlanName;
  const normalExport=(format:"csv"|"xlsx")=>runExport(()=>(format==="xlsx"?onExportPilePlanXlsx:onExportPilePlanCsv)(pileSizeFormat,normalOptions));
  const revisionExport=(format:"csv"|"xlsx")=>{
    if(!state.request||!onExportRevision||!state.reviewed||state.revision.pending||!state.revision.result?.matching.complete)return;
    const request=state.request;runExport(()=>onExportRevision(format,request,exportContextKey));
  };
  return <section className="bs-export-card pile-plan-export-card">
    <header className="bs-export-card-heading"><h3>{t("exportTools.exportTitle")}</h3><span className="bs-export-format">XLSX / CSV</span></header>
    {exportPlans&&exportPlans.length>0&&(mode==="normal"||!state.useFile)&&<label className="export-field export-plan-choice"><span>{t("exportTools.exportPilePlan")}</span>
      <select value={exportPlanId} disabled={disabled} onChange={e=>onExportPlanChange?.(e.target.value)}>{exportPlans.map(plan=><option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>}
    <div className="export-mode" role="group" aria-label={t("exportTools.exportMode")}>
      <button type="button" aria-pressed={mode==="normal"} disabled={disabled} onClick={()=>setMode("normal")}>{t("exportTools.normalMode")}</button>
      <button type="button" aria-pressed={mode==="revision"} disabled={disabled} onClick={()=>setMode("revision")}>{t("exportTools.revisionMode")}</button>
    </div>
    {mode==="revision"&&<section className="change-table-sources" aria-label={t("exportTools.comparisonSources")}>
      <p className="export-help">{t("exportTools.changeTableHelp")}</p>
      <FilePicker label={t("exportTools.oldSource")} fileName={state.oldSource?.file_name} disabled={disabled} onChange={state.readOld}/>
      {state.oldSource&&state.oldInspectionForEditor&&state.oldMapping&&<PileTableSourceEditor source={state.oldSource} inspection={state.oldInspectionForEditor!} mapping={state.oldMapping}
        onMapping={state.setOldMapping} onSource={patch=>state.changeSource("old",patch)} disabled={disabled}/>}
      <div className="export-controls-grid"><label className="export-field"><span>{t("exportTools.newSource")}</span><select aria-label={t("exportTools.newSource")} disabled={disabled} value={state.useFile?"file":"active"} onChange={e=>state.setUseFile(e.target.value==="file")}>
        <option value="active">{t("exportTools.selectedPlan")}: {selectedPlanName}</option><option value="file">{t("exportTools.exportFile")}</option></select></label>
        <label className="export-field"><span>{t("exportTools.matchTolerance")}</span><input type="number" min={0} step="any" disabled={disabled} value={state.tolerance} onChange={e=>state.setTolerance(Number(e.target.value))}/></label></div>
      {state.useFile&&<><FilePicker label={t("exportTools.newFile")} fileName={state.newSource?.file_name} disabled={disabled} onChange={state.readNew}/>
        {state.newSource&&state.newInspectionForEditor&&state.newMapping&&<PileTableSourceEditor source={state.newSource} inspection={state.newInspectionForEditor!} mapping={state.newMapping}
          onMapping={state.setNewMapping} onSource={patch=>state.changeSource("new",patch)} disabled={disabled} newPlan/>}</>}
      {revision&&<div className="export-comparison-summary">
        {revision.numbering.total_positions>0?<><p>{t("exportTools.detection",{matched:revision.numbering.matching_positions,total:revision.numbering.total_positions})}</p>
          {revision.numbering.equally_matching_rules>1&&<p>{t("exportTools.detectionAmbiguous")}</p>}
          <button type="button" className="export-quiet-button" onClick={state.useDetected} disabled={disabled}>{t("exportTools.useDetected")}</button></>:<p>{t("exportTools.noSourceMarks")}</p>}
        {!!revision.missing_comparisons?.length&&<p>{t("exportTools.missingComparisonFields",{fields:revision.missing_comparisons.map(field=>t(`exportTools.fields.${field}`)).join(", ")})}</p>}
        <div className="export-review-row"><p>{t("exportTools.pendingSummary",{newCount:revision.matching.unmatched_new.length,oldCount:revision.matching.unmatched_old.length})}</p>
          <button type="button" className="export-primary" disabled={disabled||state.revision.pending} onClick={state.openReview}>{t(state.reviewed?"exportTools.reviewAgain":"exportTools.review")}</button></div>
      </div>}
    </section>}
    {(mode==="normal"||state.outputColumns.length>0)&&<details className="export-disclosure export-columns-disclosure"><summary>{t("exportTools.columnSettings")}</summary><ExportColumnsEditor columns={mode==="normal"?normalColumns:state.outputColumns}
      onChange={columns=>mode==="normal"?changeOptions(optionsWithColumns(options,columns)):state.setOutputColumns(columns)}
      defaultHeaders={headers} options={state.displayOptions} onOptionsChange={changeOptions} disabled={disabled} revision={mode==="revision"} firstNewMark={revision?.first_new_mark}
      preserveMarks={(revision?.numbering.total_positions??0)>0} sourceHeaders={mode==="revision"?state.oldInspectionForEditor?.headers:[]}
      changeCodes={options.change_codes??DEFAULT_CHANGE_CODES} onChangeCodes={codes=>changeOptions({...state.displayOptions,change_codes:codes})}
      onReset={()=>mode==="normal"?changeOptions({...options,columns:undefined}):state.resetOutputColumns()}/></details>}
    {error!=null&&<p role="alert" className="export-error">{exportErrorText(error,t)}</p>}
    {exportPlan===null&&(mode==="normal"||!state.useFile)&&<p className="export-help">{t("exportTools.noNewPlan")}</p>}
    <p role="status" className="export-help export-preview-status">{(state.normal.pending||state.revision.pending||state.reading||state.oldInspection.pending||state.newInspection.pending)?t("exportTools.preparing"):""}</p>
    {(mode==="normal"&&exportPlan||mode==="revision"&&state.hasRevisionTable)&&<details className="export-disclosure export-preview-disclosure"><summary>{t("exportTools.tablePreview")}</summary><div className="export-preview-slot" aria-busy={mode==="normal"?state.normal.pending:state.revision.pending}>
      {mode==="normal"&&state.normalDisplay&&<ExportTablePreview table={state.normalDisplay.table} tipCodes={state.normalDisplay.tip_codes}/>}
      {mode==="revision"&&state.revisionDisplay?.table&&<ExportTablePreview table={state.revisionDisplay.table} tipCodes={state.revisionDisplay.tip_codes}/>}
    </div></details>}
    {mode==="revision"&&(revision?.matching.added.length??0)>0&&<p className="export-help">{t("exportTools.addedMetadata")}</p>}
    {mode==="revision"&&!state.oldSource&&<p className="export-help">{t("exportTools.chooseOld")}</p>}
    <div className="export-actions">
      {mode==="normal"?<><button type="button" className="export-primary" disabled={disabled||exportPlan===null||state.normal.pending||Boolean(state.normal.error)} onClick={()=>normalExport("xlsx")}>{tb("exportPanel.exportExcel")}</button>
        <button type="button" className="export-secondary" disabled={disabled||exportPlan===null||state.normal.pending||Boolean(state.normal.error)} onClick={()=>normalExport("csv")}>{tb("exportPanel.exportCsv")}</button></>
        :state.reviewed&&<><button type="button" className="export-primary" disabled={disabled||!revision?.table||state.revision.pending||!onExportRevision} onClick={()=>revisionExport("xlsx")}>{t("exportTools.revisionExport")}</button>
          <button type="button" className="export-secondary" disabled={disabled||!revision?.table||state.revision.pending||!onExportRevision} onClick={()=>revisionExport("csv")}>{t("exportTools.revisionCsv")}</button></>}
    </div>
    {state.reviewOpen&&revision&&<LocationMatchingWorkspace key={state.identity} oldLocations={revision.old_locations} newLocations={revision.new_locations} initial={revision.matching}
      toleranceMm={state.tolerance} onConfirm={state.confirm} onCancel={state.closeReview} initialAutomatic={!state.reviewed}/>}
  </section>;
}

function FilePicker({label,fileName,disabled,onChange}:{label:string;fileName?:string;disabled:boolean;onChange:(file:File|null)=>Promise<void>}){
  const {t}=useTranslation("common");
  return <label className={`export-file-picker${disabled?" is-disabled":""}`}><span><strong>{label}</strong><small>{fileName??t("exportTools.noFileChosen")}</small></span>
    <span className="export-file-action">{t(fileName?"exportTools.replaceFile":"exportTools.chooseFile")}</span>
    <input type="file" aria-label={label} accept=".xlsx,.csv" disabled={disabled} onChange={e=>void onChange(e.target.files?.[0]??null)}/></label>;
}
