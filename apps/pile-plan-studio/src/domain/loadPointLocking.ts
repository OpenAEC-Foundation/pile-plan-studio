import type { PilePlanData } from "../core/projectFile.ts";

export type LoadPointLockDraft = Set<number>;

export function startLoadPointLockDraft(
  pilePlans: PilePlanData[],
  activePilePlanId: string,
  selectedLoadPointIds: number[] = [],
): LoadPointLockDraft {
  const active = pilePlans.find((plan) => plan.id === activePilePlanId);
  return new Set([...(active?.lockedLoadPointIds ?? []), ...selectedLoadPointIds]);
}

export function toggleLoadPointLock(
  draft: LoadPointLockDraft,
  loadPointId: number,
): LoadPointLockDraft {
  const next = new Set(draft);
  if (next.has(loadPointId)) next.delete(loadPointId);
  else next.add(loadPointId);
  return next;
}

export function setLassoLoadPointLocks(
  draft: LoadPointLockDraft,
  loadPointIds: number[],
): LoadPointLockDraft {
  if (loadPointIds.length === 0) return new Set(draft);
  const next = new Set(draft);
  const shouldLock = loadPointIds.some((id) => !next.has(id));
  loadPointIds.forEach((id) => shouldLock ? next.add(id) : next.delete(id));
  return next;
}

export function applyLoadPointLockDraft(
  pilePlans: PilePlanData[],
  activePilePlanId: string,
  draft: LoadPointLockDraft,
): PilePlanData[] {
  return pilePlans.map((plan) => plan.id === activePilePlanId ? {
    ...plan,
    lockedLoadPointIds: [...draft].sort((a, b) => a - b),
  } : plan);
}

export function getActiveLockedLoadPointIds(
  pilePlans: PilePlanData[],
  activePilePlanId: string,
): number[] {
  return pilePlans.find((plan) => plan.id === activePilePlanId)?.lockedLoadPointIds ?? [];
}
