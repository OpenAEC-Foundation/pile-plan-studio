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
