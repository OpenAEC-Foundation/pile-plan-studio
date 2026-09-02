import type {
  GreedyOptimizationResult,
  GreedyUnassignedReason,
  OptimizationPreparationDiagnostic,
  PileConfigurationKey,
} from "../.././core/projectTypes.ts";
import { summarizeOptimizationRun } from "../../domain/optimizationSummary.ts";

export type OptimizationTargetScope = "all" | "selected";
export type OptimizationLimitScope = "target" | "whole-plan";

export type SimpleOptimizationLimits = {
  sizes: number;
  tips: number;
  configurations: number;
};

export function clampOptimizationLimits(
  limits: SimpleOptimizationLimits,
  activePileSizes: number[],
  activePileTipLevels: number[],
): SimpleOptimizationLimits {
  const sizes = clampInteger(limits.sizes, activePileSizes.length);
  const tips = clampInteger(limits.tips, activePileTipLevels.length);
  return {
    sizes,
    tips,
    configurations: clampInteger(limits.configurations, sizes * tips),
  };
}

export function getOptimizationTargetIds(
  scope: OptimizationTargetScope,
  allIds: number[],
  selectedIds: number[],
  _lockedIds: number[] = [],
): number[] {
  return scope === "selected" ? selectedIds : allIds;
}

export function isOptimizationDisabled(input: {
  optimizationRunning: boolean;
  hasActivePileSizes: boolean;
  hasActivePileTipLevels: boolean;
  selectedTargetIsEmpty: boolean;
  loadPointCount: number;
  groupsPending: boolean;
  groupsError: string | Error | null;
  groupCount: number;
}): boolean {
  return input.optimizationRunning
    || !input.hasActivePileSizes
    || !input.hasActivePileTipLevels
    || input.selectedTargetIsEmpty
    || input.groupsPending
    || input.groupsError !== null
    || (input.loadPointCount > 0 && input.groupCount === 0);
}

type TranslateOptimizationDiagnostic = (
  key: string,
  options?: Record<string, unknown>,
) => string;

const DIAGNOSTIC_MESSAGE_KEYS: Record<OptimizationPreparationDiagnostic["kind"], string> = {
  invalid_group_partition: "rightPanel:optimization.blocked.invalidGroupPartition",
  missing_pile_head_level: "rightPanel:optimization.blocked.missingPileHeadLevel",
  missing_analysis_data: "rightPanel:optimization.blocked.missingAnalysisData",
  conflicting_locked_configurations: "rightPanel:optimization.blocked.conflictingLockedConfigurations",
  locked_member_unassigned: "rightPanel:optimization.blocked.lockedMemberUnassigned",
  locked_configuration_unavailable: "rightPanel:optimization.blocked.lockedConfigurationUnavailable",
  locked_configuration_exceeds_utilization_limit: "rightPanel:optimization.blocked.lockedConfigurationExceedsUtilizationLimit",
  missing_relevant_cost: "rightPanel:optimization.blocked.missingRelevantCost",
  no_eligible_configuration: "rightPanel:optimization.blocked.noEligibleConfiguration",
};

export function formatOptimizationDiagnostics(
  diagnostics: OptimizationPreparationDiagnostic[],
  translate: TranslateOptimizationDiagnostic,
): string {
  if (diagnostics.length === 0) {
    return translate("rightPanel:optimization.blocked.unknown");
  }

  const first = diagnostics[0];
  const message = translate(DIAGNOSTIC_MESSAGE_KEYS[first.kind], {
    loadPoints: first.load_point_ids.join(", "),
    pileSize: first.configuration?.pile_size_mm,
    pileTipLevel: first.configuration
      ? first.configuration.pile_tip_level_mm / 1_000
      : undefined,
  });
  return diagnostics.length === 1
    ? message
    : `${message} ${translate("rightPanel:optimization.blocked.additional", {
      count: diagnostics.length - 1,
    })}`;
}

export function splitOptimizationErrorLoadPoints(
  message: string,
  loadPointIds: number[],
): { before: string; loadPointIds: number[]; after: string } | null {
  if (loadPointIds.length === 0) return null;
  const renderedIds = loadPointIds.join(", ");
  const start = message.indexOf(renderedIds);
  if (start < 0) return null;
  return {
    before: message.slice(0, start),
    loadPointIds: [...loadPointIds],
    after: message.slice(start + renderedIds.length),
  };
}

export function applyOptimizationResult(input: {
  previousChoices: Map<number, PileConfigurationKey>;
  result: GreedyOptimizationResult;
}) {
  const nextChoices = new Map(input.previousChoices);
  const affectedLoadPointIds = [...new Set([
    ...input.result.assignments.map((choice) => choice.load_point_id),
    ...input.result.unassigned.map((item) => item.load_point_id),
  ])].sort((left, right) => left - right);
  affectedLoadPointIds.forEach((id) => nextChoices.delete(id));
  input.result.assignments.forEach((choice) => {
    nextChoices.set(choice.load_point_id, { ...choice.configuration });
  });
  const optimizationUnassignedByLoadPoint = new Map<number, GreedyUnassignedReason>(
    input.result.unassigned.map((item) => [item.load_point_id, item.reason]),
  );

  return {
    choices: nextChoices,
    affectedLoadPointIds,
    optimizationUnassignedByLoadPoint,
    summary: summarizeOptimizationRun(
      input.previousChoices,
      input.result.assignments,
      input.result.unassigned,
      input.result.unassigned_group_count,
    ),
  };
}

function clampInteger(value: number, maximum: number): number {
  if (maximum <= 0) return 0;
  const finite = Number.isFinite(value) ? Math.round(value) : maximum;
  return Math.max(1, Math.min(finite, maximum));
}
