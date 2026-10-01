import {
  importProjectFromFilesCore, previewImportSourceCore, readProjectDocumentCore,
  refreshProjectFromFilesCore, writeProjectDocumentCore,
} from "../../core/projectCoreClient.ts";
import { getImportSummary } from "../../core/projectFile.ts";
import { ProjectDocumentReadError, type ProjectDocumentOutcome } from "../../core/projectDocumentContract.ts";
import type { PileCostSettings } from "../../core/projectTypes.ts";
import { createInitialProjectState, type ProjectState } from "../../domain/project/projectState.ts";
import { prepareMergedPileCostCatalogEdit } from "../project/projectEditOperations.ts";
import { projectDraftFromState } from "../project/projectLifecycleController.ts";
import { McpReadError } from "./readModel.ts";
import type { ProjectMarkerValue } from "./projectMarker.ts";
import { createSourceImportSession, SourceImportValidationError } from "./sourceImportSession.ts";
import { summarizeImportReconciliation } from "./sourceImportSummary.ts";

type Dependencies = {
  requirements: () => Promise<unknown>;
  currentState: () => ProjectState;
  currentMarker: () => ProjectMarkerValue;
  canEdit: () => boolean;
  isDirty: () => boolean;
  defaultPlanName: () => string;
  personalCostDefault: () => PileCostSettings | null;
  builtInCostDefault: PileCostSettings;
  installRefresh: (state: ProjectState) => void;
  installNewProject: (state: ProjectState) => void;
};

const coreClients = {
  previewSource: previewImportSourceCore,
  readProject: readProjectDocumentCore,
  writeProject: writeProjectDocumentCore,
  refreshProject: refreshProjectFromFilesCore,
  importProject: importProjectFromFilesCore,
  prepareCosts: prepareMergedPileCostCatalogEdit,
};

/** Source imports reuse Rust clients; the session owns atomic history and replacement callbacks. */
export function createSourceImportOperations(
  dependencies: Dependencies, clients: Partial<typeof coreClients> = {},
): Pick<Parameters<typeof createSourceImportSession>[0], "requirements" | "validate" | "apply"> {
  const core = { ...coreClients, ...clients };
  function requireCurrent(marker: ProjectMarkerValue) {
    const current = dependencies.currentMarker();
    if (current.project_instance_id !== marker.project_instance_id
      || current.project_revision !== marker.project_revision) throw new McpReadError("project_changed");
  }
  function requireApply(marker: ProjectMarkerValue, replacing: boolean) {
    if (!dependencies.canEdit()) throw new McpReadError("write_access_disabled");
    requireCurrent(marker);
    if (replacing && dependencies.isDirty()) throw new McpReadError("unsaved_project_changes");
  }
  return {
    requirements: dependencies.requirements,
    async validate({ mode, projectName, pileHeadLevelM, currencyCode, sources, marker }) {
      requireCurrent(marker);
      const previews = await Promise.all(sources.map(core.previewSource));
      const sourceErrors = previews.flatMap((preview) => preview.diagnostics
        .filter((diagnostic) => diagnostic.severity === "error"));
      if (sourceErrors.length) throw new SourceImportValidationError(
        "One or more CSV sources contain invalid rows; inspect diagnostics and restage the affected role.", sourceErrors);
      let before = null;
      if (mode === "refresh") {
        const document = await core.readProject(await core.writeProject(projectDraftFromState(dependencies.currentState())));
        if (document.status === "invalid") throw new ProjectDocumentReadError(document.error);
        before = document.project;
      }
      const outcome = mode === "refresh"
        ? await core.refreshProject({ currentProject: before!, sources })
        : await core.importProject({ projectName: projectName!, pileHeadLevelM: pileHeadLevelM!,
          currencyCode: currencyCode!, sources });
      requireCurrent(marker);
      const summary = getImportSummary(outcome.project);
      return { outcome, data: {
        project_name: outcome.project.metadata.name,
        load_point_count: summary.loadPointCount, cpt_count: summary.cptCount,
        bearing_capacity_count: summary.bearingCapacityCount, warnings: summary.warnings.slice(0, 100),
        warning_count: summary.warnings.length,
        source_counts: previews.map((preview) => ({ role: preview.role, item_count: preview.itemCount,
          warning_count: preview.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length })),
        pile_plan_count: (outcome.project.user_state.pile_plans ?? []).length,
        ...(before ? { reconciliation: summarizeImportReconciliation(before, outcome.project) } : {}),
      } };
    },
    async apply({ mode, validated, marker }) {
      const replacing = mode === "new_project";
      requireApply(marker, replacing);
      const imported = validated.outcome as Extract<ProjectDocumentOutcome, { status: "valid" }>;
      const state = createInitialProjectState(imported.project, {
        initializeDefaultPiles: true,
        ...(replacing ? { defaultPilePlanName: dependencies.defaultPlanName() } : {}),
      }, imported.keys);
      if (replacing) {
        const costs = await core.prepareCosts(state, dependencies.personalCostDefault(), dependencies.builtInCostDefault);
        requireApply(marker, true);
        dependencies.installNewProject(costs.update(state));
      } else {
        dependencies.installRefresh(state);
      }
      return { applied: true, mode, ...dependencies.currentMarker() };
    },
  };
}
