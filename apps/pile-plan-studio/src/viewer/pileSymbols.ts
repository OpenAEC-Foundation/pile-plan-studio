import type { PileBaseShape, PileFillPattern, PileSymbol } from "../core/projectTypes.ts";

const SYMBOL_STROKE = "#172026";
const SYMBOL_STROKE_WIDTH = 2.4;
const SYMBOL_NEUTRAL_FILL = "#F3F5F6";

type Point = readonly [number, number];

const CIRCLE_RADIUS = 8.5;
const CORNER_RADIUS = 2;
const ROUNDED_RECTS: Partial<Record<PileBaseShape, readonly [number, number, number, number]>> = {
  square: [5, 5, 14, 14],
  "rectangle-horizontal": [3, 7, 18, 10],
  "rectangle-vertical": [7, 3, 10, 18],
};
const TRIANGLE_POINTS: Partial<Record<PileBaseShape, readonly Point[]>> = {
  "triangle-up": [[12, 3], [21, 20], [3, 20]],
  "triangle-down": [[3, 4], [21, 4], [12, 21]],
  "triangle-left": [[4, 12], [20, 3], [20, 21]],
  "triangle-right": [[4, 3], [20, 12], [4, 21]],
};
const POLYGON_SHAPES = { ...TRIANGLE_POINTS, diamond: [[12, 3], [21, 12], [12, 21], [3, 12]] as const };
const TRIANGLE_CLIP_CACHE = new Map<string, string>();
const HALF_PLANES = { "top-half": 12, "bottom-half": -12, "left-half": 12, "right-half": -12, "diagonal-half": 24 };

/** Vector paths for the symbol, centered in CAD coordinates with positive Y up. */
export function pileSymbolGeometry({ baseShape, fillPattern }: PileSymbol) {
  const polygon = POLYGON_SHAPES[baseShape];
  const rectangle = ROUNDED_RECTS[baseShape];
  const outline = polygon ?? (rectangle ? roundedOutline(rectangle) : arcPoints(12, 12, CIRCLE_RADIUS, 0, 48, Math.PI / 24));
  let fill = outline;
  if (fillPattern !== "full") {
    fill = TRIANGLE_POINTS[baseShape]
      ? equalAreaTriangleClip(outline, fillPattern)
      : clipPolygon(outline, directionalScore(fillPattern), HALF_PLANES[fillPattern]);
  }
  const toCad = (points: readonly Point[]) => points.filter(([x, y], index) => {
    const [px, py] = points[(index + points.length - 1) % points.length];
    return Math.hypot(x - px, y - py) > 1e-9;
  }).map(([x, y]): [number, number] => [(x - 12) / 9, (12 - y) / 9]);
  return { outline: toCad(outline), fill: toCad(fill) };
}

function roundedOutline([x, y, width, height]: readonly [number, number, number, number]): Point[] {
  const r = CORNER_RADIUS;
  const centers: Point[] = [[x + width - r, y + r], [x + width - r, y + height - r], [x + r, y + height - r], [x + r, y + r]];
  return centers.flatMap(([cx, cy], corner) => arcPoints(cx, cy, r, (corner - 1) * Math.PI / 2, 9, Math.PI / 16));
}

function arcPoints(x: number, y: number, radius: number, start: number, count: number, step: number): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = start + index * step;
    return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
  });
}

export type PileSymbolRenderOptions = {
  outlineColor?: string;
  neutralFill?: string;
};

export function renderPileSymbol(
  symbol: PileSymbol,
  fillColor: string,
  options: PileSymbolRenderOptions = {},
): string {
  const clipId = `pile-symbol-${symbol.baseShape}-${symbol.fillPattern}`;
  return [
    `<svg class="pile-symbol-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`,
    renderPileSymbolSvgChildren(symbol, fillColor, clipId, options),
    `</svg>`,
  ].join("");
}

export function renderPileSymbolSvgChildren(
  symbol: PileSymbol,
  fillColor: string,
  clipId: string,
  options: PileSymbolRenderOptions = {},
): string {
  const fill = escapeSvgAttribute(fillColor);
  const outline = escapeSvgAttribute(options.outlineColor ?? SYMBOL_STROKE);
  const neutral = escapeSvgAttribute(options.neutralFill ?? SYMBOL_NEUTRAL_FILL);
  const safeClipId = escapeSvgAttribute(clipId);
  const clip = renderClip(symbol.baseShape, symbol.fillPattern, safeClipId);
  const coloredAttributes = symbol.fillPattern === "full"
    ? `fill="${fill}" stroke="none"`
    : `fill="${fill}" stroke="none" clip-path="url(#${safeClipId})"`;
  const outlineAttributes = [
    `fill="none"`,
    `stroke="${outline}"`,
    `stroke-width="${SYMBOL_STROKE_WIDTH}"`,
    `stroke-linejoin="round"`,
  ].join(" ");

  return [
    clip,
    renderShape(symbol.baseShape, `fill="${neutral}" stroke="none"`),
    renderShape(symbol.baseShape, coloredAttributes),
    renderShape(symbol.baseShape, outlineAttributes),
  ].join("");
}

