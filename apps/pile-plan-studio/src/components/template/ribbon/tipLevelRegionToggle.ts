export type TipLevelRegionToggle = {
  labelKey: "view.showTipLevelRegions" | "view.hideTipLevelRegions";
  nextVisible: boolean;
};

export function getTipLevelRegionToggle(visible: boolean): TipLevelRegionToggle {
  return visible
    ? { labelKey: "view.hideTipLevelRegions", nextVisible: false }
    : { labelKey: "view.showTipLevelRegions", nextVisible: true };
}
