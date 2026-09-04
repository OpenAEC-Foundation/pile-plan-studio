import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import { loadPointGroupsFromCore, type LoadPointGroup } from "./loadPointGroupContract.ts";
import {
  toCorePileOptionsByLoadPoint,
  type CorePileConfigurationOption,
} from "./pileOptionAggregationContract.ts";
import type { PileConfigurationOption } from "./projectTypes.ts";

export type TechnicalAssignmentAvailability = "available" | "no_pile_configurations";

export type TechnicalAssignmentIssueCause =
  | "no_valid_option"
  | "group_member_without_valid_option"
  | "no_common_valid_group_configuration";

export type TechnicalAssignmentIssueStatus =
  | "missing_capacity_data"
  | "insufficient_capacity";

export type TechnicalAssignmentIssue = {
  load_point_id: number;
  cause: TechnicalAssignmentIssueCause;
  status: TechnicalAssignmentIssueStatus;
  group_load_point_ids: number[];
  blocking_load_point_ids: number[];
  missing_cpt_ids: number[];
  has_missing_capacity_data: boolean;
};

export type TechnicalAssignmentAssessment = {
  availability: TechnicalAssignmentAvailability;
  issues: TechnicalAssignmentIssue[];
};

export type CoreTechnicalAssignmentAssessment = TechnicalAssignmentAssessment;

export type TechnicalAssignmentContractInput = {
  groups: LoadPointGroup[];
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>;
};

export type BrowserTechnicalAssignmentRequest = {
  groups: LoadPointGroup[];
  options_by_load_point: Map<number, CorePileConfigurationOption[]>;
};

export type DesktopTechnicalAssignmentRequest = {
  groups: LoadPointGroup[];
  options_by_load_point: Record<string, CorePileConfigurationOption[]>;
};

export function toBrowserTechnicalAssignmentRequest(
  input: TechnicalAssignmentContractInput,
): BrowserTechnicalAssignmentRequest {
  return {
    groups: loadPointGroupsFromCore(input.groups),
    options_by_load_point: toWasmNumberKeyedMap(
      toCorePileOptionsByLoadPoint(input.optionsByLoadPoint),
    ),
  };
}

export function toDesktopTechnicalAssignmentRequest(
  input: TechnicalAssignmentContractInput,
): DesktopTechnicalAssignmentRequest {
  return {
    groups: loadPointGroupsFromCore(input.groups),
    options_by_load_point: toStringKeyedRecord(
      toCorePileOptionsByLoadPoint(input.optionsByLoadPoint),
    ),
  };
}

export function technicalAssignmentAssessmentFromCore(
  assessment: CoreTechnicalAssignmentAssessment,
): TechnicalAssignmentAssessment {
  return {
    availability: assessment.availability,
    issues: assessment.issues.map((issue) => ({
      ...issue,
      group_load_point_ids: sortedUniqueIds(issue.group_load_point_ids),
      blocking_load_point_ids: sortedUniqueIds(issue.blocking_load_point_ids),
      missing_cpt_ids: sortedUniqueIds(issue.missing_cpt_ids),
    })),
  };
}

function sortedUniqueIds(ids: number[]): number[] {
  return [...new Set(ids.filter(Number.isFinite))].sort((left, right) => left - right);
}
