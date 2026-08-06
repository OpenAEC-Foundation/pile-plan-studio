import type {
  BearingCapacity,
  LegendEncodingMode,
  LegendItems,
  LegendValueStyle,
  PileConfigurationOption,
  PileConfigurationStyle,
  PileSymbol,
} from "../core/projectTypes.ts";
import {
  generateLegendColors,
  type LegendColorScheme,
} from "./legendColors.ts";
import {
  isPileBaseShape,
  isPileFillPattern,
  PILE_SYMBOL_CATALOG,
} from "./legendSymbols.ts";

export type LegendValueKind = "pileSizes" | "pileTipLevels";

export type LegendImportWarning = {
  itemType: "size" | "tipLevel" | "encodingMode";
  value?: number;
  field: "encodingMode" | "symbol" | "color";
};

export type LegendReconciliationResult = {
  legend: LegendItems;
  warnings: LegendImportWarning[];
};

const FALLBACK_SYMBOL: PileSymbol = { baseShape: "circle", fillPattern: "full" };
const FALLBACK_COLOR = "#8C989F";
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function createBuiltInLegend(bearingCapacities: BearingCapacity[]): LegendItems {
  return createBuiltInLegendForValues(
    uniqueSorted(bearingCapacities.map(({ pile_size_mm }) => pile_size_mm), false),
    uniqueSorted(bearingCapacities.map(({ pile_tip_level_m }) => pile_tip_level_m), true),
  );
}

// Kept as a temporary compatibility export while visual consumers migrate.
export const getLegendItems = createBuiltInLegend;

export function reconcileProjectLegend(
  stored: unknown,
  bearingCapacities: BearingCapacity[],
): LegendReconciliationResult {
  const raw = isRecord(stored) ? stored : null;
  const rawSizes = readRawStyles(raw?.pileSizes);
  const rawTips = readRawStyles(raw?.pileTipLevels);
  const sizeValues = uniqueSorted([
    ...bearingCapacities.map(({ pile_size_mm }) => pile_size_mm),
    ...rawSizes.map(({ value }) => value),
  ], false);
  const tipValues = uniqueSorted([
    ...bearingCapacities.map(({ pile_tip_level_m }) => pile_tip_level_m),
    ...rawTips.map(({ value }) => value),
  ], true);
  const defaults = createBuiltInLegendForValues(sizeValues, tipValues);

  if (raw === null) return { legend: defaults, warnings: [] };

  const warnings: LegendImportWarning[] = [];
  const encodingMode = normalizeEncodingMode(raw.encodingMode, warnings);
  return {
    legend: {
      encodingMode,
      pileSizes: normalizeStyles(rawSizes, defaults.pileSizes, "size", warnings),
      pileTipLevels: normalizeStyles(rawTips, defaults.pileTipLevels, "tipLevel", warnings),
    },
    warnings,
  };
}

export function getConfigurationStyle(
  configuration: Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m">,
  legend: LegendItems,
): PileConfigurationStyle {
  const sizeStyle = legend.pileSizes.find(({ value }) => value === configuration.pile_size_mm);
  const tipStyle = legend.pileTipLevels.find(({ value }) => value === configuration.pile_tip_level_m);
  return legend.encodingMode === "tip-symbol"
    ? {
        symbol: tipStyle?.symbol ?? FALLBACK_SYMBOL,
        color: sizeStyle?.color ?? FALLBACK_COLOR,
      }
    : {
        symbol: sizeStyle?.symbol ?? FALLBACK_SYMBOL,
        color: tipStyle?.color ?? FALLBACK_COLOR,
      };
}

export function assignLegendSymbols(
  legend: LegendItems,
  kind: LegendValueKind,
  includedValues: Iterable<number>,
): { ok: true; legend: LegendItems } | { ok: false; reason: "catalog-exhausted"; limit: 54 } {
  const values = uniqueSorted(includedValues, kind === "pileTipLevels");
  if (values.length > PILE_SYMBOL_CATALOG.length) {
    return { ok: false, reason: "catalog-exhausted", limit: 54 };
  }
  const assignments = new Map(values.map((value, index) => [value, PILE_SYMBOL_CATALOG[index]]));
  return {
    ok: true,
    legend: updateLegendStyles(legend, kind, (item) => {
      const symbol = assignments.get(item.value);
      return symbol ? { ...item, symbol } : item;
    }),
  };
}

