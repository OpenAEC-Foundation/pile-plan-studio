type ScreenRect = { left: number; top: number; width: number; height: number };
type BorderWidths = { left: number; top: number; right: number; bottom: number };

export function getViewerContentScreenRect(
  screen: ScreenRect,
  border: BorderWidths,
  rootScale: number,
): ScreenRect {
  return {
    left: screen.left + border.left * rootScale,
    top: screen.top + border.top * rootScale,
    width: screen.width - (border.left + border.right) * rootScale,
    height: screen.height - (border.top + border.bottom) * rootScale,
  };
}
