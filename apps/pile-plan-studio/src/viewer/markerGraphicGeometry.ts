import type { ForegroundLayer } from "../domain/settings/viewerPreferences.ts";
import { effectiveSymbolScale, loadPointMarkerDiameter } from "./hoverCandidates.ts";

export type MarkerGraphicKind = "load-point" | "cpt";

export type MarkerDrawPriorityInput = {
  kind: MarkerGraphicKind;
  foregroundLayer: ForegroundLayer;
  selected: boolean;
  raised: boolean;
  hovered: boolean;
};

export function getLoadPointRingRadius(symbolScalePercent: number): number {
  return (loadPointMarkerDiameter(symbolScalePercent) + 5) / 2;
}

export function getCptRingRadius(symbolScalePercent: number): number {
  return (15 * effectiveSymbolScale(symbolScalePercent) + 5) / 2;
}

export function getCptSymbolScale(effectiveScale: number): number {
  return 13 * effectiveScale / 22;
}

export function getMarkerHitDiameter(
  kind: MarkerGraphicKind,
  symbolScalePercent: number,
  ringVisible: boolean,
): number {
  const base = (kind === "load-point" ? 14 : 15) * effectiveSymbolScale(symbolScalePercent);
  return base + (ringVisible ? 6 : 0);
}

export function getMarkerDrawPriority(input: MarkerDrawPriorityInput): number {
  if (input.hovered) return 50;
  if (input.kind === "load-point") {
    return input.selected ? 40 : input.foregroundLayer === "cpts" ? 10 : 20;
  }
  return input.selected || input.raised ? 30 : input.foregroundLayer === "cpts" ? 20 : 10;
}
