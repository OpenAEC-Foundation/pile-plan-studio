import type {
  BearingCapacity,
  LegendEncodingMode,
  LegendItems,
  PileSymbol,
} from "../core/projectTypes.ts";
import {
  assignLegendColors,
  assignLegendSymbols,
  refreshAutomaticLegendColors,
  refreshAutomaticLegendSymbols,
  resetLegendAppearance,
  type LegendValueKind,
} from "../viewer/legend.ts";
import type { LegendColorScheme } from "../viewer/legendColors.ts";
import type { ActivePileConfigurations } from "./activePileConfigurations.ts";

export type LegendEditorBulkAction = "enable-all" | "enable-used" | "disable-all";
export type LegendEditorItemKind = "size" | "tip";
export type LegendAppearanceProperty = "symbol" | "color";

export type LegendEditorDraft = {
  active: ActivePileConfigurations;
  legend: LegendItems;
};

export type LegendEditorActionResult =
  | { ok: true; draft: LegendEditorDraft }
  | { ok: false; draft: LegendEditorDraft; error: "catalog-exhausted"; limit: 54 };

export function createLegendEditorDraft(
  active: ActivePileConfigurations,
  legend: LegendItems,
): LegendEditorDraft {
  return {
    active: copyConfigurations(active),
    legend: copyLegend(legend),
  };
}

export function setLegendEditorItemEnabled(
  draft: LegendEditorDraft,
  kind: LegendEditorItemKind,
  value: number,
  enabled: boolean,
): LegendEditorDraft {
  const key = activeKey(kind);
  const current = draft.active[key];
  const values = enabled
    ? current.includes(value) ? current : sortValues([...current, value], kind)
    : current.filter((item) => item !== value);
  return { ...draft, active: { ...draft.active, [key]: values } };
}

export function toggleLegendEditorItem(
  draft: LegendEditorDraft,
  kind: LegendEditorItemKind,
  value: number,
): LegendEditorDraft {
  const enabled = draft.active[activeKey(kind)].includes(value);
  return setLegendEditorItemEnabled(draft, kind, value, !enabled);
}

export function updateLegendSymbol(
  draft: LegendEditorDraft,
  kind: LegendEditorItemKind,
  value: number,
  symbol: PileSymbol,
): LegendEditorDraft {
  return updateStyle(draft, kind, value, (item) => ({
    ...item,
    symbol: { ...symbol },
    symbolAutomatic: false,
  }));
}

export function updateLegendColor(
  draft: LegendEditorDraft,
  kind: LegendEditorItemKind,
  value: number,
  color: string,
): LegendEditorDraft {
  return updateStyle(draft, kind, value, (item) => ({
    ...item,
    color: color.toUpperCase(),
    colorAutomatic: false,
  }));
}

export function setLegendEncodingMode(
  draft: LegendEditorDraft,
  encodingMode: LegendEncodingMode,
  included: ActivePileConfigurations,
): LegendEditorActionResult {
  return refreshAutomaticMappings({ ...draft, legend: { ...draft.legend, encodingMode } }, included);
}

export function setLegendColorScheme(
  draft: LegendEditorDraft,
  colorScheme: LegendColorScheme,
  includedValues: number[],
): LegendEditorDraft {
  const legend = { ...draft.legend, colorScheme };
  const colorKind = legend.encodingMode === "size-symbol" ? "tip" : "size";
  return {
    ...draft,
    legend: refreshAutomaticLegendColors(legend, legendKey(colorKind), includedValues),
  };
}

export function applyLegendEditorBulkAction(
  draft: LegendEditorDraft,
  action: LegendEditorBulkAction,
  available: ActivePileConfigurations,
  used: ActivePileConfigurations,
): LegendEditorDraft {
  const active = action === "disable-all"
    ? { pileSizes: [], pileTipLevels: [] }
    : copyConfigurations(action === "enable-used" ? used : available);
  return { ...draft, active };
}

export function applyAutomaticSymbols(
  draft: LegendEditorDraft,
  kind: LegendEditorItemKind,
  includedValues: number[],
): LegendEditorActionResult {
  const valueKind = legendKey(kind);
  const result = assignLegendSymbols(draft.legend, valueKind, includedValues);
  return result.ok
    ? { ok: true, draft: { ...draft, legend: result.legend } }
    : { ok: false, draft, error: result.reason, limit: result.limit };
}

