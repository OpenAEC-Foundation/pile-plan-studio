import type { PileConfigurationKey } from "../../core/projectTypes.ts";
import type { ApplyLoadPointGroupAssignmentResult, LoadPointGroupAssignmentInput } from "../../core/loadPointGroupContract.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { getActiveLockedLoadPointIds } from "../../domain/pile-plans/loadPointLocking.ts";
import { synchronizeActivePilePlan } from "../../domain/pile-plans/pilePlanManagement.ts";
import { getLoadPointLockSignature } from "../session/appSessionSupport.ts";

export type PileAssignmentDependencies = {
  currentState: () => ProjectState;
  currentGroups: () => LoadPointGroupAssignmentInput["groups"];
  groupsReady: () => boolean;
  evaluate: (input: LoadPointGroupAssignmentInput) => Promise<ApplyLoadPointGroupAssignmentResult>;
  commit: (update: (state: ProjectState) => ProjectState) => void;
  setPending: (pending: boolean) => void;
  blocked: (names: string[]) => void;
  failed: (message: string) => void;
};

/** Apply only Rust-validated assignments, while the captured plan, groups and locks remain current. */
export function createPileAssignmentController(dependencies: PileAssignmentDependencies) {
  let generation = 0;
  return {
    invalidate() {
      generation++;
      dependencies.setPending(false);
    },
    async apply(selectedLoadPointIds: number[], requestedConfiguration: PileConfigurationKey | null): Promise<void> {
      if (!dependencies.groupsReady() || selectedLoadPointIds.length === 0) return;
      const requestId = ++generation;
      const captured = dependencies.currentState();
      const capturedGroups = dependencies.currentGroups();
      const capturedLockSignature = getLoadPointLockSignature(captured.pilePlans, captured.activePilePlanId);
      function isCurrent(state: ProjectState): boolean {
        return requestId === generation
          && state.activePilePlanId === captured.activePilePlanId
          && state.selectedPileConfigurationsByLoadPoint === captured.selectedPileConfigurationsByLoadPoint
          && dependencies.currentGroups() === capturedGroups
          && getLoadPointLockSignature(state.pilePlans, captured.activePilePlanId) === capturedLockSignature;
      }
      dependencies.setPending(true);
      try {
        const result = await dependencies.evaluate({
          selectedLoadPointIds,
          requestedConfiguration,
          groups: capturedGroups,
          currentAssignments: captured.selectedPileConfigurationsByLoadPoint,
          lockedLoadPointIds: getActiveLockedLoadPointIds(captured.pilePlans, captured.activePilePlanId),
        });
        if (!isCurrent(dependencies.currentState())) return;
        if (result.status === "blocked") {
          dependencies.blocked(result.blocking_locked_load_points.map(({ load_point_id }) =>
            captured.loadPoints.find(({ id }) => id === load_point_id)?.name ?? String(load_point_id)));
          return;
        }
        if (result.changes.length === 0) return;
        dependencies.commit((current) => {
          if (!isCurrent(current)) return current;
          const nextAssignments = new Map(captured.selectedPileConfigurationsByLoadPoint);
          for (const change of result.changes) {
            if (change.configuration) {
              nextAssignments.set(change.load_point_id, { ...change.configuration });
            } else {
              nextAssignments.delete(change.load_point_id);
            }
          }
          return {
            ...current,
            selectedPileConfigurationsByLoadPoint: nextAssignments,
            pilePlans: synchronizeActivePilePlan(current.pilePlans, captured.activePilePlanId, nextAssignments),
          };
        });
      } catch (error) {
        if (requestId === generation) dependencies.failed(error instanceof Error ? error.message : String(error));
      } finally {
        if (requestId === generation) dependencies.setPending(false);
      }
    },
  };
}
