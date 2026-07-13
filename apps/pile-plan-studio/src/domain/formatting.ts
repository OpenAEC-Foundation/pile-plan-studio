export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export function formatOptionalNumber(
  value: number | null | undefined,
  suffix = "",
  multiplier = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return `${formatNumber(value * multiplier)}${suffix}`;
}
