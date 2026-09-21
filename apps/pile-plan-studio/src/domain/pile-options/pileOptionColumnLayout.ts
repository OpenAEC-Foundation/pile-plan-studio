import { getPileOptionColumns, type PileOptionTableColumn } from "./pileOptionTable.ts";

export type PileOptionColumnLayout = Array<{ key: PileOptionTableColumn; visible: boolean }>;
export type PileOptionColumnLayouts = { single: PileOptionColumnLayout; multiple: PileOptionColumnLayout };

export function defaultPileOptionColumnLayout(selectedCount: number): PileOptionColumnLayout {
  return getPileOptionColumns(selectedCount).map(({ key }) => ({ key, visible: true }));
}

export function normalizePileOptionColumnLayouts(value: unknown): PileOptionColumnLayouts {
  const layouts = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { single: normalizeLayout(layouts.single, 1), multiple: normalizeLayout(layouts.multiple, 2) };
}

function normalizeLayout(value: unknown, selectedCount: number): PileOptionColumnLayout {
  const defaults = defaultPileOptionColumnLayout(selectedCount);
  if (!Array.isArray(value)) return defaults;
  const result: PileOptionColumnLayout = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const column = defaults.find(({ key }) => key === item.key);
    if (!column || result.some(({ key }) => key === column.key)) continue;
    result.push({ key: column.key, visible: item.visible !== false });
  }
  for (const column of defaults) {
    if (!result.some(({ key }) => key === column.key)) result.push(column);
  }
  if (!result.some(({ visible }) => visible)) return defaults;
  return result;
}

export function getVisiblePileOptionColumns(selectedCount: number, layout: PileOptionColumnLayout) {
  const available = getPileOptionColumns(selectedCount);
  return layout.filter(({ visible }) => visible).flatMap(({ key }) => {
    const column = available.find(column => column.key === key);
    return column ? [column] : [];
  });
}

export function movePileOptionColumn(layout: PileOptionColumnLayout, key: PileOptionTableColumn, targetKey: PileOptionTableColumn): PileOptionColumnLayout {
  const index = layout.findIndex(column => column.key === key);
  const target = layout.findIndex(column => column.key === targetKey);
  if (index < 0 || target < 0 || index === target) return layout;
  const next = [...layout];
  const [column] = next.splice(index, 1);
  next.splice(target, 0, column);
  return next;
}

export function setPileOptionColumnVisible(layout: PileOptionColumnLayout, key: PileOptionTableColumn, visible: boolean): PileOptionColumnLayout {
  const next = layout.map(column => column.key === key ? { ...column, visible } : column);
  return next.some(column => column.visible) ? next : layout;
}
