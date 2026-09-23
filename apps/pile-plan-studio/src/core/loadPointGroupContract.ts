import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import type {
  LoadPoint,
  LoadPointGroupOverride,
  LoadPointGroupingSettings,
  PileConfigurationKey,
} from "./projectTypes.ts";
import type { LoadPointTopology } from "./tipLevelRegionContract.ts";

export type LoadPointGroupOrigin = "automatic" | "manual" | "explicitly_separated";

export type LoadPointGroup = {
  load_point_ids: number[];
  origin?: LoadPointGroupOrigin;
};

export type DerivedLoadPointGroups = {
  groups: LoadPointGroup[];
  topology: LoadPointTopology;
};

export type LoadPointGroupEditAction = "group" | "ungroup" | "reset_overrides";
export type LoadPointGroupEditBlockReason =
  | "not_enough_locations"
  | "disconnected_selection"
  | "already_grouped"
  | "selection_must_be_one_group"
  | "singleton_group"
  | "no_overrides";

export type LoadPointGroupEditInput = {
  loadPoints: LoadPoint[];
  settings: LoadPointGroupingSettings;
  selectedLoadPointIds: number[];
  action: LoadPointGroupEditAction;
};

export type LoadPointGroupEditPreview = {
  allowed: boolean;
  reason: LoadPointGroupEditBlockReason | null;
};

export type LoadPointGroupEditResult =
  | { status: "applied"; settings: LoadPointGroupingSettings; grouping: DerivedLoadPointGroups }
  | {
      status: "blocked";
      reason: LoadPointGroupEditBlockReason;
      load_point_ids: number[];
    };

export type GroupAssignmentConflict = {
  load_point_ids: number[];
  kind: "partial_assignment" | "different_configurations";
  assignment_repair_blocked: boolean;
  unassignment_repair_blocked: boolean;
  blocking_locked_load_point_ids: number[];
};

export type GroupAssignmentAssessmentInput = {
  groups: LoadPointGroup[];
  assignments: Map<number, PileConfigurationKey>;
  lockedLoadPointIds: number[];
};

export type LoadPointGroupAssignmentChange = {
  load_point_id: number;
  configuration: PileConfigurationKey | null;
};

export type BlockingLockedLoadPoint = {
  load_point_id: number;
  assigned_configuration: PileConfigurationKey | null;
};

export type ApplyLoadPointGroupAssignmentResult =
  | { status: "applied"; changes: LoadPointGroupAssignmentChange[] }
  | {
      status: "blocked";
      involved_load_point_ids: number[];
      blocking_locked_load_points: BlockingLockedLoadPoint[];
    };

export type LoadPointGroupAssignmentInput = {
  selectedLoadPointIds: number[];
  groups: LoadPointGroup[];
  requestedConfiguration: PileConfigurationKey | null;
  currentAssignments: Map<number, PileConfigurationKey>;
  lockedLoadPointIds: number[];
};

type CoreGroupingSettings = {
  automatic: boolean;
  max_edge_distance_mm: number;
  manual_groups: Array<{ load_point_ids: number[] }>;
  ungrouped_groups: Array<{ load_point_ids: number[] }>;
};

type CoreLoadPointGroupEditRequest = {
  load_points: LoadPoint[];
  settings: CoreGroupingSettings;
  selected_load_point_ids: number[];
  action: LoadPointGroupEditAction;
};

type CoreLoadPointGroupEditResult =
  | { status: "applied"; settings: CoreGroupingSettings; grouping: DerivedLoadPointGroups }
  | Extract<LoadPointGroupEditResult, { status: "blocked" }>;

type CoreLoadPointGroupAssignmentRequest<TAssignments> = {
  selected_load_point_ids: number[];
  groups: LoadPointGroup[];
  requested_configuration: PileConfigurationKey | null;
  current_assignments: TAssignments;
  locked_load_point_ids: number[];
};

type CoreGroupAssignmentAssessmentRequest<TAssignments> = {
  groups: LoadPointGroup[];
  assignments: TAssignments;
  locked_load_point_ids: number[];
};

export type BrowserLoadPointGroupAssignmentRequest =
  CoreLoadPointGroupAssignmentRequest<Map<number, PileConfigurationKey>>;
export type DesktopLoadPointGroupAssignmentRequest =
  CoreLoadPointGroupAssignmentRequest<Record<string, PileConfigurationKey>>;
export type BrowserGroupAssignmentAssessmentRequest =
  CoreGroupAssignmentAssessmentRequest<Map<number, PileConfigurationKey>>;
export type DesktopGroupAssignmentAssessmentRequest =
  CoreGroupAssignmentAssessmentRequest<Record<string, PileConfigurationKey>>;

export function toDeriveLoadPointGroupsRequest(
  loadPoints: LoadPoint[],
  settings: LoadPointGroupingSettings,
): { load_points: LoadPoint[]; settings: CoreGroupingSettings } {
  return { load_points: loadPoints, settings: groupingSettingsToCore(settings) };
}

export function toPreviewLoadPointGroupEditRequest(
  input: LoadPointGroupEditInput,
): CoreLoadPointGroupEditRequest {
  return toLoadPointGroupEditRequest(input);
}

export function toApplyLoadPointGroupEditRequest(
  input: LoadPointGroupEditInput,
): CoreLoadPointGroupEditRequest {
  return toLoadPointGroupEditRequest(input);
}

export function toBrowserLoadPointGroupAssignmentRequest(
  input: LoadPointGroupAssignmentInput,
): BrowserLoadPointGroupAssignmentRequest {
  return toCoreAssignmentRequest(input, toWasmNumberKeyedMap(input.currentAssignments));
}

