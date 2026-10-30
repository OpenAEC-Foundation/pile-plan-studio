import initWasm,{
  preview_configured_pile_plan_export,export_configured_pile_plan_csv,export_configured_pile_plan_xlsx,
  inspect_pile_table,preview_revit_revision,export_revit_revision_csv,export_revit_revision_xlsx,reconcile_locations,prepare_load_point_refresh,
} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import {initializeWasm,invokeDesktop,isTauriRuntime} from "./coreTransport.ts";
import {binaryResultToUint8Array} from "./binaryCoreResult.ts";
import {toConfiguredExportRequest,toCoreExportPlan,type ExportOptions,type ExportPreview,type RevitRevisionInput,type RevisionPreview,type LocationMatchingRequest,type MatchingResult,type LoadPointRefreshPreview,type LocationDecisions,type RevisionSource,type PileTableInspection,type PileTableMapping} from "./exportRevisionContract.ts";
import type {PilePlanExportInput} from "./projectTypes.ts";
import type {IfcppProject} from "./projectFile.ts";
import {toCoreImportSource,type ImportSourceInput} from "./coreImportContract.ts";
import {toWasmIfcppProject} from "./projectCoreClient.ts";

async function command<T>(name:string,request:unknown,browser:(request:unknown)=>unknown):Promise<T>{
  if(isTauriRuntime())return invokeDesktop<T>(name,{request});
  await initializeWasm(initWasm);
  return browser(request) as T;
}

export function previewPilePlanExportCore(input:PilePlanExportInput,options:ExportOptions):Promise<ExportPreview>{
  return command("preview_configured_pile_plan_export",toConfiguredExportRequest(input,options,isTauriRuntime()),preview_configured_pile_plan_export);
}

export async function exportConfiguredPilePlanCore(format:"csv"|"xlsx",input:PilePlanExportInput,options:ExportOptions):Promise<Uint8Array>{
  return binaryResultToUint8Array(await command<Uint8Array|number[]>(`export_configured_pile_plan_${format}`,toConfiguredExportRequest(input,options,isTauriRuntime()),format==="csv"?export_configured_pile_plan_csv:export_configured_pile_plan_xlsx));
}

function revisionRequest(input:RevitRevisionInput){
  return {old_source:input.oldSource,new_plan:toCoreExportPlan(input.newPlan,isTauriRuntime()),new_source:input.newSource??null,
    source_decisions:input.sourceDecisions??null,export_options:input.options,tolerance_mm:input.toleranceMm,decisions:input.decisions,use_detected_numbering:input.useDetectedNumbering,
    old_mapping:mappingRequest(input.oldMapping),new_mapping:mappingRequest(input.newMapping),output_columns:input.outputColumns??null,change_codes:input.changeCodes};
}

export function previewRevitRevisionCore(input:RevitRevisionInput):Promise<RevisionPreview>{
  return command("preview_revit_revision",revisionRequest(input),preview_revit_revision);
}

export async function exportRevitRevisionCore(format:"csv"|"xlsx",input:RevitRevisionInput):Promise<Uint8Array>{
  return binaryResultToUint8Array(await command<Uint8Array|number[]>(`export_revit_revision_${format}`,revisionRequest(input),format==="csv"?export_revit_revision_csv:export_revit_revision_xlsx));
}

export function reconcileLocationsCore(request:LocationMatchingRequest):Promise<MatchingResult>{
  return command("reconcile_locations",request,reconcile_locations);
}

export function prepareLoadPointRefreshCore(input:{currentProject:IfcppProject;sources:ImportSourceInput[];toleranceMm:number;decisions?:LocationDecisions}):Promise<LoadPointRefreshPreview>{
  return command("prepare_load_point_refresh",{current_project:isTauriRuntime()?input.currentProject:toWasmIfcppProject(input.currentProject),sources:input.sources.map(toCoreImportSource),tolerance_mm:input.toleranceMm,decisions:input.decisions},prepare_load_point_refresh);
}

function mappingRequest(mapping:PileTableMapping|null|undefined){
  return mapping ? {...mapping,columns:isTauriRuntime()?mapping.columns:new Map(Object.entries(mapping.columns))} : null;
}
export async function inspectPileTableCore(source:RevisionSource):Promise<PileTableInspection>{
  const result=await command<PileTableInspection>("inspect_pile_table",{source},inspect_pile_table);
  const columns=result.mapping.columns;
  return {...result,mapping:{...result.mapping,columns:columns instanceof Map?Object.fromEntries(columns):columns}};
}
