import type { ImportSourceInput } from "../../core/coreImportContract.ts";
import type { IfcppProject, ImportSummary } from "../../core/projectFile.ts";
import { getImportSummary } from "../../core/projectFile.ts";
import type { ProjectDocumentOutcome } from "../../core/projectDocumentContract.ts";

type ValidProject = Extract<ProjectDocumentOutcome, {status:"valid"}>;
type RefreshDependencies = {
  context(): string;
  snapshot(): Promise<IfcppProject>;
  refresh(input: {currentProject:IfcppProject;sources:ImportSourceInput[]}): Promise<ValidProject>;
  install(result:ValidProject): void;
  changed(): Error;
};

// A preview never calls this operation. Install only the complete validated result,
// after checking that the project still matches the captured context.
export async function applyProjectRefresh(deps:RefreshDependencies,sources:ImportSourceInput[]):Promise<ImportSummary> {
  const context=deps.context();
  const currentProject=await deps.snapshot();
  if(context!==deps.context()) throw deps.changed();
  const refreshed=await deps.refresh({currentProject,sources});
  if(context!==deps.context()) throw deps.changed();
  deps.install(refreshed);
  return getImportSummary(refreshed.project);
}