export function toDesktopLoadPointGroupAssignmentRequest(
  input: LoadPointGroupAssignmentInput,
): DesktopLoadPointGroupAssignmentRequest {
  return toCoreAssignmentRequest(input, toStringKeyedRecord(input.currentAssignments));
}

export function toBrowserGroupAssignmentAssessmentRequest(
  input: GroupAssignmentAssessmentInput,
): BrowserGroupAssignmentAssessmentRequest {
  return toCoreAssessmentRequest(input, toWasmNumberKeyedMap(input.assignments));
}

export function toDesktopGroupAssignmentAssessmentRequest(
  input: GroupAssignmentAssessmentInput,
): DesktopGroupAssignmentAssessmentRequest {
  return toCoreAssessmentRequest(input, toStringKeyedRecord(input.assignments));
}

export function loadPointGroupsFromCore(groups: LoadPointGroup[]): LoadPointGroup[] {
  return groups.map((group) => ({
    load_point_ids: [...group.load_point_ids],
    ...(group.origin ? { origin: group.origin } : {}),
  }));
}

export function derivedLoadPointGroupsFromCore(
  grouping: DerivedLoadPointGroups,
): DerivedLoadPointGroups {
  return {
    groups: loadPointGroupsFromCore(grouping.groups),
    topology: {
      load_point_ids: [...grouping.topology.load_point_ids],
      edges: grouping.topology.edges.map((edge) => ({ ...edge })),
      faces: grouping.topology.faces.map((face) => ({
        boundary_load_point_ids: [...face.boundary_load_point_ids],
      })),
    },
  };
}

export function loadPointGroupEditResultFromCore(
  result: CoreLoadPointGroupEditResult,
): LoadPointGroupEditResult {
  if (result.status === "blocked") {
    return { ...result, load_point_ids: [...result.load_point_ids] };
  }
  return {
    status: "applied",
    settings: groupingSettingsFromCore(result.settings),
    grouping: derivedLoadPointGroupsFromCore(result.grouping),
  };
}

export function groupAssignmentConflictsFromCore(
  conflicts: GroupAssignmentConflict[],
): GroupAssignmentConflict[] {
  return conflicts.map((conflict) => ({
    ...conflict,
    load_point_ids: [...conflict.load_point_ids],
    blocking_locked_load_point_ids: [...conflict.blocking_locked_load_point_ids],
  }));
}

export function loadPointGroupAssignmentResultFromCore(
  result: ApplyLoadPointGroupAssignmentResult,
): ApplyLoadPointGroupAssignmentResult {
  if (result.status === "applied") {
    return {
      status: "applied",
      changes: result.changes.map((change) => ({
        load_point_id: change.load_point_id,
        configuration: change.configuration ? { ...change.configuration } : null,
      })),
    };
  }
  return {
    status: "blocked",
    involved_load_point_ids: [...result.involved_load_point_ids],
    blocking_locked_load_points: result.blocking_locked_load_points.map((blocker) => ({
      load_point_id: blocker.load_point_id,
      assigned_configuration: blocker.assigned_configuration
        ? { ...blocker.assigned_configuration }
        : null,
    })),
  };
}

function toLoadPointGroupEditRequest(
  input: LoadPointGroupEditInput,
): CoreLoadPointGroupEditRequest {
  return {
    load_points: input.loadPoints,
    settings: groupingSettingsToCore(input.settings),
    selected_load_point_ids: [...input.selectedLoadPointIds],
    action: input.action,
  };
}

function groupingSettingsToCore(settings: LoadPointGroupingSettings): CoreGroupingSettings {
  return {
    automatic: settings.automatic,
    max_edge_distance_mm: settings.maxEdgeDistanceM * 1_000,
    manual_groups: canonicalOverrideRecords(settings.manualGroups),
    ungrouped_groups: canonicalOverrideRecords(settings.ungroupedGroups),
  };
}

function groupingSettingsFromCore(settings: CoreGroupingSettings): LoadPointGroupingSettings {
  return {
    automatic: settings.automatic,
    maxEdgeDistanceM: settings.max_edge_distance_mm / 1_000,
    manualGroups: settings.manual_groups.map(({ load_point_ids }) => ({
      loadPointIds: [...load_point_ids],
    })),
    ungroupedGroups: settings.ungrouped_groups.map(({ load_point_ids }) => ({
      loadPointIds: [...load_point_ids],
    })),
  };
}

function canonicalOverrideRecords(
  records: LoadPointGroupOverride[],
): Array<{ load_point_ids: number[] }> {
  return records
    .map(({ loadPointIds }) => ({
      load_point_ids: [...new Set(loadPointIds)].sort((left, right) => left - right),
    }))
    .sort((left, right) => compareIds(left.load_point_ids, right.load_point_ids));
}

function compareIds(left: number[], right: number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function toCoreAssignmentRequest<TAssignments>(
  input: LoadPointGroupAssignmentInput,
  currentAssignments: TAssignments,
): CoreLoadPointGroupAssignmentRequest<TAssignments> {
  return {
    selected_load_point_ids: [...input.selectedLoadPointIds],
    groups: loadPointGroupsFromCore(input.groups),
    requested_configuration: input.requestedConfiguration
      ? { ...input.requestedConfiguration }
      : null,
    current_assignments: currentAssignments,
    locked_load_point_ids: [...input.lockedLoadPointIds],
  };
}

function toCoreAssessmentRequest<TAssignments>(
  input: GroupAssignmentAssessmentInput,
  assignments: TAssignments,
): CoreGroupAssignmentAssessmentRequest<TAssignments> {
  return {
    groups: loadPointGroupsFromCore(input.groups),
    assignments,
    locked_load_point_ids: [...input.lockedLoadPointIds],
  };
}