function renderClip(baseShape: PileBaseShape, fillPattern: PileFillPattern, clipId: string): string {
  if (fillPattern === "full") return "";
  const triangle = TRIANGLE_POINTS[baseShape];
  if (triangle) {
    const cacheKey = `${baseShape}:${fillPattern}`;
    let points = TRIANGLE_CLIP_CACHE.get(cacheKey);
    if (!points) {
      points = equalAreaTriangleClip(triangle, fillPattern)
        .map(([x, y]) => `${formatCoordinate(x)},${formatCoordinate(y)}`)
        .join(" ");
      TRIANGLE_CLIP_CACHE.set(cacheKey, points);
    }
    return `<defs><clipPath id="${clipId}"><polygon points="${points}" /></clipPath></defs>`;
  }
  const region = fillPattern === "top-half"
    ? `<rect x="0" y="0" width="24" height="12" />`
    : fillPattern === "bottom-half"
      ? `<rect x="0" y="12" width="24" height="12" />`
      : fillPattern === "left-half"
        ? `<rect x="0" y="0" width="12" height="24" />`
        : fillPattern === "right-half"
          ? `<rect x="12" y="0" width="12" height="24" />`
          : `<polygon points="0,0 24,0 0,24" />`;
  return `<defs><clipPath id="${clipId}">${region}</clipPath></defs>`;
}

function equalAreaTriangleClip(triangle: readonly Point[], fillPattern: PileFillPattern): Point[] {
  const score = directionalScore(fillPattern);
  const visibleInterior = insetConvexPolygon(triangle, SYMBOL_STROKE_WIDTH / 2);
  const scores = visibleInterior.map(score);
  let lower = Math.min(...scores);
  let upper = Math.max(...scores);
  const targetArea = polygonArea(visibleInterior) / 2;

  for (let iteration = 0; iteration < 40; iteration += 1) {
    const boundary = (lower + upper) / 2;
    const clipped = clipPolygon(visibleInterior, score, boundary);
    if (polygonArea(clipped) < targetArea) lower = boundary;
    else upper = boundary;
  }

  return clipPolygon(triangle, score, (lower + upper) / 2);
}

function directionalScore(fillPattern: PileFillPattern): (point: Point) => number {
  switch (fillPattern) {
    case "top-half":
      return ([, y]) => y;
    case "bottom-half":
      return ([, y]) => -y;
    case "left-half":
      return ([x]) => x;
    case "right-half":
      return ([x]) => -x;
    case "diagonal-half":
      return ([x, y]) => x + y;
    case "full":
      return () => 0;
  }
}

function clipPolygon(
  polygon: readonly Point[],
  score: (point: Point) => number,
  boundary: number,
): Point[] {
  const clipped: Point[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const startScore = score(start);
    const endScore = score(end);
    const startInside = startScore <= boundary;
    const endInside = endScore <= boundary;

    if (startInside) clipped.push(start);
    if (startInside !== endInside) {
      const ratio = (boundary - startScore) / (endScore - startScore);
      clipped.push([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ]);
    }
  }
  return clipped;
}

function insetConvexPolygon(polygon: readonly Point[], distance: number): Point[] {
  const orientation = signedPolygonArea(polygon) >= 0 ? 1 : -1;
  const offsetEdges = polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const direction: Point = [end[0] - start[0], end[1] - start[1]];
    const length = Math.hypot(direction[0], direction[1]);
    const normal: Point = orientation > 0
      ? [-direction[1] / length, direction[0] / length]
      : [direction[1] / length, -direction[0] / length];
    return {
      point: [start[0] + normal[0] * distance, start[1] + normal[1] * distance] as Point,
      direction,
    };
  });

  return offsetEdges.map((current, index) => {
    const previous = offsetEdges[(index - 1 + offsetEdges.length) % offsetEdges.length];
    return intersectLines(previous.point, previous.direction, current.point, current.direction);
  });
}

function intersectLines(firstPoint: Point, firstDirection: Point, secondPoint: Point, secondDirection: Point): Point {
  const denominator = crossProduct(firstDirection, secondDirection);
  const delta: Point = [secondPoint[0] - firstPoint[0], secondPoint[1] - firstPoint[1]];
  const ratio = crossProduct(delta, secondDirection) / denominator;
  return [
    firstPoint[0] + firstDirection[0] * ratio,
    firstPoint[1] + firstDirection[1] * ratio,
  ];
}

function crossProduct([x1, y1]: Point, [x2, y2]: Point): number {
  return x1 * y2 - y1 * x2;
}

function polygonArea(points: readonly Point[]): number {
  return Math.abs(signedPolygonArea(points));
}

function signedPolygonArea(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  return points.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    return sum + x * nextY - nextX * y;
  }, 0) / 2;
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function renderShape(baseShape: PileBaseShape, attributes: string): string {
  const polygon = POLYGON_SHAPES[baseShape];
  if (polygon) {
    return `<polygon points="${polygon.map(point => point.join(",")).join(" ")}" ${attributes} />`;
  }
  const rectangle = ROUNDED_RECTS[baseShape];
  if (rectangle) {
    const [x, y, width, height] = rectangle;
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${CORNER_RADIUS}" ${attributes} />`;
  }
  return `<circle cx="12" cy="12" r="${CIRCLE_RADIUS}" ${attributes} />`;
}

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
