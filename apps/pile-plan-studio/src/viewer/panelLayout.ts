export const DEFAULT_RIGHT_PANEL_WIDTH = 620;
export const MIN_RIGHT_PANEL_WIDTH = 360;
export const MAX_RIGHT_PANEL_WIDTH = 980;

export function clampRightPanelWidth(width: number): number {
  return Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, Math.round(width)));
}

export function resizeRightPanelWidth(input: {
  startWidth: number;
  startX: number;
  currentX: number;
}): number {
  return clampRightPanelWidth(input.startWidth + input.startX - input.currentX);
}
