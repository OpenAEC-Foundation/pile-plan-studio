import { normalizeTheme, normalizeWorkspaceAppearance, type WorkspaceAppearance } from "../../domain/settings/appearance.ts";

export const APPEARANCE_CHANGE_EVENT = "pile-plan-appearance-change";

export function applyTheme(theme?: string, workspaceAppearance: WorkspaceAppearance = "theme"): void {
  document.documentElement.setAttribute("data-oa-theme", normalizeTheme(theme));
  document.documentElement.setAttribute("data-oa-workspace", normalizeWorkspaceAppearance(workspaceAppearance));
  window.dispatchEvent(new Event(APPEARANCE_CHANGE_EVENT));
}
