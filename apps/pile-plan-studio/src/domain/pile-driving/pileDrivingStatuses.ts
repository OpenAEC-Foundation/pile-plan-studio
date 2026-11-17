import type { PileDrivingLocationStatus, PileDrivingStatus, ProjectPileDriving } from "../../core/pileDrivingCoreClient.ts";

export type PileDrivingAssessment = { automatic?: PileDrivingStatus; manual?: PileDrivingStatus };

export function assessPileDrivingLocations(
  automaticStatuses: readonly PileDrivingLocationStatus[] | undefined,
  manualStatuses: readonly PileDrivingLocationStatus[] | undefined,
) {
  const assessments = new Map<number, PileDrivingAssessment>();
  for (const { load_point_id, status } of automaticStatuses ?? []) {
    assessments.set(load_point_id, { automatic: status });
  }
  for (const { load_point_id, status } of manualStatuses ?? []) {
    assessments.set(load_point_id, { ...assessments.get(load_point_id), manual: status });
  }
  return assessments;
}

export function setManualPileDrivingStatus(
  current: ProjectPileDriving, loadPointId: number, status: PileDrivingStatus | null,
): ProjectPileDriving {
  const previous = current.manual_statuses?.find(entry => entry.load_point_id === loadPointId);
  if ((previous?.status ?? null) === status) return current;
  const manualStatuses = (current.manual_statuses ?? []).filter(entry => entry.load_point_id !== loadPointId);
  if (status !== null) manualStatuses.push({ load_point_id: loadPointId, status });
  return { ...current, manual_statuses: manualStatuses.length ? manualStatuses : undefined };
}
