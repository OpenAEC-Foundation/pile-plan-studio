export const DEFAULT_SELECTION_OVERVIEW_ROWS = 4;
export const MAX_SELECTION_OVERVIEW_ROWS = 12;
export const SELECTION_OVERVIEW_ROW_HEIGHT = 32;

export function clampSelectionOverviewRows(rows: number): number {
  return Number.isFinite(rows) ? Math.min(MAX_SELECTION_OVERVIEW_ROWS, Math.max(1, Math.round(rows))) : DEFAULT_SELECTION_OVERVIEW_ROWS;
}

export function selectionRowsAtPointer(startRows: number, deltaY: number, scale: number): number {
  return clampSelectionOverviewRows(startRows + deltaY / (SELECTION_OVERVIEW_ROW_HEIGHT * scale));
}
