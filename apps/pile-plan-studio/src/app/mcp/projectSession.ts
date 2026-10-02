import { assessLoadPointGroupAssignmentsCore, calculatePileCostCore } from "../../core/coreClient.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import type { HistoryAction } from "../../domain/project/history/historyAction.ts";
import { getLoadPointGroupEditHistoryAction } from "../session/appSessionSupport.ts";
import type { McpSession } from "./connectionController.ts";
import type { McpSnapshot } from "./protocol.ts";
import { createSessionMcpDispatcher } from "./sessionDispatcher.ts";
import { createSourceImportSession } from "./sourceImportSession.ts";
import { createSourceImportOperations } from "./sourceImportOperations.ts";
import { createMcpFileOperationSession } from "./fileOperationSession.ts";
import { createMcpProjectFileOperations } from "./projectFileOperations.ts";
import { createPilePlanImportSession } from "./pilePlanImportSession.ts";
import { createPilePlanImportOperations } from "./pilePlanImportOperations.ts";
import { requireCurrentGroups } from "./projectSettingsSources.ts";

type SourceBindings = Parameters<typeof createSourceImportOperations>[0];
type FileBindings = Parameters<typeof createMcpProjectFileOperations>[0];
type DispatcherBindings = Parameters<typeof createSessionMcpDispatcher>[0];
type ProjectUpdate = (state: ProjectState) => ProjectState;

export type ProjectMcpSessionDependencies = Pick<DispatcherBindings,
  "currentState" | "currentMarker" | "canWrite" | "language" | "defaultTimeLimit" | "optimization"
> & Pick<SourceBindings,
  "isDirty" | "personalCostDefault" | "builtInCostDefault" | "installRefresh" | "installNewProject"
> & Pick<FileBindings, "currentPath" | "confirmReplacement" | "installOpened" | "didSave"> & {
  derivedState: () => Pick<McpSnapshot,
    "analysisReady" | "groups" | "technicalAssignment" | "groupAssignmentAssessment" | "currentOptimization"
  >;
  sourceImportRequirements: SourceBindings["requirements"];
  pilePlanImportRequirements: Parameters<typeof createPilePlanImportOperations>[0]["requirements"];
  navigate: (update: ProjectUpdate) => void;
  commit: (update: ProjectUpdate, action?: HistoryAction) => void;
};

/** Compose one connection's transactions against live getters; the session owns atomic installation. */
export function createProjectMcpSession(
  dependencies: ProjectMcpSessionDependencies, isActive: () => boolean,
): McpSession {
  const access = {
    currentState: dependencies.currentState,
    currentMarker: dependencies.currentMarker,
    canEdit: () => isActive() && dependencies.canWrite(),
  };
  const sourceImport = createSourceImportSession(createSourceImportOperations({
    ...access,
    requirements: dependencies.sourceImportRequirements,
    isDirty: dependencies.isDirty,
    defaultPlanName: () => dependencies.language() === "nl" ? "Basisplan" : "Base plan",
    personalCostDefault: dependencies.personalCostDefault,
    builtInCostDefault: dependencies.builtInCostDefault,
    installRefresh: dependencies.installRefresh,
    installNewProject: dependencies.installNewProject,
  }));
  const files = createMcpFileOperationSession(createMcpProjectFileOperations({
    ...access,
    currentPath: dependencies.currentPath,
    confirmReplacement: dependencies.confirmReplacement,
    installOpened: dependencies.installOpened,
    didSave: dependencies.didSave,
  }));
  const pilePlanImport = createPilePlanImportSession(createPilePlanImportOperations({
    ...access,
    requirements: dependencies.pilePlanImportRequirements,
    currentGroups: () => requireCurrentGroups(dependencies.derivedState().groups),
    commit: dependencies.commit,
  }));
  const dispatch = createSessionMcpDispatcher({
    snapshot: (): McpSnapshot => {
      const state = dependencies.currentState();
      const marker = dependencies.currentMarker();
      return {
        state, marker,
        defaultOptimizationTimeLimitSeconds: dependencies.defaultTimeLimit(),
        ...dependencies.derivedState(),
        calculateCost: calculatePileCostCore,
        assessGroupAssignments: assessLoadPointGroupAssignmentsCore,
        isCurrent: () => {
          const current = dependencies.currentMarker();
          return current.project_instance_id === marker.project_instance_id
            && current.project_revision === marker.project_revision;
        },
      };
    },
    currentState: dependencies.currentState,
    currentMarker: dependencies.currentMarker,
    canWrite: dependencies.canWrite,
    isActive,
    language: dependencies.language,
    defaultTimeLimit: dependencies.defaultTimeLimit,
    optimization: dependencies.optimization,
    sourceImport, pilePlanImport, files,
    install: (update, mode, name) => {
      if (mode === "navigation") {
        dependencies.navigate(update);
      } else {
        const action = name === "pile_group_load_points"
          ? getLoadPointGroupEditHistoryAction("group")
          : name === "pile_ungroup_load_points" ? getLoadPointGroupEditHistoryAction("ungroup") : undefined;
        dependencies.commit(update, action);
      }
    },
  });
  return {
    dispatch,
    dispose: () => {
      sourceImport.dispose();
      files.invalidate();
      pilePlanImport.dispose();
    },
  };
}
