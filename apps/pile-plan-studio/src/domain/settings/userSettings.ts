import { clampRightPanelSplit, DEFAULT_RIGHT_PANEL_SPLIT } from "../workspace/rightPanelLayout.ts";
import type { LegendItems, PileCostSettings, PileSizeExportFormat } from "../../core/projectTypes.ts";
import { reconcileProjectLegend } from "../../viewer/legend.ts";
import { updateLegendDefault } from "../legend/legendDefault.ts";
import { mergePileCostCatalog } from "../pile-plans/pileCostCatalog.ts";
import { editNamedDefaults, type NamedDefault, type NamedDefaultEdit } from "./namedDefaults.ts";
import { normalizePileOptionColumnLayouts, type PileOptionColumnLayouts } from "../pile-options/pileOptionColumnLayout.ts";
import { normalizeInterfaceScale } from "./interfaceScale.ts";
import { normalizeTheme, normalizeWorkspaceAppearance, type WorkspaceAppearance } from "./appearance.ts";
import {normalizeExportOptions} from "../exports/exportPreferences.ts";
import {DEFAULT_EXPORT_OPTIONS,type ExportOptions} from "../../core/exportRevisionContract.ts";
import { clampSelectionOverviewRows, DEFAULT_SELECTION_OVERVIEW_ROWS } from "../workspace/selectionOverviewLayout.ts";
import {
  clampExplorerWidth,
  clampRightPanelWidth,
  DEFAULT_EXPLORER_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
} from "../../viewer/panelLayout.ts";

export type UserLanguage = "auto" | "en" | "nl";

export const DEFAULT_ILP_SECTIONS = {
  optimize: true, limits: true, neighbors: false, result: false, saveAs: false, candidates: false, costLimits: false,
};
export type IlpSection = keyof typeof DEFAULT_ILP_SECTIONS;
export type IlpSections = Record<IlpSection, boolean>;

export type WorkspaceLayoutSettings = {
  explorerVisible: boolean;
  explorerWidth: number;
  propertiesVisible: boolean;
  propertiesWidth: number;
  propertiesSplitRatio: number;
  selectionOverviewRows: number;
  selectionOverviewCollapsed: boolean;
  inputSourcesExpanded: boolean;
  pilePlansExpanded: boolean;
};

export type UserSettings = {
  schemaVersion: 1;
  preferences: {
    language: UserLanguage;
    theme: string;
    workspaceAppearance: WorkspaceAppearance;
    interfaceScalePercent: number;
    defaultCurrencyCode: string;
    optimizationTimeLimitSeconds: number | null;
    pileSizeExportFormat: PileSizeExportFormat;
    pilePlanExportOptions: ExportOptions;
    workspaceLayout: WorkspaceLayoutSettings;
    ilpSections: IlpSections;
    pileOptionColumns: PileOptionColumnLayouts;
  };
  defaults: {
    costProfiles: NamedDefault<PileCostSettings>[];
    costImportDefaultName: string | null;
    legendProfiles: NamedDefault<LegendItems>[];
  };
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  schemaVersion: 1,
  preferences: {
    language: "auto",
    theme: "light",
    workspaceAppearance: "theme",
    interfaceScalePercent: 100,
    defaultCurrencyCode: "EUR",
    optimizationTimeLimitSeconds: 600,
    pileSizeExportFormat: "numeric",
    pilePlanExportOptions: DEFAULT_EXPORT_OPTIONS,
    ilpSections: { ...DEFAULT_ILP_SECTIONS },
    pileOptionColumns: normalizePileOptionColumnLayouts(undefined),
    workspaceLayout: {
      explorerVisible: true,
      explorerWidth: DEFAULT_EXPLORER_WIDTH,
      propertiesVisible: true,
      propertiesWidth: DEFAULT_RIGHT_PANEL_WIDTH,
      propertiesSplitRatio: DEFAULT_RIGHT_PANEL_SPLIT,
      selectionOverviewRows: DEFAULT_SELECTION_OVERVIEW_ROWS,
      selectionOverviewCollapsed: false,
      inputSourcesExpanded: true,
      pilePlansExpanded: true,
    },
  },
  defaults: { costProfiles: [], costImportDefaultName: null, legendProfiles: [] },
};

