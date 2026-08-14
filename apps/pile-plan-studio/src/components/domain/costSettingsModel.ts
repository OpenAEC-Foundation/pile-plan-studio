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
  currentValue: number | null,
  pileHeadLevelM: number,
): number | null {
  if (!Number.isFinite(pileHeadLevelM)) {
    return currentValue;
  }

  return pileHeadLevelM;
}

export function updatePileCostItem(
  settings: PileCostSettings,
  pileSizeMm: number,
  patch: Partial<Pick<PileCostSettingsItem, "shape" | "cost_per_m3">>,
): PileCostSettings {
  if (patch.cost_per_m3 !== undefined && !Number.isFinite(patch.cost_per_m3)) {
    return settings;
  }

  return {
    ...settings,
    items: settings.items.map((item) => item.pile_size_mm === pileSizeMm
      ? {
          ...item,
          ...patch,
          cost_per_m3: patch.cost_per_m3 === undefined
            ? item.cost_per_m3
            : Math.max(0, patch.cost_per_m3),
        }
      : item),
  };
}
