import { getSetting, setSetting } from "../store.ts";

export type ForegroundLayer = "load-points" | "cpts";

export type ViewerPreferences = {
  symbolScalePercent: number;
  foregroundLayer: ForegroundLayer;
};

const VIEWER_PREFERENCES_KEY = "viewer-preferences";
const DEFAULT_VIEWER_PREFERENCES: ViewerPreferences = {
  symbolScalePercent: 100,
  foregroundLayer: "load-points",
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
