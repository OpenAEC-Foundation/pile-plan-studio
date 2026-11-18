import type { PileDrivingLocationStatus, PileDrivingStatus, ProjectPileDriving } from "../../core/pileDrivingCoreClient.ts";

export type PileDrivingAssessment = { automatic?: PileDrivingStatus; manual?: PileDrivingStatus; reason?: string };

export function assessPileDrivingLocations(
  automaticStatuses: readonly PileDrivingLocationStatus[] | undefined,
  manualStatuses: readonly PileDrivingLocationStatus[] | undefined,
) {
  const assessments = new Map<number, PileDrivingAssessment>();
  for (const { load_point_id, status } of automaticStatuses ?? []) {
    assessments.set(load_point_id, { automatic: status });
  }
  for (const { load_point_id, status, reason } of manualStatuses ?? []) {
    assessments.set(load_point_id, { ...assessments.get(load_point_id), manual: status, reason });
  }
  return assessments;
}

export function setManualPileDrivingStatuses(
  current: ProjectPileDriving, loadPointIds: readonly number[], status: PileDrivingStatus | null,
): ProjectPileDriving {
  const byLocation = new Map(current.manual_statuses?.map(entry => [entry.load_point_id, entry]));
  const changedIds = [...new Set(loadPointIds)].filter(id => (byLocation.get(id)?.status ?? null) !== status);
  if (changedIds.length === 0) return current;
  for (const id of changedIds) {
    if (status === null) byLocation.delete(id);
    else byLocation.set(id, { ...byLocation.get(id), load_point_id: id, status });
  }
  const manualStatuses = [...byLocation.values()];
  return { ...current, manual_statuses: manualStatuses.length ? manualStatuses : undefined };
}

export function setManualPileDrivingReason(
  current: ProjectPileDriving, loadPointIds: readonly number[], reason: string,
): ProjectPileDriving {
  const selectedIds = new Set(loadPointIds);
  const note = reason.trim();
  const entries = current.manual_statuses;
  if (!entries?.some(entry => selectedIds.has(entry.load_point_id) && (entry.reason ?? "") !== note)) return current;
  return {
    ...current,
    manual_statuses: entries.map(entry => {
      if (!selectedIds.has(entry.load_point_id)) return entry;
      const { load_point_id, status } = entry;
      return note ? { load_point_id, status, reason: note } : { load_point_id, status };
    }),
  };
}
