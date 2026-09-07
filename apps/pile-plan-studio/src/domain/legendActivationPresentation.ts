import type {
  LegendItems,
  PileConfigurationOption,
  PileCostSettings,
  PileSymbol,
} from "../core/projectTypes.ts";
import { getConfigurationStyle } from "../viewer/legend.ts";
import type { ActivePileConfigurations } from "./activePileConfigurations.ts";

export const INACTIVE_LEGEND_COLOR = "#8C989F";
export const SMALL_DOT_SYMBOL: PileSymbol = { baseShape: "circle", fillPattern: "full" };

export type ConfigurationActivationPresentation = {
  symbol: PileSymbol;
  color: string;
  smallDot: boolean;
  sizeActive: boolean;
  tipActive: boolean;
};

export function getConfigurationActivationPresentation(
  configuration: Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m">,
  legend: LegendItems,
  active: ActivePileConfigurations,
  pileCosts?: PileCostSettings,
): ConfigurationActivationPresentation {
  const base = getConfigurationStyle(configuration, legend, pileCosts);
  const sizeActive = active.pileSizes.includes(configuration.pile_size_mm);
  const tipActive = active.pileTipLevels.includes(configuration.pile_tip_level_m);
  const dualColor = legend.encodingMode === "size-color-tip-region";
  const symbolActive = dualColor || (legend.encodingMode === "size-symbol" ? sizeActive : tipActive);
  const colorActive = legend.encodingMode === "size-symbol" ? tipActive : sizeActive;
  return {
    symbol: symbolActive ? base.symbol : SMALL_DOT_SYMBOL,
    color: colorActive ? base.color : INACTIVE_LEGEND_COLOR,
    smallDot: !symbolActive,
    sizeActive,
    tipActive,
  };
}
