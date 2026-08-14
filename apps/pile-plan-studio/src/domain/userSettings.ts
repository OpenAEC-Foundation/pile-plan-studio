import type { PileCostSettings } from "../core/projectTypes.ts";
import { normalizeInterfaceScale } from "./interfaceScale.ts";
import {
  clampExplorerWidth,
  clampRightPanelWidth,
  DEFAULT_EXPLORER_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
} from "../viewer/panelLayout.ts";

export type UserLanguage = "auto" | "en" | "nl";

export type WorkspaceLayoutSettings = {
  explorerVisible: boolean;
  explorerWidth: number;
  propertiesVisible: boolean;
  propertiesWidth: number;
  inputSourcesExpanded: boolean;
  pilePlansExpanded: boolean;
};

export type UserSettings = {
  schemaVersion: 1;
  preferences: {
    language: UserLanguage;
    theme: string;
    interfaceScalePercent: number;
    defaultCurrencyCode: string;
    workspaceLayout: WorkspaceLayoutSettings;
  };
  defaults: {
    pileCostCatalog: PileCostSettings | null;
  };
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  schemaVersion: 1,
  preferences: {
    language: "auto",
    theme: "light",
    interfaceScalePercent: 100,
    defaultCurrencyCode: "EUR",
    workspaceLayout: {
      explorerVisible: true,
      explorerWidth: DEFAULT_EXPLORER_WIDTH,
      propertiesVisible: true,
      propertiesWidth: DEFAULT_RIGHT_PANEL_WIDTH,
      inputSourcesExpanded: true,
      pilePlansExpanded: true,
    },
  },
  defaults: { pileCostCatalog: null },
};

export function normalizeUserSettings(value: unknown): UserSettings {
  const root = isRecord(value) ? value : {};
  const preferences = isRecord(root.preferences) ? root.preferences : {};
  const workspace = isRecord(preferences.workspaceLayout) ? preferences.workspaceLayout : {};
  const defaults = isRecord(root.defaults) ? root.defaults : {};
  return {
    schemaVersion: 1,
    preferences: {
      language: preferences.language === "en" || preferences.language === "nl"
        ? preferences.language
        : "auto",
      theme: typeof preferences.theme === "string" && preferences.theme.trim()
        ? preferences.theme
        : DEFAULT_USER_SETTINGS.preferences.theme,
      interfaceScalePercent: normalizeInterfaceScale(
        typeof preferences.interfaceScalePercent === "number"
          ? preferences.interfaceScalePercent
          : DEFAULT_USER_SETTINGS.preferences.interfaceScalePercent,
      ),
      defaultCurrencyCode: normalizeCurrencyCode(preferences.defaultCurrencyCode),
      workspaceLayout: {
        explorerVisible: booleanOr(workspace.explorerVisible, true),
        explorerWidth: clampExplorerWidth(numberOr(workspace.explorerWidth, DEFAULT_EXPLORER_WIDTH)),
        propertiesVisible: booleanOr(workspace.propertiesVisible, true),
        propertiesWidth: clampRightPanelWidth(numberOr(workspace.propertiesWidth, DEFAULT_RIGHT_PANEL_WIDTH)),
        inputSourcesExpanded: booleanOr(workspace.inputSourcesExpanded, true),
        pilePlansExpanded: booleanOr(workspace.pilePlansExpanded, true),
      },
    },
    defaults: { pileCostCatalog: normalizePileCostDefaults(defaults.pileCostCatalog) },
  };
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

export function patchPileCostDefaults(
  settings: UserSettings,
  pileCostCatalog: PileCostSettings | null,
): UserSettings {
  return normalizeUserSettings({
    ...settings,
    defaults: { ...settings.defaults, pileCostCatalog },
  });
}

function normalizeCurrencyCode(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_USER_SETTINGS.preferences.defaultCurrencyCode;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized)
    ? normalized
    : DEFAULT_USER_SETTINGS.preferences.defaultCurrencyCode;
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
