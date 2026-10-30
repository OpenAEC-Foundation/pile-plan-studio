import type { ImportProfile } from "../../core/coreImportContract.ts";
import type { StoredAdviceSource, AdviceSheetSelection, AdviceSourcePreview, ProjectImportPreview } from "../../core/adviceImportContract.ts";
import type { NamedImportFile } from "../../core/importFiles.ts";

export type AdviceDiscoveryState = { status: "empty" } | { status: "analyzing"; requestId: number }
  | { status: "ready"; requestId: number; preview: AdviceSourcePreview } | { status: "failed"; requestId: number; message: string };
export type AdvicePreviewState = { status: "empty" } | { status: "analyzing"; requestId: number }
  | { status: "ready"; requestId: number; preview: ProjectImportPreview } | { status: "failed"; requestId: number; message: string };
export type AdviceSourceDraft<TFile extends NamedImportFile> = { id: string; replacementId?: string; file: TFile; selected: boolean;lastPreview?:AdviceSourcePreview;
  requestedProfile: ImportProfile; sheetSelection: AdviceSheetSelection[] | null; discovery: AdviceDiscoveryState };
export type AdviceDraft<TFile extends NamedImportFile> = { existingSources?: StoredAdviceSource[]; sources: AdviceSourceDraft<TFile>[]; generation: number; previewState: AdvicePreviewState };

export function createEmptyAdviceDraft<TFile extends NamedImportFile>(): AdviceDraft<TFile> {
  return { sources: [], generation: 0, previewState: { status: "empty" } };
}
function change<T extends NamedImportFile>(draft: AdviceDraft<T>, sources: AdviceSourceDraft<T>[]): AdviceDraft<T> {
  return { ...draft, sources, generation: draft.generation + 1, previewState: { status: "empty" } };
}
export function addAdviceSource<T extends NamedImportFile>(draft: AdviceDraft<T>, id: string, file: T): AdviceDraft<T> {
  if (draft.sources.some(s => s.id === id)) throw new Error("Duplicate source identity");
  return change(draft, [...draft.sources, { id, file, selected: true, requestedProfile: "auto", sheetSelection: null, discovery: { status: "empty" } }]);
}
export function removeAdviceSource<T extends NamedImportFile>(draft: AdviceDraft<T>, id: string): AdviceDraft<T> {
  return change(draft, draft.sources.filter(s => s.id !== id));
}
export function setAdviceSourceSelected<T extends NamedImportFile>(draft: AdviceDraft<T>, id: string, selected: boolean): AdviceDraft<T> {
  return change(draft, draft.sources.map(s => s.id === id ? { ...s, selected } : s));
}
export function setAdviceSheetSelection<T extends NamedImportFile>(draft: AdviceDraft<T>, id: string, selection: AdviceSheetSelection[]): AdviceDraft<T> {
  return change(draft, draft.sources.map(s => {
    if (s.id !== id) return s;
    const profileChanged = selection.some(v => {const previous=s.sheetSelection?.find(old=>old.sheetName===v.sheetName);return v.profile!==(previous?.profile??s.requestedProfile) || v.direction!==previous?.direction || v.tensionColumn!==previous?.tensionColumn||JSON.stringify(v.table)!==JSON.stringify(previous?.table);});
    return { ...s,lastPreview:s.discovery.status==="ready"?s.discovery.preview:s.lastPreview, sheetSelection: selection.map(v => ({ ...v })),
      discovery: profileChanged || s.discovery.status === "analyzing" ? {status: "empty" as const} : s.discovery };
  }));
}
export function beginAdviceDiscovery<T extends NamedImportFile>(draft: AdviceDraft<T>, id: string, requestId: number): AdviceDraft<T> {
  return { ...draft, sources: draft.sources.map(s => s.id === id ? { ...s,lastPreview:s.discovery.status==="ready"?s.discovery.preview:s.lastPreview, discovery: { status: "analyzing", requestId } } : s) };
}
export function applyAdviceDiscovery<T extends NamedImportFile>(draft: AdviceDraft<T>, id: string, requestId: number, preview: AdviceSourcePreview): AdviceDraft<T> {
  const source = draft.sources.find(s => s.id === id);
  if (source?.discovery.status !== "analyzing" || source.discovery.requestId !== requestId) return draft;
  return change(draft, draft.sources.map(s => s.id === id ? { ...s,
    sheetSelection: (s.sheetSelection ?? (preview.suggestedSelection.length ? preview.suggestedSelection : preview.sheets.length === 1 ? [{sheetName:preview.sheets[0].sheetName,profile:s.requestedProfile}] : [])).map(v => ({ ...v,table:v.table??preview.sheets.find(sheet=>sheet.sheetName===v.sheetName)?.table?.settings })),
    discovery: { status: "ready", requestId, preview } } : s));
}
export function failAdviceDiscovery<T extends NamedImportFile>(draft: AdviceDraft<T>, id: string, requestId: number, message: string): AdviceDraft<T> {
  const source = draft.sources.find(s => s.id === id);
  if (source?.discovery.status !== "analyzing" || source.discovery.requestId !== requestId) return draft;
  return change(draft, draft.sources.map(s => s.id === id ? { ...s, discovery: { status: "failed", requestId, message } } : s));
}
export function applyAdvicePreview<T extends NamedImportFile>(draft: AdviceDraft<T>, generation: number, requestId: number, preview: ProjectImportPreview): AdviceDraft<T> {
  if (generation !== draft.generation || draft.previewState.status !== "analyzing" || draft.previewState.requestId !== requestId) return draft;
  return { ...draft, existingSources: preview.existingSources ?? draft.existingSources, previewState: { status: "ready", requestId, preview } };
}
export function selectedAdviceSources<T extends NamedImportFile>(draft: AdviceDraft<T>): AdviceSourceDraft<T>[] {
  return draft.sources.filter(s => s.selected && (s.file.name.toLowerCase().endsWith(".csv") || (s.sheetSelection?.length ?? 0) > 0));
}

export function replaceAdviceFile<T extends NamedImportFile>(draft: AdviceDraft<T>, id: string, file: T): AdviceDraft<T> {
  return change(draft, draft.sources.map(s => s.id === id ? {...s, file, sheetSelection:null, discovery:{status:"empty"}} : s));
}
export function setAdviceProfile<T extends NamedImportFile>(draft: AdviceDraft<T>, id: string, profile: ImportProfile): AdviceDraft<T> {
  return change(draft, draft.sources.map(s => s.id === id ? {...s, requestedProfile:profile, sheetSelection:null, discovery:{status:"empty"}} : s));
}
export function replaceStoredAdvice<T extends NamedImportFile>(draft: AdviceDraft<T>, id: string, file: T): AdviceDraft<T> {
  const existing = draft.sources.find(s => s.replacementId === id);
  if (existing) return replaceAdviceFile(draft, existing.id, file);
  const next = addAdviceSource(draft, `replacement:${id}`, file);
  return {...next, sources: next.sources.map(s => s.id === `replacement:${id}` ? {...s,replacementId:id} : s)};
}
