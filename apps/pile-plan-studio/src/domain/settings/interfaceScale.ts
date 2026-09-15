export const MIN_INTERFACE_SCALE = 50;
export const MAX_INTERFACE_SCALE = 150;
export const INTERFACE_SCALE_STEP = 10;
export const DEFAULT_INTERFACE_SCALE = 100;

export function normalizeInterfaceScale(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value)
    ? value
    : DEFAULT_INTERFACE_SCALE;
  const snapped = Math.round(numeric / INTERFACE_SCALE_STEP) * INTERFACE_SCALE_STEP;
  return Math.min(MAX_INTERFACE_SCALE, Math.max(MIN_INTERFACE_SCALE, snapped));
}

export function stepInterfaceScale(current: number, direction: -1 | 1): number {
  return normalizeInterfaceScale(current + direction * INTERFACE_SCALE_STEP);
}
