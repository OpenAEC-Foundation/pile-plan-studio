export type ForegroundLayer = "load-points" | "cpts";

export type ViewerPreferences = {
  symbolScalePercent: number;
  foregroundLayer: ForegroundLayer;
  showGrid: boolean;
};

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
