export const DEFAULT_RIGHT_PANEL_SPLIT = 0.7;
export const MIN_RIGHT_PANEL_SPLIT = 0.2;
export const MAX_RIGHT_PANEL_SPLIT = 0.85;

export function clampRightPanelSplit(ratio: number): number {
  return Number.isFinite(ratio)
    ? Math.max(MIN_RIGHT_PANEL_SPLIT, Math.min(MAX_RIGHT_PANEL_SPLIT, ratio))
    : DEFAULT_RIGHT_PANEL_SPLIT;
}

export function rightPanelSplitAtPointer(clientY: number, top: number, height: number): number {
  return height > 0 ? clampRightPanelSplit((clientY - top) / height) : DEFAULT_RIGHT_PANEL_SPLIT;
}
