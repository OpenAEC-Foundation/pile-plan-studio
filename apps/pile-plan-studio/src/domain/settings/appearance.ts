export const APP_THEMES = ["light", "dark", "blueprint", "high-contrast-dark", "high-contrast-light"] as const;
export type AppTheme = typeof APP_THEMES[number];
export type WorkspaceAppearance = "theme" | "light" | "dark";

export function normalizeWorkspaceAppearance(value: unknown): WorkspaceAppearance {
  return value === "light" || value === "dark" ? value : "theme";
}

export function normalizeTheme(value: unknown): AppTheme {
  if (value === "forge" || value === "openaec") return "dark";
  if (value === "contrast") return "high-contrast-dark";
  return APP_THEMES.includes(value as AppTheme) ? value as AppTheme : "light";
}
