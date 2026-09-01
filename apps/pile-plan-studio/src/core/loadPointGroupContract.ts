import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import type { LoadPoint, PileConfigurationKey } from "./projectTypes.ts";

export type LoadPointGroup = {
  load_point_ids: number[];
};

export type LoadPointGroupAssignmentChange = {
  load_point_id: number;
  configuration: PileConfigurationKey;
};

export type BlockingLockedLoadPoint = {
  load_point_id: number;
  assigned_configuration: PileConfigurationKey | null;
};

export type ApplyLoadPointGroupAssignmentResult =
  | {
      status: "applied";
      changes: LoadPointGroupAssignmentChange[];
    }
  | {
      status: "blocked";
      involved_load_point_ids: number[];
      blocking_locked_load_points: BlockingLockedLoadPoint[];
    };

export type LoadPointGroupAssignmentInput = {
  selectedLoadPointIds: number[];
  groups: LoadPointGroup[];
  requestedConfiguration: PileConfigurationKey;
  currentAssignments: Map<number, PileConfigurationKey>;
  lockedLoadPointIds: number[];
};

type CoreLoadPointGroupAssignmentRequest<TAssignments> = {
  selected_load_point_ids: number[];
  groups: LoadPointGroup[];
  requested_configuration: PileConfigurationKey;
  current_assignments: TAssignments;
  locked_load_point_ids: number[];
};

export type BrowserLoadPointGroupAssignmentRequest =
  CoreLoadPointGroupAssignmentRequest<Map<number, PileConfigurationKey>>;

export type DesktopLoadPointGroupAssignmentRequest =
  CoreLoadPointGroupAssignmentRequest<Record<string, PileConfigurationKey>>;

export function toDeriveLoadPointGroupsRequest(loadPoints: LoadPoint[]): {
  load_points: LoadPoint[];
} {
  return { load_points: loadPoints };
}

export function toBrowserLoadPointGroupAssignmentRequest(
  input: LoadPointGroupAssignmentInput,
): BrowserLoadPointGroupAssignmentRequest {
  return toCoreAssignmentRequest(
    input,
    toWasmNumberKeyedMap(input.currentAssignments),
  );
}

export function toDesktopLoadPointGroupAssignmentRequest(
  input: LoadPointGroupAssignmentInput,
): DesktopLoadPointGroupAssignmentRequest {
  return toCoreAssignmentRequest(
    input,
    toStringKeyedRecord(input.currentAssignments),
  );
}

export function loadPointGroupsFromCore(groups: LoadPointGroup[]): LoadPointGroup[] {
  return groups.map((group) => ({ load_point_ids: [...group.load_point_ids] }));
}

export function loadPointGroupAssignmentResultFromCore(
  result: ApplyLoadPointGroupAssignmentResult,
): ApplyLoadPointGroupAssignmentResult {
  if (result.status === "applied") {
    return {
      status: "applied",
      changes: result.changes.map((change) => ({
        load_point_id: change.load_point_id,
        configuration: { ...change.configuration },
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

function toCoreAssignmentRequest<TAssignments>(
  input: LoadPointGroupAssignmentInput,
  currentAssignments: TAssignments,
): CoreLoadPointGroupAssignmentRequest<TAssignments> {
  return {
    selected_load_point_ids: [...input.selectedLoadPointIds],
    groups: loadPointGroupsFromCore(input.groups),
    requested_configuration: { ...input.requestedConfiguration },
    current_assignments: currentAssignments,
    locked_load_point_ids: [...input.lockedLoadPointIds],
  };
}
