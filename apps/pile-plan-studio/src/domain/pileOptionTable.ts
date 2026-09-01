export type PileOptionTableColumn =
  | "symbol"
  | "size"
  | "tip"
  | "status"
  | "cost"
  | "totalCost"
  | "use"
  | "maxUse"
  | "governing"
  | "frd"
  | "criticalLoadPoint";

export type PileOptionTableRow = {
  key: string;
  symbolLabel: string;
  sizeValue: number;
  sizeLabel: string;
  tipValue: number;
  tipLabel: string;
  statusLabel: string;
  costValue: number | null;
  costLabel: string;
  totalCostValue: number | null;
  totalCostLabel: string;
  useValue: number | null;
  useLabel: string;
  maxUseValue: number | null;
  maxUseLabel: string;
  governingLabel: string;
  frdValue: number | null;
  frdLabel: string;
  criticalLoadPointId: number | null;
  criticalLoadPointLabel: string;
};

export type PileOptionSortState = {
  column: SortablePileOptionTableColumn;
  direction: "asc" | "desc";
} | null;

export type PileOptionFilterState = Partial<Record<PileOptionTableColumn, string[]>>;
export type SortablePileOptionTableColumn = Exclude<PileOptionTableColumn, "symbol">;

const SINGLE_PILE_OPTION_COLUMNS: Array<{ key: PileOptionTableColumn; label: string }> = [
  { key: "symbol", label: "Symbol" },
  { key: "size", label: "Size" },
  { key: "tip", label: "Tip" },
  { key: "status", label: "Status" },
  { key: "cost", label: "Cost" },
  { key: "use", label: "Use" },
  { key: "governing", label: "Governing" },
  { key: "frd", label: "R_c;net;d min" },
];
const MULTI_PILE_OPTION_COLUMNS: Array<{ key: PileOptionTableColumn; label: string }> = [
  { key: "symbol", label: "Symbol" },
  { key: "size", label: "Size" },
  { key: "tip", label: "Tip" },
  { key: "status", label: "Status" },
  { key: "totalCost", label: "Total cost" },
  { key: "maxUse", label: "Max use" },
  { key: "criticalLoadPoint", label: "Critical load point" },
];
const ALL_PILE_OPTION_COLUMNS = [...SINGLE_PILE_OPTION_COLUMNS, ...MULTI_PILE_OPTION_COLUMNS]
  .filter((column, index, columns) => columns.findIndex(({ key }) => key === column.key) === index);

export function getPileOptionColumns(
  selectedLoadPointCount: number,
): Array<{ key: PileOptionTableColumn; label: string }> {
  return selectedLoadPointCount > 1 ? MULTI_PILE_OPTION_COLUMNS : SINGLE_PILE_OPTION_COLUMNS;
}

export const SORTABLE_PILE_OPTION_COLUMNS: Array<{ key: SortablePileOptionTableColumn; label: string }> =
  ALL_PILE_OPTION_COLUMNS.filter(
    (column): column is { key: SortablePileOptionTableColumn; label: string } => column.key !== "symbol",
  );
export const FILTERABLE_PILE_OPTION_COLUMNS = SORTABLE_PILE_OPTION_COLUMNS;

export function createEmptyPileOptionFilters(): PileOptionFilterState {
  return {
    cost: [],
    totalCost: [],
    frd: [],
    governing: [],
    size: [],
    status: [],
    symbol: [],
    tip: [],
    use: [],
    maxUse: [],
    criticalLoadPoint: [],
  };
}

export function getNextPileOptionSortState(
  current: PileOptionSortState,
  column: SortablePileOptionTableColumn,
): PileOptionSortState {
  if (current?.column !== column) {
    return { column, direction: "asc" };
  }

  return current.direction === "asc" ? { column, direction: "desc" } : null;
}

export function getPileOptionTableRows<T extends PileOptionTableRow>(
  rows: T[],
  filters: PileOptionFilterState,
  sort: PileOptionSortState,
): T[] {
  const normalizedFilters = Object.entries(filters)
    .map(([column, values]) => [
      column as PileOptionTableColumn,
      (values ?? []).map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0),
    ] as const)
    .filter(([, values]) => values.length > 0);

  const filteredRows = rows.filter((row) =>
    normalizedFilters.every(([column, values]) => values.includes(getFilterText(row, column).toLowerCase())),
  );

  if (!sort) {
    return filteredRows;
  }

  return [...filteredRows].sort((left, right) => {
    const comparison = compareRows(left, right, sort.column);
    return sort.direction === "asc" ? comparison : -comparison;
  });
}

export function getPileOptionFilterValues(
  rows: PileOptionTableRow[],
  column: SortablePileOptionTableColumn,
): string[] {
  return [...new Set(rows.map((row) => getFilterText(row, column)).filter((value) => value.length > 0))].sort((left, right) =>
    left.localeCompare(right, "en-US", { numeric: true }),
  );
}

function getFilterText(row: PileOptionTableRow, column: PileOptionTableColumn): string {
  switch (column) {
    case "symbol":
      return row.symbolLabel;
    case "size":
      return row.sizeLabel;
    case "tip":
      return row.tipLabel;
    case "status":
      return row.statusLabel;
    case "cost":
      return row.costLabel;
    case "totalCost":
      return row.totalCostLabel;
    case "use":
      return row.useLabel;
    case "maxUse":
      return row.maxUseLabel;
    case "governing":
      return row.governingLabel;
    case "frd":
      return row.frdLabel;
    case "criticalLoadPoint":
      return row.criticalLoadPointLabel;
  }
}

function compareRows(left: PileOptionTableRow, right: PileOptionTableRow, column: PileOptionTableColumn): number {
  switch (column) {
    case "symbol":
      return compareNumbers(left.sizeValue, right.sizeValue) || compareNumbers(left.tipValue, right.tipValue);
    case "size":
      return compareNumbers(left.sizeValue, right.sizeValue);
    case "tip":
      return compareNumbers(left.tipValue, right.tipValue);
    case "status":
      return compareText(left.statusLabel, right.statusLabel);
    case "cost":
      return compareOptionalNumbers(left.costValue, right.costValue);
    case "totalCost":
      return compareOptionalNumbers(left.totalCostValue, right.totalCostValue);
    case "use":
      return compareOptionalNumbers(left.useValue, right.useValue);
    case "maxUse":
      return compareOptionalNumbers(left.maxUseValue, right.maxUseValue);
    case "governing":
      return compareText(left.governingLabel, right.governingLabel);
    case "frd":
      return compareOptionalNumbers(left.frdValue, right.frdValue);
    case "criticalLoadPoint":
      return compareText(left.criticalLoadPointLabel, right.criticalLoadPointLabel);
  }
}

function compareOptionalNumbers(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }

  return compareNumbers(left, right);
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en-US", { numeric: true });
}
