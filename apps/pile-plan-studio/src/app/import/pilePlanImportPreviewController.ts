import { getImportFileFormat } from "../../core/importFiles.ts";
import type { PilePlanImportPreview, PilePlanImportRequest } from "../../core/pilePlanImportContract.ts";
import { applyPilePlanImportPreview, beginPilePlanImportPreview, failPilePlanImportPreview,
  pilePlanImportTolerance, type PilePlanImportDraft } from "../../domain/imports/pilePlanImportModel.ts";

export type PilePlanImportContext = Pick<PilePlanImportRequest, "loadPoints" | "cpts" | "availablePileConfigurations">;
type Dependencies = {
  evaluate: (request: PilePlanImportRequest) => Promise<PilePlanImportPreview>;
  currentContext: () => PilePlanImportContext;
  update: (update: (draft: PilePlanImportDraft<File>) => PilePlanImportDraft<File>) => void;
};

export function createPilePlanImportPreviewController(dependencies: Dependencies) {
  let nextRequestId = 0;

  async function preview(next: PilePlanImportDraft<File>) {
    const requestId = ++nextRequestId;
    const context = dependencies.currentContext();
    const current = () => {
      const now = dependencies.currentContext();
      return requestId === nextRequestId && now.loadPoints === context.loadPoints
        && now.cpts === context.cpts && now.availablePileConfigurations === context.availablePileConfigurations;
    };
    const tolerance = pilePlanImportTolerance(next);
    const file = next.file;
    const format = file ? getImportFileFormat(file.name) : null;
    if (!file || !format || tolerance === null || (!next.importPileAssignments && !next.importCptSelections)) {
      dependencies.update(draft => current() ? next : draft);
      return;
    }
    dependencies.update(draft => current() ? beginPilePlanImportPreview(next, requestId) : draft);
    const options = { importPileAssignments: next.importPileAssignments,
      importCptSelections: next.importCptSelections, coordinateToleranceMm: tolerance };
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!current()) return;
      const result = await dependencies.evaluate({ fileName: file.name, format, bytes,
        profile: next.requestedProfile, options, ...context });
      if (!current()) return;
      dependencies.update(draft => current() ? applyPilePlanImportPreview(draft, requestId, result) : draft);
    } catch (reason) {
      if (!current()) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      dependencies.update(draft => current() ? failPilePlanImportPreview(draft, requestId, message) : draft);
    }
  }

  return { preview, invalidate: () => { nextRequestId += 1; } };
}
