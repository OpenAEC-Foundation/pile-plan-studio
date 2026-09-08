import type { LegendEncodingMode } from "../../core/projectTypes.ts";

export const LEGEND_ENCODING_MODES: readonly LegendEncodingMode[] = [
  "size-symbol",
  "tip-symbol",
  "size-color-tip-region",
];

type EncodingDisclosure = {
  open: boolean;
};

type ChooseLegendEncodingModeOptions = {
  disclosure: EncodingDisclosure | null;
  currentMode: LegendEncodingMode;
  nextMode: LegendEncodingMode;
  enableTipLevelRegions: boolean;
};

export function chooseLegendEncodingMode({
  disclosure,
  currentMode,
  nextMode,
  enableTipLevelRegions,
}: ChooseLegendEncodingModeOptions): boolean {
  if (disclosure) disclosure.open = false;
  if (nextMode === "size-color-tip-region" && currentMode !== nextMode) return true;
  if (nextMode !== "size-color-tip-region") return false;
  return enableTipLevelRegions;
}
