import type { PileConfigurationOption, ViewerUtilizationSettings } from "../core/projectTypes.ts";

export type LoadPointMarkerInvalidVisual = {
  className: string;
  style: string;
};

export type UnselectedLoadPointMarkerState = "pending" | "missing" | "invalid";

export function getUnselectedLoadPointMarkerState(
  options: PileConfigurationOption[] | undefined,
  isPending: boolean,
  hasAnalysisError: boolean,
): UnselectedLoadPointMarkerState {
  if (isPending || hasAnalysisError || !options) {
    return "pending";
  }

  if (options.length > 0 && options.every((option) => option.missing_cpt_ids.length > 0)) {
    return "missing";
  }

  return "invalid";
}

export function getLoadPointMarkerInvalidVisual(
  chosenOption: PileConfigurationOption | null,
  preferredRange: ViewerUtilizationSettings = { minimum: 0, maximum: 1 },
): LoadPointMarkerInvalidVisual {
  if (!chosenOption) {
    return { className: "", style: "" };
  }

  if (chosenOption.missing_cpt_ids.length > 0) {
    return { className: " is-missing", style: "" };
  }

  const utilization = chosenOption.utilization;
  if (utilization === null) {
    return chosenOption.isOption
      ? { className: "", style: "" }
      : { className: " is-above-range", style: "--utilization-intensity: 0.5;" };
  }

  if (utilization > preferredRange.maximum) {
    return utilizationRangeVisual("above", utilization - preferredRange.maximum);
  }

  if (utilization < preferredRange.minimum) {
    return utilizationRangeVisual("below", preferredRange.minimum - utilization);
  }

  return { className: "", style: "" };
}

function utilizationRangeVisual(direction: "above" | "below", distance: number) {
  const intensity = Math.min(1, Math.max(0, distance / 0.5));

  return {
    className: direction === "above" ? " is-above-range" : " is-below-range",
    style: `--utilization-intensity: ${formatCssNumber(intensity)};`,
  };
}

function formatCssNumber(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
