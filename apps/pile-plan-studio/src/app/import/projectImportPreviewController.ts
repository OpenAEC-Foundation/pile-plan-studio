import type { ImportProfile, ImportProfileOptions, ImportSourceInput, ImportSourcePreview } from "../../core/coreImportContract.ts";
import { getImportFileFormat, type ImportFileRole } from "../../core/importFiles.ts";
import { applyImportPreview, beginImportPreview, failImportPreview,
  type ImportDrafts } from "../../components/domain/imports/projectImportModel.ts";

type Dependencies = {
  evaluate: (source: ImportSourceInput) => Promise<ImportSourcePreview>;
  update: (update: (drafts: ImportDrafts<File>) => ImportDrafts<File>) => void;
};

export function createProjectImportPreviewController(dependencies: Dependencies) {
  let nextRequestId = 0;
  const requests = new Map<ImportFileRole, number>();

  async function preview(role: ImportFileRole, file: File, profile: ImportProfile, options: ImportProfileOptions) {
    const format = getImportFileFormat(file.name);
    if (!format) return;
    const requestId = ++nextRequestId;
    requests.set(role, requestId);
    const current = () => requests.get(role) === requestId;
    const profileOptions = { ...options };
    dependencies.update(drafts => current() ? beginImportPreview(drafts, role, requestId) : drafts);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!current()) return;
      const result = await dependencies.evaluate({ role, profile, profileOptions, fileName: file.name, format, bytes });
      if (!current()) return;
      dependencies.update(drafts => current() ? applyImportPreview(drafts, role, requestId, result) : drafts);
    } catch (reason) {
      if (!current()) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      dependencies.update(drafts => current() ? failImportPreview(drafts, role, requestId, message) : drafts);
    }
  }

  return { preview, invalidate: () => requests.clear() };
}