export function applyAutomaticColors(
  draft: LegendEditorDraft,
  kind: LegendEditorItemKind,
  includedValues: number[],
): LegendEditorDraft {
  return {
    ...draft,
    legend: assignLegendColors(
      draft.legend,
      legendKey(kind),
      includedValues,
      draft.legend.colorScheme,
    ),
  };
}

export function wouldReassignLegendAppearance(
  draft: LegendEditorDraft,
  kind: LegendEditorItemKind,
  property: LegendAppearanceProperty,
  includedValues: number[],
): boolean {
  const assigned = property === "symbol"
    ? applyAutomaticSymbols(draft, kind, includedValues)
    : { ok: true as const, draft: applyAutomaticColors(draft, kind, includedValues) };
  if (!assigned.ok) return true;

  const key = legendKey(kind);
  const assignedByValue = new Map(assigned.draft.legend[key].map((item) => [item.value, item]));
  return draft.legend[key].some((item) => {
    const next = assignedByValue.get(item.value);
    if (!next) return false;
    return property === "symbol"
      ? item.symbolAutomatic !== next.symbolAutomatic
        || item.symbol.baseShape !== next.symbol.baseShape
        || item.symbol.fillPattern !== next.symbol.fillPattern
      : item.colorAutomatic !== next.colorAutomatic || item.color !== next.color;
  });
}

export function resetLegendEditorAppearance(
  draft: LegendEditorDraft,
  bearingCapacities: BearingCapacity[],
): LegendEditorDraft {
  return {
    ...draft,
    legend: resetLegendAppearance(draft.legend, bearingCapacities),
  };
}

function refreshAutomaticMappings(
  draft: LegendEditorDraft,
  included: ActivePileConfigurations,
): LegendEditorActionResult {
  const symbolKind: LegendEditorItemKind = draft.legend.encodingMode === "size-symbol" ? "size" : "tip";
  const colorKind: LegendEditorItemKind = symbolKind === "size" ? "tip" : "size";
  const colors = refreshAutomaticLegendColors(
    draft.legend,
    legendKey(colorKind),
    included[activeKey(colorKind)],
  );
  const symbols = refreshAutomaticLegendSymbols(
    colors,
    legendKey(symbolKind),
    included[activeKey(symbolKind)],
  );
  return symbols.ok
    ? { ok: true, draft: { ...draft, legend: symbols.legend } }
    : { ok: false, draft: { ...draft, legend: colors }, error: symbols.reason, limit: symbols.limit };
}

function updateStyle(
  draft: LegendEditorDraft,
  kind: LegendEditorItemKind,
  value: number,
  update: (item: LegendItems["pileSizes"][number]) => LegendItems["pileSizes"][number],
): LegendEditorDraft {
  const key = legendKey(kind);
  return {
    ...draft,
    legend: {
      ...draft.legend,
      [key]: draft.legend[key].map((item) => item.value === value ? update(item) : item),
    },
  };
}

function activeKey(kind: LegendEditorItemKind): keyof ActivePileConfigurations {
  return kind === "size" ? "pileSizes" : "pileTipLevels";
}

function legendKey(kind: LegendEditorItemKind): LegendValueKind {
  return kind === "size" ? "pileSizes" : "pileTipLevels";
}

function sortValues(values: number[], kind: LegendEditorItemKind): number[] {
  return values.sort((left, right) => kind === "tip" ? right - left : left - right);
}

function copyConfigurations(configurations: ActivePileConfigurations): ActivePileConfigurations {
  return {
    pileSizes: [...configurations.pileSizes],
    pileTipLevels: [...configurations.pileTipLevels],
  };
}

function copyLegend(legend: LegendItems): LegendItems {
  return {
    encodingMode: legend.encodingMode,
    colorScheme: legend.colorScheme,
    pileSizes: legend.pileSizes.map((item) => ({ ...item, symbol: { ...item.symbol } })),
    pileTipLevels: legend.pileTipLevels.map((item) => ({ ...item, symbol: { ...item.symbol } })),
  };
}
