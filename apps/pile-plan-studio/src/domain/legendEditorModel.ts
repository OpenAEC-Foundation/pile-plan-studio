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

export type LegendAssignmentScope = "enabled" | "all";
export type LegendEditorBulkAction = "enable-all" | "enable-used" | "disable-all";
export type LegendEditorItemKind = "size" | "tip";

export type LegendEditorDraft = {
  active: ActivePileConfigurations;
  legend: LegendItems;
  assignmentScope: LegendAssignmentScope;
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
    assignmentScope: "enabled",
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
): LegendEditorActionResult {
  return refreshAutomaticMappings({ ...draft, legend: { ...draft.legend, encodingMode } });
}

export function setLegendAssignmentScope(
  draft: LegendEditorDraft,
  assignmentScope: LegendAssignmentScope,
): LegendEditorActionResult {
  return refreshAutomaticMappings({ ...draft, assignmentScope });
}

export function setLegendColorScheme(
  draft: LegendEditorDraft,
  colorScheme: LegendColorScheme,
): LegendEditorDraft {
  const legend = { ...draft.legend, colorScheme };
  const colorKind = legend.encodingMode === "size-symbol" ? "tip" : "size";
  return {
    ...draft,
    legend: refreshAutomaticLegendColors(legend, legendKey(colorKind), scopedValues(draft, colorKind)),
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
): LegendEditorActionResult {
  const valueKind = legendKey(kind);
  const result = assignLegendSymbols(draft.legend, valueKind, scopedValues(draft, kind));
  return result.ok
    ? { ok: true, draft: { ...draft, legend: result.legend } }
    : { ok: false, draft, error: result.reason, limit: result.limit };
}

export function applyAutomaticColors(
  draft: LegendEditorDraft,
  kind: LegendEditorItemKind,
): LegendEditorDraft {
  return {
    ...draft,
    legend: assignLegendColors(
      draft.legend,
      legendKey(kind),
      scopedValues(draft, kind),
      draft.legend.colorScheme,
    ),
  };
}

export function resetLegendEditorAppearance(
  draft: LegendEditorDraft,
  bearingCapacities: BearingCapacity[],
): LegendEditorDraft {
  return { ...draft, legend: resetLegendAppearance(draft.legend, bearingCapacities) };
}

function scopedValues(draft: LegendEditorDraft, kind: LegendEditorItemKind): number[] {
  return draft.assignmentScope === "all"
    ? draft.legend[legendKey(kind)].map(({ value }) => value)
    : draft.active[activeKey(kind)];
}

function refreshAutomaticMappings(draft: LegendEditorDraft): LegendEditorActionResult {
  const symbolKind: LegendEditorItemKind = draft.legend.encodingMode === "size-symbol" ? "size" : "tip";
  const colorKind: LegendEditorItemKind = symbolKind === "size" ? "tip" : "size";
  const colors = refreshAutomaticLegendColors(
    draft.legend,
    legendKey(colorKind),
    scopedValues(draft, colorKind),
  );
  const symbols = refreshAutomaticLegendSymbols(
    colors,
    legendKey(symbolKind),
    scopedValues(draft, symbolKind),
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
