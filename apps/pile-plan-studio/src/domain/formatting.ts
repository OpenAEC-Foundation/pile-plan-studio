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

export function formatPileTipLevelMillimetres(value: number, locale: string): string {
  if (!Number.isFinite(value)) return "-";
  return formatPileTipLevelMetres(value / 1_000, locale);
}

export function formatPileTipLevelMetres(value: number, locale: string): string {
  if (!Number.isFinite(value)) return "-";
  const roundedToMillimetres = Math.round(value * 1_000) / 1_000;
  const displayValue = Object.is(roundedToMillimetres, -0) ? 0 : roundedToMillimetres;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(displayValue)} m`;
}

export function formatCoordinateReadout(
  points: ReadonlyArray<{ x_mm: number; y_mm: number }>,
  locale: string,
): { x: string; y: string } | null {
  if (points.length !== 1) return null;

  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return {
    x: `${formatter.format(points[0].x_mm)} mm`,
    y: `${formatter.format(points[0].y_mm)} mm`,
  };
}
