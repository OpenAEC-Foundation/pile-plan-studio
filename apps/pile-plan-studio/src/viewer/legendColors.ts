export const LEGEND_COLOR_SCHEMES = [
  "distinct",
  "colorblind-friendly",
  "rainbow",
  "light-dark",
  "cool-warm",
] as const;

export type LegendColorScheme = typeof LEGEND_COLOR_SCHEMES[number];

const DISTINCT_BASE = [
  "#4E79A7",
  "#F28E2B",
  "#59A14F",
  "#E15759",
  "#76B7B2",
  "#EDC948",
  "#B07AA1",
  "#FF9DA7",
  "#9C755F",
  "#BAB0AC",
] as const;

const COLORBLIND_BASE = [
  "#0072B2",
  "#E69F00",
  "#009E73",
  "#CC79A7",
  "#56B4E9",
  "#D55E00",
  "#B79F00",
  "#6A3D9A",
] as const;

const COOL_WARM_STOPS = [
  "#2C7BB6",
  "#00A6CA",
  "#00CCBC",
  "#FFFF8C",
  "#F29E2E",
  "#D7191C",
] as const;

export function generateLegendColors(scheme: LegendColorScheme, count: number): string[] {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 0) return [];

  switch (scheme) {
    case "distinct":
      return generateDistinctColors(safeCount);
    case "colorblind-friendly":
      return generateColorblindFriendlyColors(safeCount);
    case "rainbow":
      return distribute(safeCount, (position) => hslToHex(position * 330, 68, 52));
    case "light-dark":
      return distribute(safeCount, (position) => hslToHex(210, 62, 76 - position * 46));
    case "cool-warm":
      return distribute(safeCount, (position) => interpolateStops(COOL_WARM_STOPS, position));
  }
}

export function getLegendColorSchemePreview(
  scheme: LegendColorScheme,
  count = 7,
): string[] {
  return generateLegendColors(scheme, count);
}

function generateDistinctColors(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    if (index < DISTINCT_BASE.length) return DISTINCT_BASE[index];
    const hue = (index * 137.508) % 360;
    const saturation = 62 + (index % 3) * 8;
    const lightness = 46 + (index % 4) * 6;
    return hslToHex(hue, saturation, lightness);
  });
}

function generateColorblindFriendlyColors(count: number): string[] {
  const lightnessBands = [42, 62, 34, 70] as const;
  return Array.from({ length: count }, (_, index) => {
    if (index < COLORBLIND_BASE.length) return COLORBLIND_BASE[index];
    const baseIndex = index % COLORBLIND_BASE.length;
    const cycle = Math.floor(index / COLORBLIND_BASE.length) - 1;
    const { hue, saturation } = hexToHsl(COLORBLIND_BASE[baseIndex]);
    return hslToHex(hue, Math.min(78, Math.max(48, saturation)), lightnessBands[cycle % lightnessBands.length]);
  });
}

function distribute(count: number, colorAt: (position: number) => string): string[] {
  if (count === 1) return [colorAt(0.5)];
  return Array.from({ length: count }, (_, index) => colorAt(index / (count - 1)));
}

function interpolateStops(stops: readonly string[], position: number): string {
  const scaled = Math.min(1, Math.max(0, position)) * (stops.length - 1);
  const leftIndex = Math.min(stops.length - 2, Math.floor(scaled));
  const localPosition = scaled - leftIndex;
  const left = hexToRgb(stops[leftIndex]);
  const right = hexToRgb(stops[leftIndex + 1]);
  return rgbToHex(
    left.red + (right.red - left.red) * localPosition,
    left.green + (right.green - left.green) * localPosition,
    left.blue + (right.blue - left.blue) * localPosition,
  );
}

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  return {
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function hexToHsl(hex: string): { hue: number; saturation: number; lightness: number } {
  const { red, green, blue } = hexToRgb(hex);
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;

  if (delta !== 0) {
    if (maximum === r) hue = 60 * (((g - b) / delta) % 6);
    else if (maximum === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation: saturation * 100, lightness: lightness * 100 };
}

function hslToHex(hue: number, saturationPercent: number, lightnessPercent: number): string {
  const saturation = Math.min(100, Math.max(0, saturationPercent)) / 100;
  const lightness = Math.min(100, Math.max(0, lightnessPercent)) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const normalizedHue = ((hue % 360) + 360) % 360;
  const x = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const [r1, g1, b1] = normalizedHue < 60 ? [chroma, x, 0]
    : normalizedHue < 120 ? [x, chroma, 0]
      : normalizedHue < 180 ? [0, chroma, x]
        : normalizedHue < 240 ? [0, x, chroma]
          : normalizedHue < 300 ? [x, 0, chroma]
            : [chroma, 0, x];
  const match = lightness - chroma / 2;
  return rgbToHex((r1 + match) * 255, (g1 + match) * 255, (b1 + match) * 255);
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}
