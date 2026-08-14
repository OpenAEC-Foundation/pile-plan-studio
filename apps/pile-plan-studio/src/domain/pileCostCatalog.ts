import type {
  PileCostSettings,
  PileCostSettingsItem,
} from "../core/projectTypes.ts";

export type PileCostCatalogPartition = {
  used: PileCostSettingsItem[];
  missingSizes: number[];
  other: PileCostSettingsItem[];
};

export type CostCatalogMergeResult = {
  catalog: PileCostSettings;
  unresolvedUsedSizes: number[];
  skippedRows: Array<{ pileSizeMm: number | null; reason: string }>;
};

export function validatePileCostItem(item: unknown): string | null {
  if (!isRecord(item)) return "Cost row must be an object.";
  if (!Number.isFinite(item.pile_size_mm) || Number(item.pile_size_mm) <= 0) {
    return "Pile size must be a positive number.";
  }
  if (item.shape !== "round" && item.shape !== "square") {
    return "Pile shape must be round or square.";
  }
  if (!Number.isFinite(item.cost_per_m3) || Number(item.cost_per_m3) < 0) {
    return "Cost per m3 must be a non-negative number.";
  }
  return null;
}

export function addPileCostItem(
  catalog: PileCostSettings,
  item: PileCostSettingsItem,
): PileCostSettings {
  assertValid(item);
  if (catalog.items.some((current) => current.pile_size_mm === item.pile_size_mm)) {
    throw new Error("Pile size must be unique.");
  }
  return withSortedItems(catalog, [...catalog.items, item]);
}

export function updatePileCostItem(
  catalog: PileCostSettings,
  pileSizeMm: number,
  patch: Partial<PileCostSettingsItem>,
): PileCostSettings {
  const index = catalog.items.findIndex((item) => item.pile_size_mm === pileSizeMm);
  if (index < 0) return catalog;
  const nextItem = { ...catalog.items[index], ...patch };
  assertValid(nextItem);
  if (nextItem.pile_size_mm !== pileSizeMm
    && catalog.items.some((item) => item.pile_size_mm === nextItem.pile_size_mm)) {
    throw new Error("Pile size must be unique.");
  }
  const items = catalog.items.map((item, itemIndex) => itemIndex === index ? nextItem : item);
  return withSortedItems(catalog, items);
}

export function removePileCostItem(
  catalog: PileCostSettings,
  pileSizeMm: number,
  usedPileSizes: ReadonlySet<number>,
): PileCostSettings {
  if (usedPileSizes.has(pileSizeMm)) {
    throw new Error("A pile size that is in use cannot be removed.");
  }
  const items = catalog.items.filter((item) => item.pile_size_mm !== pileSizeMm);
  return items.length === catalog.items.length ? catalog : { ...catalog, items };
}

export function partitionPileCostItems(
  catalog: PileCostSettings,
  usedPileSizes: ReadonlySet<number>,
): PileCostCatalogPartition {
  const sortedItems = [...catalog.items].sort(comparePileSize);
  const used = sortedItems.filter((item) => usedPileSizes.has(item.pile_size_mm));
  const presentSizes = new Set(sortedItems.map((item) => item.pile_size_mm));
  return {
    used,
    missingSizes: [...usedPileSizes].filter((size) => !presentSizes.has(size)).sort((a, b) => a - b),
    other: sortedItems.filter((item) => !usedPileSizes.has(item.pile_size_mm)),
  };
}

export function mergePileCostCatalog(
  current: PileCostSettings,
  preferred: PileCostSettings | null,
  builtIn: PileCostSettings | null,
  usedPileSizes: ReadonlySet<number>,
): CostCatalogMergeResult {
  const skippedRows: CostCatalogMergeResult["skippedRows"] = [];
  const bySize = new Map<number, PileCostSettingsItem>();
  addValidRows(bySize, current.items, "project", skippedRows, false);
  addValidRows(bySize, builtIn?.items ?? [], "built-in", skippedRows, false);
  addValidRows(bySize, preferred?.items ?? [], "personal", skippedRows, true);
  const items = [...bySize.values()].sort(comparePileSize);
  const availableSizes = new Set(items.map((item) => item.pile_size_mm));
  return {
    catalog: { ...current, items },
    unresolvedUsedSizes: [...usedPileSizes]
      .filter((size) => !availableSizes.has(size))
      .sort((a, b) => a - b),
    skippedRows,
  };
}

export function applyPileCostCatalogDefault(
  current: PileCostSettings,
  preferred: PileCostSettings,
  usedPileSizes: ReadonlySet<number>,
): CostCatalogMergeResult {
  const skippedRows: CostCatalogMergeResult["skippedRows"] = [];
  const bySize = new Map<number, PileCostSettingsItem>();
  addValidRows(bySize, preferred.items, "default", skippedRows, true);

  for (const item of current.items) {
    if (!usedPileSizes.has(item.pile_size_mm) || bySize.has(item.pile_size_mm)) continue;
    addValidRows(bySize, [item], "project", skippedRows, false);
  }

  const items = [...bySize.values()].sort(comparePileSize);
  const availableSizes = new Set(items.map((item) => item.pile_size_mm));
  return {
    catalog: { ...current, items },
    unresolvedUsedSizes: [...usedPileSizes]
      .filter((size) => !availableSizes.has(size))
      .sort((a, b) => a - b),
    skippedRows,
  };
}

function addValidRows(
  destination: Map<number, PileCostSettingsItem>,
  rows: PileCostSettingsItem[],
  source: string,
  skippedRows: CostCatalogMergeResult["skippedRows"],
  overwrite: boolean,
): void {
  for (const row of rows) {
    const reason = validatePileCostItem(row);
    if (reason) {
      skippedRowsPush(row, source, reason);
      continue;
    }
    if (overwrite || !destination.has(row.pile_size_mm)) destination.set(row.pile_size_mm, row);
  }

  function skippedRowsPush(row: PileCostSettingsItem, rowSource: string, reason: string) {
    skippedRows.push({
      pileSizeMm: Number.isFinite(row?.pile_size_mm) ? Number(row.pile_size_mm) : null,
      reason: `${rowSource}: ${reason}`,
    });
  }
}

function assertValid(item: PileCostSettingsItem): void {
  const reason = validatePileCostItem(item);
  if (reason) throw new Error(reason);
}

function withSortedItems(catalog: PileCostSettings, items: PileCostSettingsItem[]): PileCostSettings {
  return { ...catalog, items: [...items].sort(comparePileSize) };
}

function comparePileSize(left: PileCostSettingsItem, right: PileCostSettingsItem): number {
  return left.pile_size_mm - right.pile_size_mm;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
