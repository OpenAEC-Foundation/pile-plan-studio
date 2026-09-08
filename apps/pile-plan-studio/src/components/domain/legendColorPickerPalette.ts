import type { LegendColorScheme } from "../../core/projectTypes.ts";
import { generateLegendColors } from "../../viewer/legendColors.ts";

export type LegendColorPickerPaletteItem = {
  color: string;
  selected: boolean;
};

export function createLegendColorPickerPalette(
  scheme: LegendColorScheme,
  count: number,
  currentColor: string,
): LegendColorPickerPaletteItem[] {
  return generateLegendColors(scheme, count).map((color) => ({
    color,
    selected: color === currentColor.toUpperCase(),
  }));
}
