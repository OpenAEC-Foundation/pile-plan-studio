import type {
  PileCostSettings,
  PileCostSettingsItem,
} from "../.././core/projectTypes.ts";

export function parseCostInput(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function commitCostInput(value: string): number | null {
  return value.trim() === "" ? 0 : parseCostInput(value);
}

export function updatePileHeadLevel(
  settings: PileCostSettings,
  pileHeadLevelM: number,
): PileCostSettings {
  if (!Number.isFinite(pileHeadLevelM)) {
    return settings;
  }

  return { ...settings, pile_head_level_m: pileHeadLevelM };
}

export function updatePileCostItem(
  settings: PileCostSettings,
  pileSizeMm: number,
  patch: Partial<Pick<PileCostSettingsItem, "shape" | "cost_per_m3_eur">>,
): PileCostSettings {
  if (patch.cost_per_m3_eur !== undefined && !Number.isFinite(patch.cost_per_m3_eur)) {
    return settings;
  }

  return {
    ...settings,
    items: settings.items.map((item) => item.pile_size_mm === pileSizeMm
      ? {
          ...item,
          ...patch,
          cost_per_m3_eur: patch.cost_per_m3_eur === undefined
            ? item.cost_per_m3_eur
            : Math.max(0, patch.cost_per_m3_eur),
        }
      : item),
  };
}
