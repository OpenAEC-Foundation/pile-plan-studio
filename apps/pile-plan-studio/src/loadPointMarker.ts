import type { PileConfigurationOption } from "./projectTypes.ts";

export type LoadPointMarkerInvalidVisual = {
  className: string;
  style: string;
};

export function getLoadPointMarkerInvalidVisual(
  chosenOption: PileConfigurationOption | null,
): LoadPointMarkerInvalidVisual {
  if (!chosenOption || chosenOption.isOption) {
    return { className: "", style: "" };
  }

  if (chosenOption.missing_cpt_ids.length > 0) {
    return { className: " is-missing", style: "" };
  }

  const overrun = chosenOption.utilization === null
    ? 0.25
    : Math.max(0, chosenOption.utilization - 1);
  const intensity = Math.min(0.9, 0.2 + overrun * 1.4);

  return {
    className: " is-invalid",
    style: `--invalid-intensity: ${formatCssNumber(intensity)};`,
  };
}

function formatCssNumber(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
