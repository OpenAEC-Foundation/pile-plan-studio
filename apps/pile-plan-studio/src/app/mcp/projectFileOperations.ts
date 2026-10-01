import { exportPilePlanCsvCore, exportPilePlanXlsxCore, readProjectDocumentCore, writeProjectDocumentCore } from "../../core/coreClient.ts";
import { invokeDesktop } from "../../core/coreTransport.ts";
import { prepareOpenedProject } from "../../domain/project/openedProject.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { projectFileName, pilePlanExportFileName } from "../../domain/project/projectPersistence.ts";
import { buildPilePlanExportInputForPlan } from "../../domain/pile-plans/pilePlanExport.ts";
import { projectDraftFromState } from "../project/projectLifecycleController.ts";
import { runProjectFileOperation } from "../project/projectFileOperations.ts";
import type { createMcpFileOperationSession } from "./fileOperationSession.ts";
import type { ProjectMarkerValue } from "./projectMarker.ts";
import { McpReadError } from "./readModel.ts";

type Dependencies = {
  currentState: () => ProjectState;
  currentMarker: () => ProjectMarkerValue;
  currentPath: () => string | null;
  canEdit: () => boolean;
  confirmReplacement: () => Promise<boolean>;
  installOpened: (state: ProjectState, path: string) => void;
  didSave: (path: string) => void;
};
const clients = {
  async chooseOpen(): Promise<string | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, filters: [{ name: "IFCPP project", extensions: ["ifcpp"] }] });
    return typeof path === "string" ? path : null;
  },
  async chooseSave(suggestedPath: string): Promise<string | null> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    return save({ defaultPath: suggestedPath, filters: [{ name: "IFCPP project", extensions: ["ifcpp"] }] });
  },
  async chooseExport(suggestedName: string, format: "csv" | "xlsx"): Promise<string | null> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    return save({ defaultPath: suggestedName, filters: [{ name: suggestedName, extensions: [format] }] });
  },
  readFile: (path: string) => invokeDesktop<string>("read_project_file", { path }),
  writeFile: (path: string, contents: string) => invokeDesktop<void>("write_project_file", { path, contents }),
  writeExport: (path: string, bytes: Uint8Array) => invokeDesktop<void>("write_binary_file", { path, contents: [...bytes] }),
  readDocument: readProjectDocumentCore,
  serialize: writeProjectDocumentCore,
  exportCsv: exportPilePlanCsvCore,
  exportXlsx: exportPilePlanXlsxCore,
};

/** Desktop file I/O uses the shared lifecycle runner; session callbacks install or mark saved content. */
export function createMcpProjectFileOperations(
  dependencies: Dependencies, overrides: Partial<typeof clients> = {},
): Pick<Parameters<typeof createMcpFileOperationSession>[0], "run"> {
  const io = { ...clients, ...overrides };
  return {
    run: (request, marker, isValid) => runProjectFileOperation(request, marker,
      () => isValid() && dependencies.canEdit(), {
        currentMarker: dependencies.currentMarker,
        currentPath: dependencies.currentPath,
        chooseOpen: io.chooseOpen,
        chooseSave: io.chooseSave,
        suggestedName: () => projectFileName(dependencies.currentState().name),
        openProject: async (path, isCurrent) => {
          if (!await dependencies.confirmReplacement()) return false;
          if (!isCurrent()) throw new McpReadError("project_changed");
          const contents = await io.readFile(path);
          const state = await prepareOpenedProject(contents, { initializeDefaultPiles: false },
            { readProjectDocument: io.readDocument });
          if (!isCurrent()) throw new McpReadError("project_changed");
          dependencies.installOpened(state, path);
          return true;
        },
        serialize: () => io.serialize(projectDraftFromState(dependencies.currentState())),
        writeProject: io.writeFile,
        didSave: dependencies.didSave,
        exportPlan: async (planId, format) => {
          const state = dependencies.currentState();
          const plan = state.pilePlans.find((candidate) => candidate.id === planId);
          if (!plan) throw new McpReadError("unknown_plan");
          const input = buildPilePlanExportInputForPlan(state, planId);
          const bytes = format === "csv" ? await io.exportCsv(input) : await io.exportXlsx(input);
          return { basename: pilePlanExportFileName(plan.name, format), bytes };
        },
        chooseExport: io.chooseExport,
        writeExport: io.writeExport,
      }),
  };
}
