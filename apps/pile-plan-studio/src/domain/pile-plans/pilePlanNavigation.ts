import type { ProjectState } from "../project/projectState.ts";
import { getActiveLockedLoadPointIds } from "./loadPointLocking.ts";
import { switchPilePlan } from "./pilePlanManagement.ts";

export function activatePilePlanState(current: ProjectState, pilePlanId: string): ProjectState {
  if (pilePlanId === current.activePilePlanId) return current;
  const transition = switchPilePlan({ ...current, targetPilePlanId: pilePlanId });
  const locked = new Set(getActiveLockedLoadPointIds(transition.pilePlans, transition.activePilePlanId));
  const selectedLoadPointIds = current.selectedLoadPointIds.filter((id) => !locked.has(id));
  return {
    ...current,
    ...transition,
    loadPointLockDraft: null,
    loadPointLockSelectionSnapshot: null,
    cptSelectionEditDraft: null,
    cptSelectionPreview: null,
    selectedLoadPointIds,
    selectedLoadPointId: selectedLoadPointIds.includes(current.selectedLoadPointId ?? -1)
      ? current.selectedLoadPointId
      : selectedLoadPointIds[0] ?? null,
    selectedCptId: null,
  };
}
