import {
  toggleActivePileConfiguration,
  type ActivePileConfigurations,
} from "./activePileConfigurations.ts";

export type LegendEditorDraft = ActivePileConfigurations;
export type LegendEditorBulkAction = "enable-all" | "enable-used" | "disable-all";

export function createLegendEditorDraft(active: ActivePileConfigurations): LegendEditorDraft {
  return copyConfigurations(active);
}

export function toggleLegendEditorItem(
  draft: LegendEditorDraft,
  kind: "size" | "tip",
  value: number,
): LegendEditorDraft {
  return toggleActivePileConfiguration(draft, kind, value);
}

export function applyLegendEditorBulkAction(
  action: LegendEditorBulkAction,
  available: ActivePileConfigurations,
  used: ActivePileConfigurations,
): LegendEditorDraft {
  if (action === "disable-all") {
    return { pileSizes: [], pileTipLevels: [] };
  }

  return copyConfigurations(action === "enable-used" ? used : available);
}

function copyConfigurations(configurations: ActivePileConfigurations): ActivePileConfigurations {
  return {
    pileSizes: [...configurations.pileSizes],
    pileTipLevels: [...configurations.pileTipLevels],
  };
}