export function assignLegendColors(
  legend: LegendItems,
  kind: LegendValueKind,
  includedValues: Iterable<number>,
  scheme: LegendColorScheme,
): LegendItems {
  const values = uniqueSorted(includedValues, kind === "pileTipLevels");
  const colors = generateLegendColors(scheme, values.length);
  const assignments = new Map(values.map((value, index) => [value, colors[index]]));
  return updateLegendStyles(legend, kind, (item) => {
    const color = assignments.get(item.value);
    return color ? { ...item, color } : item;
  });
}

export function resetLegendAppearance(
  legend: LegendItems,
  bearingCapacities: BearingCapacity[],
): LegendItems {
  const sizeValues = uniqueSorted([
    ...legend.pileSizes.map(({ value }) => value),
    ...bearingCapacities.map(({ pile_size_mm }) => pile_size_mm),
  ], false);
  const tipValues = uniqueSorted([
    ...legend.pileTipLevels.map(({ value }) => value),
    ...bearingCapacities.map(({ pile_tip_level_m }) => pile_tip_level_m),
  ], true);
  return createBuiltInLegendForValues(sizeValues, tipValues);
}

function createBuiltInLegendForValues(pileSizes: number[], pileTipLevels: number[]): LegendItems {
  const sizeColors = generateLegendColors("distinct", pileSizes.length);
  const tipColors = generateLegendColors("distinct", pileTipLevels.length);
  return {
    encodingMode: "size-symbol",
    pileSizes: pileSizes.map((value, index) => ({
      value,
      symbol: { ...PILE_SYMBOL_CATALOG[index % PILE_SYMBOL_CATALOG.length] },
      color: sizeColors[index],
    })),
    pileTipLevels: pileTipLevels.map((value, index) => ({
      value,
      symbol: { ...PILE_SYMBOL_CATALOG[index % PILE_SYMBOL_CATALOG.length] },
      color: tipColors[index],
    })),
  };
}

function normalizeEncodingMode(
  value: unknown,
  warnings: LegendImportWarning[],
): LegendEncodingMode {
  if (value === "size-symbol" || value === "tip-symbol") return value;
  warnings.push({ itemType: "encodingMode", field: "encodingMode" });
  return "size-symbol";
}

function normalizeStyles(
  rawStyles: RawLegendStyle[],
  defaults: LegendValueStyle[],
  itemType: "size" | "tipLevel",
  warnings: LegendImportWarning[],
): LegendValueStyle[] {
  const byValue = new Map(rawStyles.map((item) => [item.value, item]));
  return defaults.map((fallback) => {
    const raw = byValue.get(fallback.value);
    if (!raw) return fallback;

    let symbol = fallback.symbol;
    if (isRecord(raw.symbol)
      && isPileBaseShape(raw.symbol.baseShape)
      && isPileFillPattern(raw.symbol.fillPattern)) {
      symbol = { baseShape: raw.symbol.baseShape, fillPattern: raw.symbol.fillPattern };
    } else {
      warnings.push({ itemType, value: fallback.value, field: "symbol" });
    }

    let color = fallback.color;
    if (typeof raw.color === "string" && HEX_COLOR.test(raw.color)) {
      color = raw.color.toUpperCase();
    } else {
      warnings.push({ itemType, value: fallback.value, field: "color" });
    }
    return { value: fallback.value, symbol, color };
  });
}

type RawLegendStyle = { value: number; symbol: unknown; color: unknown };

function readRawStyles(value: unknown): RawLegendStyle[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.value !== "number" || !Number.isFinite(item.value) || seen.has(item.value)) {
      return [];
    }
    seen.add(item.value);
    return [{ value: item.value, symbol: item.symbol, color: item.color }];
  });
}

function updateLegendStyles(
  legend: LegendItems,
  kind: LegendValueKind,
  update: (item: LegendValueStyle) => LegendValueStyle,
): LegendItems {
  return { ...legend, [kind]: legend[kind].map(update) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueSorted(values: Iterable<number>, descending: boolean): number[] {
  return [...new Set(values)].sort((left, right) => descending ? right - left : left - right);
}
