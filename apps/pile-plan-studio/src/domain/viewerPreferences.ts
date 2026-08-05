import { getSetting, setSetting } from "../store.ts";

export type ForegroundLayer = "load-points" | "cpts";

export type ViewerPreferences = {
  symbolScalePercent: number;
  foregroundLayer: ForegroundLayer;
  showGrid: boolean;
};

const VIEWER_PREFERENCES_KEY = "viewer-preferences";
const DEFAULT_VIEWER_PREFERENCES: ViewerPreferences = {
  symbolScalePercent: 100,
  foregroundLayer: "load-points",
  showGrid: true,
};

export function normalizeViewerPreferences(input: unknown): ViewerPreferences {
  const candidate = typeof input === "object" && input !== null
    ? input as Partial<Record<keyof ViewerPreferences, unknown>>
    : {};
  const rawScale = typeof candidate.symbolScalePercent === "number"
    ? candidate.symbolScalePercent
    : DEFAULT_VIEWER_PREFERENCES.symbolScalePercent;

  return {
    symbolScalePercent: Math.round(Math.max(10, Math.min(200, rawScale))),
    foregroundLayer: candidate.foregroundLayer === "cpts" ? "cpts" : "load-points",
    showGrid: candidate.showGrid !== false,
  };
}

export async function loadViewerPreferences(): Promise<ViewerPreferences> {
  return normalizeViewerPreferences(
    await getSetting<unknown>(VIEWER_PREFERENCES_KEY, DEFAULT_VIEWER_PREFERENCES),
  );
}

export async function saveViewerPreferences(preferences: ViewerPreferences): Promise<void> {
  await setSetting(VIEWER_PREFERENCES_KEY, normalizeViewerPreferences(preferences));
}