export function normalizeUserSettings(value: unknown): UserSettings {
  const root = isRecord(value) ? value : {};
  const preferences = isRecord(root.preferences) ? root.preferences : {};
  const workspace = isRecord(preferences.workspaceLayout) ? preferences.workspaceLayout : {};
  const defaults = isRecord(root.defaults) ? root.defaults : {};
  const defaultName = preferences.language === "nl" ? "Standaard" : "Default";
  const legacyCost = Array.isArray(defaults.costProfiles) ? null : normalizePileCostDefaults(defaults.pileCostCatalog);
  const costProfiles = legacyCost ? [{ name: defaultName, value: legacyCost }]
    : normalizeNamedDefaults(defaults.costProfiles, (item) => normalizePileCostDefaults(item.value));
  const legacyLegend = Array.isArray(defaults.legendProfiles) ? null : normalizeLegendAppearance(defaults.pileLegend);
  return {
    schemaVersion: 1,
    preferences: {
      language: preferences.language === "en" || preferences.language === "nl"
        ? preferences.language
        : "auto",
      theme: normalizeTheme(preferences.theme),
      workspaceAppearance: normalizeWorkspaceAppearance(preferences.workspaceAppearance),
      interfaceScalePercent: normalizeInterfaceScale(
        typeof preferences.interfaceScalePercent === "number"
          ? preferences.interfaceScalePercent
          : DEFAULT_USER_SETTINGS.preferences.interfaceScalePercent,
      ),
      defaultCurrencyCode: normalizeCurrencyCode(preferences.defaultCurrencyCode),
      optimizationTimeLimitSeconds: normalizeOptimizationTimeLimitSeconds(preferences.optimizationTimeLimitSeconds),
      pileSizeExportFormat: preferences.pileSizeExportFormat === "dimensions" ? "dimensions" : "numeric",
      pilePlanExportOptions: normalizeExportOptions(preferences.pilePlanExportOptions),
      ilpSections: normalizeIlpSections(preferences.ilpSections),
      pileOptionColumns: normalizePileOptionColumnLayouts(preferences.pileOptionColumns),
      workspaceLayout: {
        explorerVisible: booleanOr(workspace.explorerVisible, true),
        explorerWidth: clampExplorerWidth(numberOr(workspace.explorerWidth, DEFAULT_EXPLORER_WIDTH)),
        propertiesVisible: booleanOr(workspace.propertiesVisible, true),
        propertiesWidth: clampRightPanelWidth(numberOr(workspace.propertiesWidth, DEFAULT_RIGHT_PANEL_WIDTH)),
        propertiesSplitRatio: clampRightPanelSplit(numberOr(workspace.propertiesSplitRatio, DEFAULT_RIGHT_PANEL_SPLIT)),
        selectionOverviewRows: clampSelectionOverviewRows(numberOr(workspace.selectionOverviewRows, DEFAULT_SELECTION_OVERVIEW_ROWS)),
        selectionOverviewCollapsed: booleanOr(workspace.selectionOverviewCollapsed, false),
        inputSourcesExpanded: booleanOr(workspace.inputSourcesExpanded, true),
        pilePlansExpanded: booleanOr(workspace.pilePlansExpanded, true),
      },
    },
    defaults: {
      costProfiles,
      costImportDefaultName: legacyCost ? defaultName
        : costProfiles.find(({ name }) => name === defaults.costImportDefaultName)?.name ?? null,
      legendProfiles: legacyLegend ? [{ name: defaultName, value: legacyLegend }]
        : normalizeNamedDefaults(defaults.legendProfiles, (item) => normalizeLegendAppearance(item.value ?? item.appearance)),
    },
  };
}

export function normalizeOptimizationTimeLimitSeconds(value: unknown): number | null {
  return value === null ? null
    : typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7200 ? value : 600;
}

