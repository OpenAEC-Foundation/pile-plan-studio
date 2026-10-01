import { previewPilePlanImportCore } from "../../core/pilePlanCoreClient.ts";
import { applyLoadPointGroupAssignmentBatchCore } from "../../core/coreClient.ts";
import { samePileConfiguration } from "../../core/pileConfigurationKey.ts";
import { getAvailablePileConfigurationCatalog } from "../../domain/pile-plans/optimization/optimizationCandidates.ts";
import { getActiveLockedLoadPointIds } from "../../domain/pile-plans/loadPointLocking.ts";
import { applyPilePlanImportAsNewPlan } from "../../domain/pile-plans/pilePlanImport.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { projectStateSignature } from "../project/projectLifecycleController.ts";
import type { ProjectMarkerValue } from "./projectMarker.ts";
import type { requireCurrentGroups } from "./projectSettingsSources.ts";
import type { createPilePlanImportSession } from "./pilePlanImportSession.ts";
import { McpReadError } from "./readModel.ts";

type Dependencies = {
  requirements: () => Promise<Record<string, unknown>>;
  currentState: () => ProjectState;
  currentMarker: () => ProjectMarkerValue;
  canEdit: () => boolean;
  currentGroups: () => ReturnType<typeof requireCurrentGroups>;
  commit: (update: (current: ProjectState) => ProjectState) => void;
};
const coreClients = { preview: previewPilePlanImportCore, applyBatch: applyLoadPointGroupAssignmentBatchCore };

/** Reuse Rust preview and group/lock validation before one atomic session commit. */
export function createPilePlanImportOperations(
  dependencies: Dependencies, core: Partial<typeof coreClients> = {},
): Pick<Parameters<typeof createPilePlanImportSession>[0], "requirements" | "validate" | "apply"> {
  const clients = { ...coreClients, ...core };
  return {
    requirements: dependencies.requirements,
    validate: async ({ bytes, fileName, options, marker }) => {
      const before = dependencies.currentMarker();
      if (before.project_instance_id !== marker.project_instance_id
        || before.project_revision !== marker.project_revision) throw new McpReadError("project_changed");
      const state = dependencies.currentState();
      const preview = await clients.preview({ fileName, format: "csv", bytes,
        profile: "standard-table", options, loadPoints: state.loadPoints, cpts: state.cpts,
        availablePileConfigurations: getAvailablePileConfigurationCatalog(state.pileOptionsByLoadPointId) });
      const after = dependencies.currentMarker();
      if (after.project_instance_id !== marker.project_instance_id
        || after.project_revision !== marker.project_revision) throw new McpReadError("project_changed");
      return preview;
    },
    apply: async ({ preview, planName, marker }) => {
      if (!dependencies.canEdit()) {
        throw new McpReadError("write_access_disabled");
      }
      const currentMarker = dependencies.currentMarker();
      if (currentMarker.project_instance_id !== marker.project_instance_id
        || currentMarker.project_revision !== marker.project_revision) throw new McpReadError("project_changed");
      const before = dependencies.currentState();
      const pileChanges = preview.patch.changes.flatMap((change) => change.pile.action === "preserve" ? [] : [{
        load_point_id: change.load_point_id,
        configuration: change.pile.action === "set" ? change.pile.value : null,
      }]);
      if (pileChanges.length > 0) {
        const result = await clients.applyBatch({ changes: pileChanges,
          groups: dependencies.currentGroups(),
          currentAssignments: before.selectedPileConfigurationsByLoadPoint,
          lockedLoadPointIds: getActiveLockedLoadPointIds(before.pilePlans, before.activePilePlanId) });
        if (result.status === "blocked") throw new McpReadError(result.reason, result.load_point_ids);
        const requested = new Map(pileChanges.map((change) => [change.load_point_id, change.configuration]));
        if (result.changes.some((change) => !requested.has(change.load_point_id)
          || !samePileConfiguration(requested.get(change.load_point_id) ?? undefined,
            change.configuration ?? undefined))) {
          throw new McpReadError("group_assignment_expansion_required");
        }
      }
      const beforeSignature = projectStateSignature(before);
      const next = applyPilePlanImportAsNewPlan(before, preview.patch, planName);
      if (!dependencies.canEdit()) {
        throw new McpReadError("write_access_disabled");
      }
      const latestMarker = dependencies.currentMarker();
      if (latestMarker.project_instance_id !== marker.project_instance_id
        || latestMarker.project_revision !== marker.project_revision) throw new McpReadError("project_changed");
      dependencies.commit((current) =>
        projectStateSignature(current) === beforeSignature ? next : current);
      if (projectStateSignature(dependencies.currentState()) !== projectStateSignature(next)) {
        throw new McpReadError("project_changed");
      }
      return { plan_id: next.activePilePlanId, plan_name: next.pilePlans[next.pilePlans.length - 1]?.name,
        matched_rows: preview.summary.matchedRows, skipped_rows: preview.summary.skippedRows,
        conflicts: preview.summary.conflicts };
    },
  };
}
