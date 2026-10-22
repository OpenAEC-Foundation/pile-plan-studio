import type { ImportSourceInput, ImportSourcePreview } from "../../core/coreImportContract.ts";
import type { ProjectImportPreview } from "../../core/adviceImportContract.ts";
import { applyAdviceDiscovery, applyAdvicePreview, beginAdviceDiscovery, failAdviceDiscovery } from "../../domain/imports/adviceImportModel.ts";
import type { ImportDrafts, ProjectImportMode } from "../../domain/imports/projectImportModel.ts";
import { prepareProjectImportSources, prepareAdviceSource } from "./projectImportRequest.ts";

type Dependencies = { readDrafts(): ImportDrafts<File>; update(fn: (drafts: ImportDrafts<File>) => ImportDrafts<File>): void;
  discoverSource(source: ImportSourceInput): Promise<ImportSourcePreview>;
  previewProject(mode: ProjectImportMode, sources: ImportSourceInput[]): Promise<ProjectImportPreview>;
  readMode(): ProjectImportMode; contextKey(): string };
export function createAdviceImportPreviewController(deps: Dependencies) {
  let serial = 0;
  let joint = 0;
  const discoveries = new Map<string, number>();
  async function discover(sourceId: string) {
    const source = deps.readDrafts().advice?.sources.find(s => s.id === sourceId);
    if (!source) return;
    const requestId = ++serial;
    discoveries.set(sourceId, requestId);
    const current = () => discoveries.get(sourceId) === requestId && deps.readDrafts().advice?.sources.some(s => s.id === sourceId && s.file === source.file && s.requestedProfile === source.requestedProfile);
    deps.update(d => d.advice ? { ...d, advice: beginAdviceDiscovery(d.advice, sourceId, requestId) } : d);
    try {
      const input = await prepareAdviceSource(source, true);
      if (!current()) return;
      const preview = await deps.discoverSource(input);
      if (!current()) return;
      if (preview.details?.kind !== "foundation-advice") throw new Error("Unsupported advice discovery response");
      const advice = preview.details.advice;
      deps.update(d => d.advice ? { ...d, advice: applyAdviceDiscovery(d.advice, sourceId, requestId, advice) } : d);
    } catch (error) {
      if (!current()) return;
      deps.update(d => d.advice ? { ...d, advice: failAdviceDiscovery(d.advice, sourceId, requestId, error instanceof Error ? error.message : String(error)) } : d);
    }
  }
  async function preview() {
    const drafts = deps.readDrafts(), advice = drafts.advice;
    if (!advice) return;
    const mode = deps.readMode();
    if (mode === "new-project" && (!drafts["load-points"].file || !drafts.cpts.file)) {
      joint = ++serial;
      deps.update(d => d.advice && d.advice.previewState.status !== "empty"
        ? { ...d, advice: { ...d.advice, previewState: { status: "empty" } } } : d);
      return;
    }
    if (advice.sources.some(s => s.selected && s.discovery.status !== "ready")) return;
    const requestId = ++serial; joint = requestId;
    const context = deps.contextKey(), generation = advice.generation;
    const current = () => joint === requestId && context === deps.contextKey() && mode === deps.readMode()
      && generation === deps.readDrafts().advice?.generation
      && drafts["load-points"] === deps.readDrafts()["load-points"] && drafts.cpts === deps.readDrafts().cpts;
    deps.update(d => d.advice ? { ...d, advice: { ...d.advice, previewState: { status: "analyzing", requestId } } } : d);
    try {
      const sources = await prepareProjectImportSources(drafts, mode);
      if (!current()) return;
      const result = await deps.previewProject(mode, sources);
      if (!current()) return;
      deps.update(d => d.advice ? { ...d, advice: applyAdvicePreview(d.advice, generation, requestId, result) } : d);
    } catch (error) {
      if (!current()) return;
      deps.update(d => d.advice ? { ...d, advice: { ...d.advice, previewState: { status: "failed", requestId,
        message: error instanceof Error ? error.message : String(error) } } } : d);
    }
  }
  return { discover, preview, invalidate() { joint = ++serial; discoveries.clear(); } };
}
