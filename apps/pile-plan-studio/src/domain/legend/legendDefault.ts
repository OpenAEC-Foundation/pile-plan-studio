import type { LegendItems, LegendValueStyle } from "../../core/projectTypes.ts";

export function updateLegendDefault(previous: LegendItems, appearance: LegendItems): LegendItems {
  return {
    ...appearance,
    pileSizes: updateStyles(previous.pileSizes, appearance.pileSizes),
    pileTipLevels: updateStyles(previous.pileTipLevels, appearance.pileTipLevels),
  };
}

function updateStyles(previous: LegendValueStyle[], projectStyles: LegendValueStyle[]): LegendValueStyle[] {
  return [...new Map([...previous, ...projectStyles].map((style) => [style.value, style])).values()];
}

export function mergeLegendDefault(projectLegend: LegendItems, userDefault: LegendItems) {
  let matched = 0;

  function mergeStyles(projectStyles: LegendValueStyle[], savedStyles: LegendValueStyle[]) {
    const byValue = new Map(savedStyles.map((style) => [style.value, style]));
    return projectStyles.map((style) => {
      const saved = byValue.get(style.value);
      if (!saved) return style;
      matched += 1;
      return { ...saved, symbol: { ...saved.symbol } };
    });
  }

  const legend: LegendItems = {
    ...userDefault,
    pileSizes: mergeStyles(projectLegend.pileSizes, userDefault.pileSizes),
    pileTipLevels: mergeStyles(projectLegend.pileTipLevels, userDefault.pileTipLevels),
  };
  return {
    legend,
    matched,
    skipped: userDefault.pileSizes.length + userDefault.pileTipLevels.length - matched,
    retained: projectLegend.pileSizes.length + projectLegend.pileTipLevels.length - matched,
  };
}
