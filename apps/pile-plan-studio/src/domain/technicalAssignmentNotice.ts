import type {
  TechnicalAssignmentIssue,
  TechnicalAssignmentIssueCause,
  TechnicalAssignmentIssueStatus,
} from "../core/technicalAssignmentContract.ts";
import type { OptimizationUnassignedReason } from "../core/projectTypes.ts";

export type TechnicalAssignmentNoticeModel = {
  loadPointId: number;
  cause: TechnicalAssignmentIssueCause;
  status: TechnicalAssignmentIssueStatus;
  loadPointIds: number[];
  blockingLoadPointIds: number[];
  hasMissingCapacityData: boolean;
};

export type NeutralUnassignedNoticeModel = {
  kind: "pending" | "analysis-error" | "unassigned";
  loadPointIds: number[];
};

export type OptimizerUnassignedNoticeModel = {
  reason: OptimizationUnassignedReason;
  loadPointIds: number[];
};

export type AnalysisFailureNoticeModel = {
  detail: string | null;
};

export type MultiSelectionAssignmentSummaryCategory =
  | TechnicalAssignmentIssueStatus
  | OptimizationUnassignedReason
  | "pending"
  | "unassigned";

export type MultiSelectionAssignmentSummaryModel = {
  selectedCount: number;
  unassignedCount: number;
  categories: Array<{
    kind: MultiSelectionAssignmentSummaryCategory;
    count: number;
  }>;
};

const MULTI_SELECTION_CATEGORY_ORDER: MultiSelectionAssignmentSummaryCategory[] = [
  "missing_capacity_data",
  "insufficient_capacity",
  "optimization_constraints",
  "configuration_limits",
  "pending",
  "unassigned",
];

export function getMultiSelectionAssignmentSummary(input: {
  selectedLoadPointIds: number[];
  assignedLoadPointIds: ReadonlySet<number>;
  assessmentStatus: "idle" | "loading" | "ready" | "unavailable" | "error";
  issuesByLoadPointId: ReadonlyMap<number, TechnicalAssignmentIssue>;
  optimizerReasonsByLoadPointId: ReadonlyMap<number, OptimizationUnassignedReason>;
}): MultiSelectionAssignmentSummaryModel | null {
  const selectedLoadPointIds = sortedUnique(input.selectedLoadPointIds);
  if (selectedLoadPointIds.length <= 1) return null;

  const unassignedLoadPointIds = selectedLoadPointIds.filter((loadPointId) =>
    !input.assignedLoadPointIds.has(loadPointId));
  if (unassignedLoadPointIds.length === 0) return null;
  if (input.assessmentStatus === "unavailable" || input.assessmentStatus === "error") return null;

  const counts = new Map<MultiSelectionAssignmentSummaryCategory, number>();
  for (const loadPointId of unassignedLoadPointIds) {
    let kind: MultiSelectionAssignmentSummaryCategory = "unassigned";
    if (input.assessmentStatus === "idle" || input.assessmentStatus === "loading") {
      kind = "pending";
    } else {
      kind = input.issuesByLoadPointId.get(loadPointId)?.status
        ?? input.optimizerReasonsByLoadPointId.get(loadPointId)
        ?? "unassigned";
    }
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  return {
    selectedCount: selectedLoadPointIds.length,
    unassignedCount: unassignedLoadPointIds.length,
    categories: MULTI_SELECTION_CATEGORY_ORDER
      .map((kind) => ({ kind, count: counts.get(kind) ?? 0 }))
      .filter(({ count }) => count > 0),
  };
}

export function getAnalysisFailureNotice(input: {
  assessmentStatus: "idle" | "loading" | "ready" | "unavailable" | "error";
  error: Error | null;
}): AnalysisFailureNoticeModel | null {
  if (input.assessmentStatus !== "error") return null;
  return { detail: input.error?.message.trim() || null };
}

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
    loadPointId: issue.load_point_id,
    cause: issue.cause,
    status: issue.status,
    loadPointIds: sortedUnique(issue.group_load_point_ids),
    blockingLoadPointIds: sortedUnique(issue.blocking_load_point_ids),
    hasMissingCapacityData: issue.has_missing_capacity_data,
  };
}

export function getNeutralUnassignedNotice(input: {
  selectedLoadPointIds: number[];
  assignedLoadPointIds: ReadonlySet<number>;
  assessmentStatus: "idle" | "loading" | "ready" | "unavailable" | "error";
  technicalIssueLoadPointIds: ReadonlySet<number>;
  optimizerUnassignedLoadPointIds: ReadonlySet<number>;
}): NeutralUnassignedNoticeModel | null {
  const loadPointIds = sortedUnique(input.selectedLoadPointIds.filter((loadPointId) =>
    !input.assignedLoadPointIds.has(loadPointId)));
  if (loadPointIds.length === 0 || input.assessmentStatus === "unavailable") return null;

  if (input.assessmentStatus === "idle" || input.assessmentStatus === "loading") {
    return { kind: "pending", loadPointIds };
  }
  if (input.assessmentStatus === "error") {
    return { kind: "analysis-error", loadPointIds };
  }

  const unexplainedLoadPointIds = loadPointIds.filter((loadPointId) =>
    !input.technicalIssueLoadPointIds.has(loadPointId)
    && !input.optimizerUnassignedLoadPointIds.has(loadPointId));
  return unexplainedLoadPointIds.length > 0
    ? { kind: "unassigned", loadPointIds: unexplainedLoadPointIds }
    : null;
}

export function getOptimizerUnassignedNotices(input: {
  selectedLoadPointIds: number[];
  assignedLoadPointIds: ReadonlySet<number>;
  assessmentStatus: "idle" | "loading" | "ready" | "unavailable" | "error";
  reasonsByLoadPointId: ReadonlyMap<number, OptimizationUnassignedReason>;
}): OptimizerUnassignedNoticeModel[] {
  if (input.assessmentStatus !== "ready") return [];

  const loadPointIdsByReason = new Map<OptimizationUnassignedReason, number[]>([
    ["optimization_constraints", []],
    ["configuration_limits", []],
  ]);
  for (const loadPointId of sortedUnique(input.selectedLoadPointIds)) {
    if (input.assignedLoadPointIds.has(loadPointId)) continue;
    const reason = input.reasonsByLoadPointId.get(loadPointId);
    if (reason) loadPointIdsByReason.get(reason)?.push(loadPointId);
  }

  return (["optimization_constraints", "configuration_limits"] as const)
    .map((reason) => ({ reason, loadPointIds: loadPointIdsByReason.get(reason) ?? [] }))
    .filter(({ loadPointIds }) => loadPointIds.length > 0);
}

function sortedUnique(ids: number[]): number[] {
  return [...new Set(ids.filter(Number.isFinite))].sort((left, right) => left - right);
}
