import { selectedAdviceSources, type AdviceSourceDraft } from "../../domain/imports/adviceImportModel.ts";
import type { ImportSourceInput } from "../../core/coreImportContract.ts";
import { getImportFileFormat, type ImportFileRole } from "../../core/importFiles.ts";
import { projectImportReadiness, type ImportDrafts, type ProjectImportMode,
  type ProjectImportProperties } from "../../domain/imports/projectImportModel.ts";

type ImportForm = {
  drafts: ImportDrafts<File>;
  mode: ProjectImportMode;
  projectName: string;
  pileHeadLevelM: number | null;
  currencyCode: string;
};

type ProjectImportRequest = {
  mode: ProjectImportMode;
  projectName: string | null;
  sources: ImportSourceInput[];
  properties: ProjectImportProperties | null;
};

export async function prepareProjectImportRequest(form: ImportForm): Promise<ProjectImportRequest | null> {
  const { drafts, mode, projectName, pileHeadLevelM, currencyCode } = form;
  if (!projectImportReadiness(drafts, mode, pileHeadLevelM).canSubmit) return null;
  const sources = await prepareProjectImportSources(drafts, mode);
  return {
    mode,
    projectName: mode === "new-project" ? projectName.trim() || "Imported Project" : null,
    sources,
    properties: mode === "new-project" && pileHeadLevelM !== null
      ? { pileHeadLevelM, currencyCode } : null,
  };
}

const fileBytes = new WeakMap<File, Promise<Uint8Array>>();
function readBytes(file: File): Promise<Uint8Array> {
  let result=fileBytes.get(file);
  if (!result) { result=file.arrayBuffer().then(b => new Uint8Array(b)); fileBytes.set(file,result); }
  return result;
}
export async function prepareAdviceSource(source: AdviceSourceDraft<File>, discovery = false, mode: ProjectImportMode = "new-project"): Promise<ImportSourceInput> {
  const format=getImportFileFormat(source.file.name);
  if (!format) throw new Error(`Unsupported file format: ${source.file.name}`);
  return {...(!discovery && mode === "refresh" ? {adviceOperation: source.replacementId ? {kind:"replace" as const,adviceId:source.replacementId} : {kind:"append" as const}} : {}),sourceId:source.id,role:"bearing-capacities",profile:source.requestedProfile,
    profileOptions:{coordinateSheet:null,reactionSheet:null,...(format==="xlsx" ? {adviceSheets:discovery ? source.sheetSelection?.map(s=>({...s})) ?? null : source.sheetSelection?.map(s=>({...s})) ?? []} : {})},
    fileName:source.file.name,format,bytes:await readBytes(source.file)};
}
export async function prepareProjectImportSources(drafts: ImportDrafts<File>, mode: ProjectImportMode = "new-project"): Promise<ImportSourceInput[]> {
  const roles:ImportFileRole[]=drafts.advice ? ["load-points","cpts"] : ["load-points","cpts","bearing-capacities"];
  const sources:ImportSourceInput[]=await Promise.all(roles.filter(role=>drafts[role].file).map(async role=>{
    const draft=drafts[role],file=draft.file!,format=getImportFileFormat(file.name);
    if (!format) throw new Error(`Unsupported file format: ${file.name}`);
    return {role,profile:draft.requestedProfile,profileOptions:draft.profileOptions,fileName:file.name,format,bytes:await readBytes(file)};
  }));
  if (drafts.advice) sources.push(...await Promise.all(selectedAdviceSources(drafts.advice).map(s=>prepareAdviceSource(s, false, mode))));
  return sources;
}
