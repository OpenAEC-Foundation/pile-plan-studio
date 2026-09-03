import type {
  TechnicalAssignmentIssue,
  TechnicalAssignmentIssueCause,
  TechnicalAssignmentIssueStatus,
} from "../core/technicalAssignmentContract.ts";

export type TechnicalAssignmentNoticeModel = {
  cause: TechnicalAssignmentIssueCause;
  status: TechnicalAssignmentIssueStatus;
  loadPointIds: number[];
  blockingLoadPointIds: number[];
  hasMissingCapacityData: boolean;
};

export function getTechnicalAssignmentNotice(input: {
  selectedLoadPointIds: number[];
  assessmentStatus: "idle" | "loading" | "ready" | "unavailable" | "error";
  issuesByLoadPointId: ReadonlyMap<number, TechnicalAssignmentIssue>;
}): TechnicalAssignmentNoticeModel | null {
  if (input.assessmentStatus !== "ready" || input.selectedLoadPointIds.length !== 1) {
    return null;
  }
  const issue = input.issuesByLoadPointId.get(input.selectedLoadPointIds[0]);
  if (!issue) return null;
  return {
    cause: issue.cause,
    status: issue.status,
    loadPointIds: sortedUnique(issue.group_load_point_ids),
    blockingLoadPointIds: sortedUnique(issue.blocking_load_point_ids),
    hasMissingCapacityData: issue.has_missing_capacity_data,
  };
}

function sortedUnique(ids: number[]): number[] {
  return [...new Set(ids.filter(Number.isFinite))].sort((left, right) => left - right);
}
