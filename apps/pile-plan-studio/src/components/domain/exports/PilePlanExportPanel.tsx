import {useState} from "react";
import {useTranslation} from "react-i18next";
import {usePilePlanExportPreview} from "../../../app/exports/usePilePlanExportPreview.ts";
import {DEFAULT_CHANGE_CODES,DEFAULT_EXPORT_OPTIONS,type ExportOptions,type RevitRevisionInput} from "../../../core/exportRevisionContract.ts";
import {defaultExportColumns,optionsWithColumns,ensureExportColumn,withoutProposalExportColumns,DEFAULT_COLUMN_HEADERS} from "../../../domain/exports/exportColumns.ts";
import type {PilePlanExportInput,PileSizeExportFormat} from "../../../core/projectTypes.ts";
import ExportColumnsEditor from "./ExportColumnsEditor.tsx";
import ExportTablePreview from "./ExportTablePreview.tsx";
import PileTableSourceEditor from "./PileTableSourceEditor.tsx";
import LocationMatchingEntry from "../location-matching/LocationMatchingEntry.tsx";
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
  const {t,i18n}=useTranslation("common");const {t:tb}=useTranslation("backstage");
  const [mode,setMode]=useState<"normal"|"revision">("normal"),[localOptions,setLocalOptions]=useState(DEFAULT_EXPORT_OPTIONS);
  const headers=Object.fromEntries(Object.keys(DEFAULT_COLUMN_HEADERS).map(field=>[field,t(`exportTools.headers.${field}`)]));
  const options=exportOptions??localOptions;
  const effectiveOptions={...options,include_proposals:!!exportPlan?.hasProposals&&options.include_proposals===true,language:i18n.language.startsWith("en")?"en":"nl"};
  const normalColumns=defaultExportColumns(effectiveOptions,pileSizeFormat,headers);
  const normalOptions={...effectiveOptions,columns:normalColumns};
  const input=exportPlan?{...exportPlan,pileSizeFormat}:null;
  const state=usePilePlanExportPreview(input,mode==="normal"?normalOptions:effectiveOptions,exportContextKey,mode,headers);
  const revision=state.revisionDisplay,disabled=running||state.reading;
  const reviewMatching=revision?.source_matching&&!revision.source_matching.complete?revision.source_matching:revision?.matching;
  const error=state.fileError??(mode==="normal"?state.normal.error:state.oldInspection.error??state.newInspection.error??state.revision.error);
  const changeOptions=(next:ExportOptions)=>{
    if(mode==="revision"){
      if(JSON.stringify(next.mark.rule)!==JSON.stringify(state.displayOptions.mark.rule))state.overrideRule(next.mark.rule);
      else next={...next,mark:{...next.mark,rule:options.mark.rule}};
    }
    setLocalOptions(next);onExportOptionsChange?.(next);
  };
  const changeTolerance=(value:number)=>{
    if(value!==state.tolerance&&Number.isFinite(value)&&value>=0){
      changeOptions({...state.displayOptions,change_codes:{...options.change_codes??DEFAULT_CHANGE_CODES,movement_threshold_mm:value}});
    }
    state.setTolerance(value);
  };
  const changeProposalSetting=(patch:Pick<ExportOptions,"include_proposals"|"proposal_code">,field?:"export_id"|"proposal_code")=>{
    const updateColumns=(columns:typeof normalColumns)=>{
      if(patch.include_proposals===false)return withoutProposalExportColumns(columns);
      let next=field?ensureExportColumn(columns,field,headers):columns;
      if(patch.include_proposals===true&&options.proposal_code?.trim())next=ensureExportColumn(next,"proposal_code",headers);
      return next;
    };
    if(mode==="revision"&&state.outputColumns.length)state.setOutputColumns(updateColumns(state.outputColumns));
    changeOptions({...optionsWithColumns(options,updateColumns(normalColumns)),...patch});
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
    {exportPlan?.hasProposals&&(mode==="normal"||!state.useFile)&&<section className="export-proposal-options">
      <label><input type="checkbox" disabled={disabled} checked={options.include_proposals===true} onChange={e=>changeProposalSetting({include_proposals:e.target.checked},e.target.checked?"export_id":undefined)}/>{t("exportTools.includeProposals")}</label>
      <p className="export-help">{t(options.include_proposals?"exportTools.proposalHelp":"exportTools.originalHelp")}</p>
      {options.include_proposals&&<label className="export-field"><span>{t("exportTools.proposalCode")}</span><input disabled={disabled} value={options.proposal_code??""} onChange={e=>changeProposalSetting({proposal_code:e.target.value},e.target.value.trim()?"proposal_code":undefined)}/></label>}
    </section>}
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
      </div>
      {state.useFile&&<><FilePicker label={t("exportTools.newFile")} fileName={state.newSource?.file_name} disabled={disabled} onChange={state.readNew}/>
        {state.newSource&&state.newInspectionForEditor&&state.newMapping&&<PileTableSourceEditor source={state.newSource} inspection={state.newInspectionForEditor!} mapping={state.newMapping}
          onMapping={state.setNewMapping} onSource={patch=>state.changeSource("new",patch)} disabled={disabled} newPlan/>}</>}
      {revision&&((revision.source_matching&&!revision.source_matching.complete)||!!revision.missing_comparisons?.length)&&<div className="export-comparison-summary">
        {revision.source_matching&&!revision.source_matching.complete&&<p>{t("exportTools.reviewProposalSources")}</p>}
        {!!revision.missing_comparisons?.length&&<p>{t("exportTools.missingComparisonFields",{fields:revision.missing_comparisons.map(field=>t(`exportTools.fields.${field}`)).join(", ")})}</p>}
      </div>}
    </section>}
    {mode==="revision"&&revision&&<LocationMatchingEntry
      summary={reviewMatching?t("locationMatchingEntry.comparisonSummary",{linked:reviewMatching.links.length,pending:reviewMatching.unmatched_new.length+reviewMatching.unmatched_old.length,added:reviewMatching.added.length,removed:reviewMatching.removed.length}):undefined}
      help={t("locationMatchingEntry.revisionHelp")} reviewed={state.reviewed}
      disabled={disabled||state.revision.pending} onOpen={state.openReview}
      tolerance={state.tolerance} onToleranceChange={value=>changeTolerance(Number(value))}/>}
    {(mode==="normal"||state.outputColumns.length>0)&&<details className="export-disclosure export-columns-disclosure"><summary>{t("exportTools.columnSettings")}</summary><ExportColumnsEditor columns={mode==="normal"?normalColumns:state.outputColumns}
      onChange={columns=>mode==="normal"?changeOptions(optionsWithColumns(options,columns)):state.setOutputColumns(columns)}
      numberingDetection={mode==="revision"?revision?.numbering:undefined} onUseDetectedNumbering={state.useDetected}
      defaultHeaders={headers} options={state.displayOptions} onOptionsChange={changeOptions} disabled={disabled} revision={mode==="revision"} firstNewMark={revision?.first_new_mark}
      preserveMarks={(revision?.numbering.total_positions??0)>0} sourceHeaders={mode==="revision"?state.oldInspectionForEditor?.headers:[]}
      changeCodes={options.change_codes??DEFAULT_CHANGE_CODES} onChangeCodes={codes=>changeOptions({...state.displayOptions,change_codes:codes})}
      onReset={()=>mode==="normal"?changeOptions({...options,columns:undefined}):state.resetOutputColumns()}/></details>}
    {mode==="normal"&&!!state.normalDisplay?.proposed_count&&<p className="export-help">{t("exportTools.proposalSummary",{oldCount:state.normalDisplay.replaced_count,newCount:state.normalDisplay.proposed_count})}</p>}
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
    {state.reviewOpen&&revision?.source_matching&&!revision.source_matching.complete&&<LocationMatchingWorkspace key={`${state.identity}:sources`} oldLocations={revision.old_locations} newLocations={revision.source_locations??[]} initial={revision.source_matching} toleranceMm={state.tolerance} onConfirm={(decisions,tolerance)=>{changeTolerance(tolerance);state.confirmSources(decisions,tolerance);}} onCancel={state.closeReview}/>}
    {state.reviewOpen&&revision&&(!revision.source_matching||revision.source_matching.complete)&&<LocationMatchingWorkspace key={state.identity} oldLocations={revision.old_locations.filter(p=>!revision.forced_removed?.includes(p.id))} newLocations={revision.new_locations.filter(p=>!revision.forced_added?.includes(p.id))} initial={{...revision.matching,added:revision.matching.added.filter(id=>!revision.forced_added?.includes(id)),removed:revision.matching.removed.filter(id=>!revision.forced_removed?.includes(id))}}
      toleranceMm={state.tolerance} onConfirm={(decisions,tolerance)=>{changeTolerance(tolerance);state.confirm({...decisions,added:[...decisions.added,...revision.forced_added??[]],removed:[...decisions.removed,...revision.forced_removed??[]]},tolerance);}} onCancel={state.closeReview} initialAutomatic={!state.reviewed}/>}
  </section>;
}

function FilePicker({label,fileName,disabled,onChange}:{label:string;fileName?:string;disabled:boolean;onChange:(file:File|null)=>Promise<void>}){
  const {t}=useTranslation("common");
  return <label className={`export-file-picker${disabled?" is-disabled":""}`}><span><strong>{label}</strong><small>{fileName??t("exportTools.noFileChosen")}</small></span>
    <span className="export-file-action">{t(fileName?"exportTools.replaceFile":"exportTools.chooseFile")}</span>
    <input type="file" aria-label={label} accept=".xlsx,.csv" disabled={disabled} onChange={e=>void onChange(e.target.files?.[0]??null)}/></label>;
}