export function patchUserSettings(
  settings: UserSettings,
  patch: Partial<UserSettings["preferences"]>,
): UserSettings {
  return normalizeUserSettings({
    ...settings,
    preferences: { ...settings.preferences, ...patch },
  });
}

export function patchWorkspaceLayout(
  settings: UserSettings,
  patch: Partial<WorkspaceLayoutSettings>,
): UserSettings {
  return patchUserSettings(settings, {
    workspaceLayout: { ...settings.preferences.workspaceLayout, ...patch },
  });
}

export function patchCostProfiles(settings: UserSettings, edit: NamedDefaultEdit<PileCostSettings>): UserSettings | null {
  const current = settings.defaults;
  const costProfiles = editNamedDefaults(current.costProfiles, edit,
    (previous, next) => mergePileCostCatalog(previous, next, null, new Set()).catalog);
  if (!costProfiles) return null;
  let costImportDefaultName = current.costImportDefaultName;
  if (edit.kind === "save" && current.costProfiles.length === 0) {
    costImportDefaultName = costProfiles[0].name;
  } else if (edit.kind === "rename" && edit.name === costImportDefaultName) {
    costImportDefaultName = edit.nextName.trim();
  } else if (edit.kind === "delete" && edit.name === costImportDefaultName) {
    costImportDefaultName = null;
  }
  return normalizeUserSettings({
    ...settings,
    defaults: { ...current, costProfiles, costImportDefaultName },
  });
}

export function getCostImportDefault(settings: UserSettings): PileCostSettings | null {
  const { costProfiles, costImportDefaultName } = settings.defaults;
  return costProfiles.find(({ name }) => name === costImportDefaultName)?.value ?? null;
}

export function patchCostImportDefault(settings: UserSettings, costImportDefaultName: string | null): UserSettings {
  return normalizeUserSettings({
    ...settings,
    defaults: { ...settings.defaults, costImportDefaultName },
  });
}

export function patchLegendProfiles(settings: UserSettings, edit: NamedDefaultEdit<LegendItems>): UserSettings | null {
  const legendProfiles = editNamedDefaults(settings.defaults.legendProfiles, edit, updateLegendDefault);
  return legendProfiles && normalizeUserSettings({
    ...settings,
    defaults: { ...settings.defaults, legendProfiles },
  });
}

function normalizeNamedDefaults<T>(value: unknown, read: (item: Record<string, unknown>) => T | null): NamedDefault<T>[] {
  if (!Array.isArray(value)) return [];
  const names = new Set<string>();
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== "string") return [];
    const name = item.name.trim();
    const key = name.toLowerCase();
    if (!key || names.has(key)) return [];
    const value = read(item);
    if (value === null) return [];
    names.add(key);
    return [{ name, value }];
  });
}

function normalizeLegendAppearance(value: unknown): LegendItems | null {
  if (!isRecord(value) || !Array.isArray(value.pileSizes) || !Array.isArray(value.pileTipLevels)) return null;
  const { legend, warnings } = reconcileProjectLegend(value, []);
  return warnings.length === 0 ? legend : null;
}

function normalizeCurrencyCode(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_USER_SETTINGS.preferences.defaultCurrencyCode;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized)
    ? normalized
    : DEFAULT_USER_SETTINGS.preferences.defaultCurrencyCode;
}

function normalizeIlpSections(value: unknown): IlpSections {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_ILP_SECTIONS).map(([key, fallback]) =>
    [key, booleanOr(stored[key], fallback)],
  )) as IlpSections;
}

function normalizePileCostDefaults(value: unknown): PileCostSettings | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const items = value.items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const size = item.pile_size_mm;
    const cost = item.cost_per_m3;
    const shape = item.shape;
    if (!Number.isFinite(size) || !Number.isFinite(cost) || (shape !== "round" && shape !== "square")) {
      return [];
    }
    return [{
      pile_size_mm: Number(size),
      shape: shape as "round" | "square",
      cost_per_m3: Math.max(0, Number(cost)),
    }];
  });
  return { schema_version: 1, items };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
