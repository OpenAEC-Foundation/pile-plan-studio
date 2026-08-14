export const DEFAULT_EXPLORER_WIDTH = 240;
export const MIN_EXPLORER_WIDTH = 180;
export const MAX_EXPLORER_WIDTH = 480;

export const DEFAULT_RIGHT_PANEL_WIDTH = 620;
export const MIN_RIGHT_PANEL_WIDTH = 360;
export const MAX_RIGHT_PANEL_WIDTH = 980;
export const PANEL_SNAP_THRESHOLD = 72;

export type SnappedPanelWidth = { visible: boolean; width: number };

export function clampExplorerWidth(width: number): number {
  return Math.min(MAX_EXPLORER_WIDTH, Math.max(MIN_EXPLORER_WIDTH, Math.round(width)));
}

export function resizeExplorerWidth(input: {
  startWidth: number;
  startX: number;
  currentX: number;
}): number {
  return clampExplorerWidth(input.startWidth + input.currentX - input.startX);
}

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

export function snapExplorerWidth(width: number): SnappedPanelWidth {
  return width < PANEL_SNAP_THRESHOLD
    ? { visible: false, width: DEFAULT_EXPLORER_WIDTH }
    : { visible: true, width: clampExplorerWidth(width) };
}

export function snapRightPanelWidth(width: number): SnappedPanelWidth {
  return width < PANEL_SNAP_THRESHOLD
    ? { visible: false, width: DEFAULT_RIGHT_PANEL_WIDTH }
    : { visible: true, width: clampRightPanelWidth(width) };
}

export function restorePanelWidth(_visible: boolean, width: number): number {
  return width;
}
