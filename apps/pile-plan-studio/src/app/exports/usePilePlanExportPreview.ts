import {useEffect,useRef,useState} from "react";
import {inspectPileTableCore,previewPilePlanExportCore,previewRevitRevisionCore} from "../../core/exportRevisionCoreClient.ts";
import {DEFAULT_CHANGE_CODES,toCoreExportPlan,type ExportColumn,type ExportOptions,type RevisionSource,type LocationDecisions,type RevitRevisionInput,type PileNumberingRule,type PileTableMapping,type PileTableInspection,type ExportPreview,type RevisionPreview} from "../../core/exportRevisionContract.ts";
import type {PilePlanExportInput} from "../../core/projectTypes.ts";
import {localizeExportColumns,DEFAULT_COLUMN_HEADERS} from "../../domain/exports/exportColumns.ts";
import {getImportFileFormat} from "../../core/importFiles.ts";
import {useCorePreview} from "./useCorePreview.ts";

const EMPTY_PLAN:PilePlanExportInput={loadPoints:[],selectedPiles:new Map(),selectedCpts:new Map(),pileShapes:new Map(),pileSizeFormat:"numeric"};
export function usePilePlanExportPreview(input:PilePlanExportInput|null,options:ExportOptions,contextKey:string,mode:"normal"|"revision",headers=DEFAULT_COLUMN_HEADERS){
  const [oldSource,setOldSource]=useState<RevisionSource|null>(null),[newSource,setNewSource]=useState<RevisionSource|null>(null);
  const [oldMapping,setOldMapping]=useState<PileTableMapping|null>(null),[newMapping,setNewMapping]=useState<PileTableMapping|null>(null);
  const [layout,setLayout]=useState<{key:string;columns:ExportColumn[]}|null>(null);
  const [useFile,setUseFile]=useState(false),[fileError,setFileError]=useState<unknown>(null),[reading,setReading]=useState(0);
  const [tolerance,setTolerance]=useState(99);
  const [review,setReview]=useState<{identity:string;decisions:LocationDecisions}|null>(null);
  const [ruleOverride,setRuleOverride]=useState<{identity:string;rule:PileNumberingRule}|null>(null);
  const [openIdentity,setOpenIdentity]=useState<string|null>(null);
  const fileTokens=useRef({old:0,new:0});
  useEffect(()=>()=>{fileTokens.current.old++;fileTokens.current.new++;},[]);
  const inputKey=input?JSON.stringify(toCoreExportPlan(input,true)):"";
  const sourceKey=(source:RevisionSource|null,side:"old"|"new")=>source?JSON.stringify([fileTokens.current[side],source.file_name,source.sheet_name,source.header_row]):null;
  const oldKey=sourceKey(oldSource,"old"),newKey=sourceKey(newSource,"new");
  const oldInspection=useCorePreview(oldKey,()=>inspectPileTableCore(oldSource!));
  const newInspection=useCorePreview(useFile?newKey:null,()=>inspectPileTableCore(newSource!));
  // Keep interpretation controls available after an invalid sheet/header choice;
  // requests below still require a fresh successful inspection.
  const editorCache=useRef<Partial<Record<"old"|"new",{token:number;inspection:PileTableInspection}>>>({});
  if(oldInspection.result)editorCache.current.old={token:fileTokens.current.old,inspection:oldInspection.result};
  if(newInspection.result)editorCache.current.new={token:fileTokens.current.new,inspection:newInspection.result};
  const oldInspectionForEditor=oldInspection.result??(oldSource&&editorCache.current.old?.token===fileTokens.current.old?editorCache.current.old.inspection:null);
  const newInspectionForEditor=newInspection.result??(newSource&&editorCache.current.new?.token===fileTokens.current.new?editorCache.current.new.inspection:null);
  const effectiveOldMapping=oldMapping??oldInspection.result?.mapping??null;
  const effectiveNewMapping=newMapping??newInspection.result?.mapping??null;
  const identity=JSON.stringify([contextKey,inputKey,oldKey,effectiveOldMapping,useFile?newKey:null,useFile?effectiveNewMapping:null,useFile,tolerance]);
  const layoutKey=JSON.stringify([oldKey,effectiveOldMapping]);
  const inherited=oldInspection.result?.source_columns.map(column=>{
    if(column.key==="change")return column;
    const field=Object.entries(effectiveOldMapping?.columns??{}).find(([,index])=>index===column.source_index)?.[0] as ExportColumn["field"]|undefined;
    return {...column,field:field??"source"};
  })??[];
  const outputColumns=localizeExportColumns(layout?.key===layoutKey?layout.columns:inherited,headers);
  const normal=useCorePreview(mode==="normal"&&input?JSON.stringify([contextKey,inputKey,options]):null,()=>previewPilePlanExportCore(input!,options));
  const normalDisplayKey=JSON.stringify([contextKey,inputKey]);
  const normalCache=useRef<{key:string;preview:ExportPreview}|null>(null);
  if(normal.result)normalCache.current={key:normalDisplayKey,preview:normal.result};
  const normalDisplay=normal.result??(normal.pending&&normalCache.current?.key===normalDisplayKey?normalCache.current.preview:null);
  const request:RevitRevisionInput|null=mode==="revision"&&oldSource&&oldInspection.result&&(!useFile?input:!!newSource&&!!newInspection.result)?{
    oldSource,newPlan:input??EMPTY_PLAN,newSource:useFile?newSource:null,oldMapping:effectiveOldMapping,newMapping:effectiveNewMapping,
    outputColumns,changeCodes:options.change_codes??DEFAULT_CHANGE_CODES,
    options:ruleOverride?.identity===identity?{...options,mark:{...options.mark,rule:ruleOverride.rule}}:options,
    toleranceMm:tolerance,decisions:review?.identity===identity?review.decisions:null,useDetectedNumbering:ruleOverride?.identity!==identity,
  }:null;
  const revision=useCorePreview(request?JSON.stringify([identity,request.options,request.decisions,request.useDetectedNumbering,request.outputColumns,request.changeCodes]):null,()=>previewRevitRevisionCore(request!));
  const revisionCache=useRef<{key:string;preview:RevisionPreview}|null>(null);
  if(revision.result)revisionCache.current={key:identity,preview:revision.result};
  const revisionDisplay=revision.result??(revision.pending&&revisionCache.current?.key===identity?revisionCache.current.preview:null);
  const hasRevisionTable=revisionCache.current?.key===identity&&revisionCache.current.preview.table!=null;
  const readFile=async(file:File|null,side:"old"|"new")=>{
    const token=++fileTokens.current[side];const setter=side==="old"?setOldSource:setNewSource;
    setter(null);(side==="old"?setOldMapping:setNewMapping)(null);setFileError(null);setOpenIdentity(null);
    if(!file)return;
    const format=getImportFileFormat(file.name);
    if(!format){setFileError("revision_invalid_source");return;}
    setReading(count=>count+1);
    try{const bytes=Array.from(new Uint8Array(await file.arrayBuffer()));if(token===fileTokens.current[side])setter({file_name:file.name,format,bytes});}
    catch(reason){if(token===fileTokens.current[side])setFileError(reason);}
    finally{setReading(count=>count-1);}
  };
  const changeSource=(side:"old"|"new",patch:Partial<RevisionSource>)=>{
    (side==="old"?setOldSource:setNewSource)(source=>source?{...source,...patch}:null);
    (side==="old"?setOldMapping:setNewMapping)(null);setOpenIdentity(null);
  };
  const preview=revisionDisplay;
  const displayOptions=mode==="revision"&&preview&&ruleOverride?.identity!==identity?{...options,mark:{...options.mark,rule:preview.numbering.total_positions?preview.numbering.rule:options.mark.rule}}:options;
  return {
    normal,revision,normalDisplay,revisionDisplay,hasRevisionTable,oldSource,newSource,useFile,setUseFile,fileError,reading:reading>0,tolerance,setTolerance,request,identity,displayOptions,
    oldInspection,newInspection,oldInspectionForEditor,newInspectionForEditor,oldMapping:effectiveOldMapping??oldInspectionForEditor?.mapping??null,newMapping:effectiveNewMapping??newInspectionForEditor?.mapping??null,setOldMapping,setNewMapping,changeSource,
    outputColumns,setOutputColumns:(columns:ExportColumn[])=>setLayout({key:layoutKey,columns}),resetOutputColumns:()=>setLayout(null),
    readOld:(file:File|null)=>readFile(file,"old"),readNew:(file:File|null)=>readFile(file,"new"),
    overrideRule:(rule:PileNumberingRule)=>setRuleOverride({identity,rule}),useDetected:()=>setRuleOverride(null),
    reviewed:review?.identity===identity,
    reviewOpen:openIdentity===identity,openReview:()=>setOpenIdentity(identity),closeReview:()=>setOpenIdentity(null),
    confirm:(decisions:LocationDecisions)=>{setReview({identity,decisions});setOpenIdentity(null);},
  };
}
