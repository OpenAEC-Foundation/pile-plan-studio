import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import { loadPointGroupsFromCore, type LoadPointGroup } from "./loadPointGroupContract.ts";
import {
  toCorePileOptionsByLoadPoint,
  type CorePileConfigurationOption,
} from "./pileOptionAggregationContract.ts";
import type {
  GreedyOptimizationOutcome,
  GreedyOptimizationResult,
  GreedyOptimizationSettings,
  OptimizationLimitScope,
  PileConfigurationKey,
  PileConfigurationOption,
  PileCostSettings,
} from "./projectTypes.ts";

export type GreedyOptimizationContractInput = {
  groups: LoadPointGroup[];
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>;
  targetLoadPointIds: number[];
  lockedLoadPointIds: number[];
  currentAssignments: Map<number, PileConfigurationKey>;
  limitScope: OptimizationLimitScope;
  pileHeadLevelM: number | null;
  costSettings: PileCostSettings;
  settings: GreedyOptimizationSettings;
};

type CoreGreedyOptimizationRequest<TOptions, TAssignments> = {
  groups: LoadPointGroup[];
  options_by_load_point: TOptions;
  target_load_point_ids: number[];
  locked_load_point_ids: number[];
  current_assignments: TAssignments;
  limit_scope: OptimizationLimitScope;
  pile_head_level_m: number | null;
  cost_settings: PileCostSettings;
  settings: GreedyOptimizationSettings;
};

export type BrowserGreedyOptimizationRequest = CoreGreedyOptimizationRequest<
  Map<number, CorePileConfigurationOption[]>,
  Map<number, PileConfigurationKey>
>;

export type DesktopGreedyOptimizationRequest = CoreGreedyOptimizationRequest<
  Record<string, CorePileConfigurationOption[]>,
  Record<string, PileConfigurationKey>
>;

export function toBrowserGreedyOptimizationRequest(
  input: GreedyOptimizationContractInput,
): BrowserGreedyOptimizationRequest {
  return toCoreRequest(
    input,
    toWasmNumberKeyedMap(toCorePileOptionsByLoadPoint(input.optionsByLoadPoint)),
    toWasmNumberKeyedMap(cloneAssignments(input.currentAssignments)),
  );
}

export function toDesktopGreedyOptimizationRequest(
  input: GreedyOptimizationContractInput,
): DesktopGreedyOptimizationRequest {
  return toCoreRequest(
    input,
    toStringKeyedRecord(toCorePileOptionsByLoadPoint(input.optionsByLoadPoint)),
    toStringKeyedRecord(cloneAssignments(input.currentAssignments)),
  );
}

export function greedyOptimizationOutcomeFromCore(
  outcome: GreedyOptimizationOutcome,
): GreedyOptimizationOutcome {
  if (outcome.status === "blocked") {
    return {
      status: "blocked",
      diagnostics: outcome.diagnostics.map((diagnostic) => ({
        kind: diagnostic.kind,
        load_point_ids: [...diagnostic.load_point_ids],
        configuration: diagnostic.configuration ? { ...diagnostic.configuration } : null,
      })),
    };
  }

  return {
    status: "completed",
    result: cloneResult(outcome.result),
  };
}

function toCoreRequest<TOptions, TAssignments>(
  input: GreedyOptimizationContractInput,
  optionsByLoadPoint: TOptions,
  currentAssignments: TAssignments,
): CoreGreedyOptimizationRequest<TOptions, TAssignments> {
  return {
    groups: loadPointGroupsFromCore(input.groups),
    options_by_load_point: optionsByLoadPoint,
    target_load_point_ids: [...input.targetLoadPointIds],
    locked_load_point_ids: [...input.lockedLoadPointIds],
    current_assignments: currentAssignments,
    limit_scope: input.limitScope,
    pile_head_level_m: input.pileHeadLevelM,
    cost_settings: {
      ...input.costSettings,
      items: input.costSettings.items.map((item) => ({ ...item })),
    },
    settings: {
      ...input.settings,
      enabled_pile_sizes: [...input.settings.enabled_pile_sizes],
      enabled_pile_tip_levels: [...input.settings.enabled_pile_tip_levels],
    },
  };
}

function cloneAssignments(
  assignments: Map<number, PileConfigurationKey>,
): Map<number, PileConfigurationKey> {
  return new Map(
    [...assignments].map(([loadPointId, configuration]) => [
      loadPointId,
      { ...configuration },
    ]),
  );
}

function cloneResult(result: GreedyOptimizationResult): GreedyOptimizationResult {
  return {
    assignments: result.assignments.map((assignment) => ({
      ...assignment,
      configuration: { ...assignment.configuration },
    })),
    unassigned: result.unassigned.map((unassigned) => ({ ...unassigned })),
    unassigned_group_count: result.unassigned_group_count,
    selected_configurations: result.selected_configurations.map((configuration) => ({
      ...configuration,
    })),
    pile_size_count: result.pile_size_count,
    pile_tip_level_count: result.pile_tip_level_count,
    configuration_count: result.configuration_count,
  };
}

export type { GreedyOptimizationOutcome } from "./projectTypes.ts";
