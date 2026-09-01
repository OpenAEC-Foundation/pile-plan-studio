import type { BearingCapacity, Cpt, LoadPoint } from "../core/projectTypes.ts";
import type { InputSourceKind } from "./projectState.ts";

export type SourceTableValue = string | number;
export type SourceTableRow = Record<string, SourceTableValue>;
export type SourceTableColumn = { key: string; labelKey: string; unit?: string };
export type SourceTableSort = { key: string; direction: "asc" | "desc" } | null;
export type SourceTableFilter = { value: string; mode: "exact" | "contains" };

export type SourceTableData = {
  columns: SourceTableColumn[];
  rows: SourceTableRow[];
};

export type SourceLoadPointSelection = {
  mode: "replace" | "add" | "toggle";
  loadPointIds: number[];
  anchorId: number;
};

export function getSourceLoadPointSelection(input: {
  rowIds: number[];
  clickedId: number;
  anchorId: number | null;
  unavailableIds: Set<number>;
  shiftKey: boolean;
  additiveKey: boolean;
}): SourceLoadPointSelection {
  const anchorIndex = input.anchorId === null ? -1 : input.rowIds.indexOf(input.anchorId);
  const clickedIndex = input.rowIds.indexOf(input.clickedId);
  if (input.shiftKey && anchorIndex >= 0 && clickedIndex >= 0) {
    const firstIndex = Math.min(anchorIndex, clickedIndex);
    const lastIndex = Math.max(anchorIndex, clickedIndex);
    return {
      mode: input.additiveKey ? "add" : "replace",
      loadPointIds: input.rowIds
        .slice(firstIndex, lastIndex + 1)
        .filter((id) => !input.unavailableIds.has(id)),
      anchorId: input.anchorId!,
    };
  }

  return {
    mode: input.additiveKey ? "toggle" : "replace",
    loadPointIds: [input.clickedId],
    anchorId: input.clickedId,
  };
}

export function getSourceSelectionRevealScrollTop(input: {
  currentScrollTop: number;
  selectedRowIndex: number;
  rowHeight: number;
  viewportHeight: number;
  initiatedInTable: boolean;
}): number {
  if (input.initiatedInTable || input.selectedRowIndex < 0 || input.viewportHeight <= 0) {
    return input.currentScrollTop;
  }

  const rowTop = input.selectedRowIndex * input.rowHeight;
  const rowBottom = rowTop + input.rowHeight;
  const visibleBottom = input.currentScrollTop + input.viewportHeight;
  if (rowTop >= input.currentScrollTop && rowBottom <= visibleBottom) {
    return input.currentScrollTop;
  }

  return Math.max(0, rowTop - Math.max(0, (input.viewportHeight - input.rowHeight) / 2));
}

export function buildSourceTable(
  kind: InputSourceKind,
  data: { loadPoints: LoadPoint[]; cpts: Cpt[]; bearingCapacities: BearingCapacity[] },
): SourceTableData {
  if (kind === "load_points") {
    return {
      columns: [
        { key: "id", labelKey: "id" },
        { key: "x", labelKey: "x", unit: "mm" },
        { key: "y", labelKey: "y", unit: "mm" },
        { key: "fed", labelKey: "fed", unit: "kN" },
      ],
      rows: data.loadPoints.map((item) => ({
        id: item.id,
        x: item.x_mm,
        y: item.y_mm,
        fed: item.design_load_kn,
      })),
    };
  }
  if (kind === "cpts") {
    return {
      columns: [
        { key: "id", labelKey: "cpt" },
        { key: "x", labelKey: "x", unit: "mm" },
        { key: "y", labelKey: "y", unit: "mm" },
      ],
      rows: data.cpts.map((item) => ({ id: item.id, x: item.x_mm, y: item.y_mm })),
    };
  }
  return {
    columns: [
      { key: "cpt", labelKey: "cpt" },
      { key: "size", labelKey: "size", unit: "mm" },
      { key: "tip", labelKey: "tip", unit: "m" },
      { key: "capacity", labelKey: "capacity", unit: "kN" },
    ],
    rows: data.bearingCapacities.map((item) => ({
      cpt: item.cpt_id,
      size: item.pile_size_mm,
      tip: item.pile_tip_level_m,
      capacity: item.frd_kn,
    })),
  };
}

export function filterAndSortSourceRows<T extends SourceTableRow>(
  rows: T[],
  filters: Record<string, SourceTableFilter>,
  sort: SourceTableSort,
): T[] {
  const activeFilters = Object.entries(filters)
    .map(([key, filter]) => [key, {
      ...filter,
      value: filter.value.trim().toLocaleLowerCase(),
    }] as const)
    .filter(([, filter]) => filter.value.length > 0);
  const filtered = rows.filter((row) => activeFilters.every(([key, filter]) => {
    const value = String(row[key] ?? "").trim().toLocaleLowerCase();
    return filter.mode === "contains"
      ? value.includes(filter.value)
      : value === filter.value;
  }));
  if (!sort) return filtered;
  return [...filtered].sort((left, right) => {
    const a = left[sort.key];
    const b = right[sort.key];
    const comparison = typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true });
    return sort.direction === "asc" ? comparison : -comparison;
  });
}
