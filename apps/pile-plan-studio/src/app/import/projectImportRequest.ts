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
  const roles: ImportFileRole[] = ["load-points", "cpts", "bearing-capacities"];
  const sources = await Promise.all(roles.filter(role => drafts[role].file).map(async role => {
    const draft = drafts[role];
    const file = draft.file!;
    const format = getImportFileFormat(file.name);
    if (!format) throw new Error(`Unsupported file format: ${file.name}`);
    return {
      role, profile: draft.requestedProfile, profileOptions: draft.profileOptions,
      fileName: file.name, format, bytes: new Uint8Array(await file.arrayBuffer()),
    };
  }));
  return {
    mode,
    projectName: mode === "new-project" ? projectName.trim() || "Imported Project" : null,
    sources,
    properties: mode === "new-project" && pileHeadLevelM !== null
      ? { pileHeadLevelM, currencyCode } : null,
  };
}
