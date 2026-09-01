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
