export const BROWSER_BASELINE_ZOOM = 0.8;

type ClassListTarget = {
  classList: Pick<DOMTokenList, "add">;
};

export function applyRuntimeBaseline(root: ClassListTarget = document.documentElement): void {
  root.classList.add("compact-application-baseline");
}

export function layoutScaleFromWidths(renderedWidth: number, layoutWidth: number): number {
  if (!Number.isFinite(renderedWidth) || !Number.isFinite(layoutWidth) || renderedWidth <= 0 || layoutWidth <= 0) {
    return 1;
  }
  return renderedWidth / layoutWidth;
}

export function elementLayoutScale(element: HTMLElement): number {
  return layoutScaleFromWidths(element.getBoundingClientRect().width, element.offsetWidth);
}

export function screenToLocal(value: number, scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? value / scale : value;
}
