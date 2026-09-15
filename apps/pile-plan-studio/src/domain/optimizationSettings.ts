import type { GreedyOptimizationSettings, OptimizationCandidateSource } from "../core/projectTypes.ts";

export type OptimizationTargetScope = "all" | "selected";
export type OptimizationLimitScope = "target" | "whole-plan";

export type OptimizationUiSettings = {
  targetScope: OptimizationTargetScope;
  limitScope: OptimizationLimitScope;
  maxDifferentSizes: number;
  maxDifferentTips: number;
  maxDifferentConfigurations: number;
};

export function buildGreedyOptimizationSettings(input: {
  candidateSource: OptimizationCandidateSource;
  uiSettings: OptimizationUiSettings;
  maxUtilization: number;
}): GreedyOptimizationSettings {
  return {
    max_pile_sizes: input.uiSettings.maxDifferentSizes,
    max_pile_tip_levels: input.uiSettings.maxDifferentTips,
    max_pile_configurations: input.uiSettings.maxDifferentConfigurations,
    max_utilization: Math.max(0, Math.min(1, input.maxUtilization)),
    candidate_source: input.candidateSource,
  };
}
