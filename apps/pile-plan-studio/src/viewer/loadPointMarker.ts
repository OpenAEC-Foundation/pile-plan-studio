import type {
  OptimizationUnassignedReason,
  PileConfigurationOption,
  ViewerUtilizationSettings,
} from "../core/projectTypes.ts";
import type { TechnicalAssignmentIssueStatus } from "../core/technicalAssignmentContract.ts";

export type LoadPointMarkerInvalidVisual = {
  className: string;
  style: string;
};

export type UnselectedLoadPointMarkerState =
  | "pending"
  | "analysis-error"
  | "unavailable"
  | "missing-capacity-data"
  | "insufficient-capacity"
  | "optimizer-unassigned"
  | "unassigned";

export type OptimizerUnresolvedMarkerPlacement = "map" | "inline";

export function getOptimizerUnresolvedMarkerStyle(
  placement: OptimizerUnresolvedMarkerPlacement,
) {
  return placement === "inline"
    ? { position: "static", transform: "none" } as const
    : undefined;
}

export function getUnselectedLoadPointMarkerState(
  input: {
    analysisStatus: "idle" | "loading" | "ready" | "unavailable" | "error";
    technicalIssueStatus?: TechnicalAssignmentIssueStatus | null;
    optimizationUnassignedReason?: OptimizationUnassignedReason;
  },
): UnselectedLoadPointMarkerState {
  if (input.analysisStatus === "error") return "analysis-error";
  if (input.analysisStatus === "unavailable") return "unavailable";
  if (input.analysisStatus !== "ready") return "pending";
  if (input.technicalIssueStatus === "missing_capacity_data") return "missing-capacity-data";
  if (input.technicalIssueStatus === "insufficient_capacity") return "insufficient-capacity";
  if (input.optimizationUnassignedReason) return "optimizer-unassigned";
  return "unassigned";
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
