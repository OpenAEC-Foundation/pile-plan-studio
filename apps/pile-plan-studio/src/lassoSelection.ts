export type LassoRectangle = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export type ScreenPoint = {
  id: number;
  x: number;
  y: number;
};

export function getPointIdsInRectangle(points: ScreenPoint[], rectangle: LassoRectangle): number[] {
  const minX = Math.min(rectangle.startX, rectangle.endX);
  const maxX = Math.max(rectangle.startX, rectangle.endX);
  const minY = Math.min(rectangle.startY, rectangle.endY);
  const maxY = Math.max(rectangle.startY, rectangle.endY);

  return points
    .filter((point) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY)
    .map((point) => point.id);
}
