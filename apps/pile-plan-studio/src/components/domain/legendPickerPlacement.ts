export function shouldOpenLegendPickerAbove(
  triggerTop: number,
  triggerBottom: number,
  popoverHeight: number,
  boundaryTop: number,
  boundaryBottom: number,
): boolean {
  const spaceAbove = triggerTop - boundaryTop;
  const spaceBelow = boundaryBottom - triggerBottom;
  return popoverHeight > spaceBelow && spaceAbove > spaceBelow;
}

export function getRightAlignedLegendPopoverMaxWidth(
  triggerRight: number,
  boundaryLeft: number,
  padding = 0,
): number {
  return Math.min(460, Math.max(0, triggerRight - boundaryLeft - padding));
}
