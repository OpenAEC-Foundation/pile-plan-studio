import initWasm, {
  import_project_from_files,
  preview_import_file,
  read_project_document,
  refresh_project_from_files,
  write_project_document,
} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { toWasmNumberKeyedRecord } from "./coreSerialization.ts";
import type { IfcppProject } from "./projectFile.ts";
import {
  fromCoreImportSourcePreview,
  toCoreImportSource,
  type ImportSourceInput,
  type ImportSourcePreview,
} from "./coreImportContract.ts";
import {
  projectDocumentErrorFromUnknown,
  projectDocumentOutcomeFromCore,
  toBrowserProjectDocumentDraft,
  toDesktopProjectDocumentDraft,
  type CoreValidatedProjectDocument,
  type ProjectDocumentDraft,
  type ProjectDocumentOutcome,
} from "./projectDocumentContract.ts";
import { initializeWasm, invokeDesktop, isTauriRuntime } from "./coreTransport.ts";

async function ensureWasm(): Promise<void> {
  return initializeWasm(() => initWasm());
}

export async function importProjectFromFilesCore(input: {
  projectName: string;
  pileHeadLevelM: number;
  currencyCode: string;
  sources: ImportSourceInput[];
}): Promise<Extract<ProjectDocumentOutcome, { status: "valid" }>> {
  const request = {
    project_name: input.projectName,
    pile_head_level_m: input.pileHeadLevelM,
    currency_code: input.currencyCode,
    sources: input.sources.map(toCoreImportSource),
  };
  if (!isTauriRuntime()) {
    await ensureWasm();
    return validProjectDocumentFromCore(
      import_project_from_files(request) as CoreValidatedProjectDocument,
    );
  }
  return validProjectDocumentFromCore(
    await invokeDesktop<CoreValidatedProjectDocument>("import_project_from_files", { request }),
  );
}

export async function refreshProjectFromFilesCore(input: {
  currentProject: IfcppProject;
  sources: ImportSourceInput[];
}): Promise<Extract<ProjectDocumentOutcome, { status: "valid" }>> {
  const sources = input.sources.map(toCoreImportSource);
  if (!isTauriRuntime()) {
    await ensureWasm();
    return validProjectDocumentFromCore(
      refresh_project_from_files({
        current_project: toWasmIfcppProject(input.currentProject),
        sources,
      }) as CoreValidatedProjectDocument,
    );
  }
  return validProjectDocumentFromCore(
    await invokeDesktop<CoreValidatedProjectDocument>("refresh_project_from_files", {
      request: { current_project: input.currentProject, sources },
    }),
  );
}

export async function readProjectDocumentCore(contents: string): Promise<ProjectDocumentOutcome> {
  try {
    let result: CoreValidatedProjectDocument;
    if (!isTauriRuntime()) {
      await ensureWasm();
      result = read_project_document({ contents }) as CoreValidatedProjectDocument;
    } else {
      result = await invokeDesktop<CoreValidatedProjectDocument>("read_project_document", {
        request: { contents },
      });
    }
    return projectDocumentOutcomeFromCore({ status: "valid", ...result });
  } catch (error) {
    const projectError = projectDocumentErrorFromUnknown(error);
    if (!projectError) throw error;
    return { status: "invalid", error: projectError };
  }
}

export async function writeProjectDocumentCore(draft: ProjectDocumentDraft): Promise<string> {
  try {
    if (!isTauriRuntime()) {
      await ensureWasm();
      return write_project_document({ draft: toBrowserProjectDocumentDraft(draft) });
    }
    return await invokeDesktop<string>("write_project_document", {
      request: { draft: toDesktopProjectDocumentDraft(draft) },
    });
  } catch (error) {
    const projectError = projectDocumentErrorFromUnknown(error);
    if (!projectError) throw error;
    throw projectError;
  }
}

export async function previewImportSourceCore(source: ImportSourceInput): Promise<ImportSourcePreview> {
  const request = { source: toCoreImportSource(source) };
  if (!isTauriRuntime()) {
    await ensureWasm();
    return fromCoreImportSourcePreview(preview_import_file(request));
  }
  return fromCoreImportSourcePreview(await invokeDesktop("preview_import_file", { request }));
}

function validProjectDocumentFromCore(
  result: CoreValidatedProjectDocument,
): Extract<ProjectDocumentOutcome, { status: "valid" }> {
  const outcome = projectDocumentOutcomeFromCore({ status: "valid", ...result });
  if (outcome.status !== "valid") {
    throw new Error("A validated project unexpectedly produced an invalid document outcome.");
  }
  return outcome;
}

function toWasmIfcppProject(project: IfcppProject) {
  const userState = project.schema_version >= 2
    ? {
        pile_plans: (project.user_state.pile_plans ?? []).map((plan) => ({
          ...plan,
          selected_piles: toWasmNumberKeyedRecord(plan.selected_piles),
          optimization_unassigned: toWasmNumberKeyedRecord(plan.optimization_unassigned ?? {}),
        })),
        active_pile_plan_id: project.user_state.active_pile_plan_id,
        manual_cpt_selections: toWasmNumberKeyedRecord(project.user_state.manual_cpt_selections),
      }
    : {
        selected_piles: toWasmNumberKeyedRecord(project.user_state.selected_piles ?? {}),
        manual_cpt_selections: toWasmNumberKeyedRecord(project.user_state.manual_cpt_selections),
      };

  return {
    ...project,
    settings: {
      ...project.settings,
      cpt_selection_by_load_point: toWasmNumberKeyedRecord(
        project.settings.cpt_selection_by_load_point,
      ),
    },
    user_state: userState,
  };
}
