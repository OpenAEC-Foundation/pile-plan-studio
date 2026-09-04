import type { ActivePileConfigurations } from "./activePileConfigurations.ts";
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

export type OptimizationLimitAutoState = {
  maxDifferentSizes: boolean;
  maxDifferentTips: boolean;
  maxDifferentConfigurations: boolean;
};

export function createOptimizationLimitAutoState(value: boolean): OptimizationLimitAutoState {
  return {
    maxDifferentSizes: value,
    maxDifferentTips: value,
    maxDifferentConfigurations: value,
  };
}

export function buildMaxOptimizationUiSettings(active: ActivePileConfigurations): OptimizationUiSettings {
  return {
    targetScope: "all",
    limitScope: "target",
    maxDifferentSizes: active.pileSizes.length,
    maxDifferentTips: active.pileTipLevels.length,
    maxDifferentConfigurations: active.pileSizes.length * active.pileTipLevels.length,
  };
}

export function clampMaxDifferentConfigurations(
  maxDifferentConfigurations: number,
  maxDifferentSizes: number,
  maxDifferentTips: number,
): number {
  const maxAllowed = Math.max(0, maxDifferentSizes * maxDifferentTips);

  if (maxAllowed === 0) {
    return 0;
  }

  return Math.max(1, Math.min(Math.floor(maxDifferentConfigurations), maxAllowed));
}

export function snapSliderValueToInteger(value: number, min: number, max: number): number {
  if (max <= min) {
    return max;
  }

  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

export function clampOptimizationUiSettingsToActiveConfigurations(
  uiSettings: OptimizationUiSettings,
  active: ActivePileConfigurations,
): OptimizationUiSettings {
  const maxDifferentSizes = snapSliderValueToInteger(
    uiSettings.maxDifferentSizes,
    active.pileSizes.length === 0 ? 0 : 1,
    active.pileSizes.length,
  );
  const maxDifferentTips = snapSliderValueToInteger(
    uiSettings.maxDifferentTips,
    active.pileTipLevels.length === 0 ? 0 : 1,
    active.pileTipLevels.length,
  );

  return {
    ...uiSettings,
    maxDifferentSizes,
    maxDifferentTips,
    maxDifferentConfigurations: clampMaxDifferentConfigurations(
      uiSettings.maxDifferentConfigurations,
      maxDifferentSizes,
      maxDifferentTips,
    ),
  };
}

export function reconcileOptimizationUiSettingsWithActiveConfigurations(input: {
  uiSettings: OptimizationUiSettings;
  active: ActivePileConfigurations;
  autoState: OptimizationLimitAutoState;
}): { uiSettings: OptimizationUiSettings; autoState: OptimizationLimitAutoState } {
  const maximumSettings = buildMaxOptimizationUiSettings(input.active);
  const candidateSettings = {
    ...input.uiSettings,
    maxDifferentSizes: input.autoState.maxDifferentSizes
      ? maximumSettings.maxDifferentSizes
      : input.uiSettings.maxDifferentSizes,
    maxDifferentTips: input.autoState.maxDifferentTips
      ? maximumSettings.maxDifferentTips
      : input.uiSettings.maxDifferentTips,
    maxDifferentConfigurations: input.autoState.maxDifferentConfigurations
      ? maximumSettings.maxDifferentConfigurations
      : input.uiSettings.maxDifferentConfigurations,
  };
  const clampedSettings = clampOptimizationUiSettingsToActiveConfigurations(candidateSettings, input.active);

  return {
    uiSettings: clampedSettings,
    autoState: {
      maxDifferentSizes: input.autoState.maxDifferentSizes
        || clampedSettings.maxDifferentSizes !== candidateSettings.maxDifferentSizes,
      maxDifferentTips: input.autoState.maxDifferentTips
        || clampedSettings.maxDifferentTips !== candidateSettings.maxDifferentTips,
      maxDifferentConfigurations: input.autoState.maxDifferentConfigurations
        || clampedSettings.maxDifferentConfigurations !== candidateSettings.maxDifferentConfigurations,
    },
  };
}

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
