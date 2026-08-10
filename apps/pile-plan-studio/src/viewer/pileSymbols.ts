import type { PileBaseShape, PileFillPattern, PileSymbol } from "../core/projectTypes.ts";

const SYMBOL_STROKE = "#172026";
const SYMBOL_STROKE_WIDTH = 2.4;
const SYMBOL_NEUTRAL_FILL = "#F3F5F6";

type Point = readonly [number, number];

const TRIANGLE_POINTS: Partial<Record<PileBaseShape, readonly Point[]>> = {
  "triangle-up": [[12, 3], [21, 20], [3, 20]],
  "triangle-down": [[3, 4], [21, 4], [12, 21]],
  "triangle-left": [[4, 12], [20, 3], [20, 21]],
  "triangle-right": [[4, 3], [20, 12], [4, 21]],
};
const TRIANGLE_CLIP_CACHE = new Map<string, string>();

export type PileSymbolRenderOptions = {
  outlineColor?: string;
  neutralFill?: string;
};

export function renderPileSymbol(
  symbol: PileSymbol,
  fillColor: string,
  options: PileSymbolRenderOptions = {},
): string {
  const fill = escapeSvgAttribute(fillColor);
  const outline = escapeSvgAttribute(options.outlineColor ?? SYMBOL_STROKE);
  const neutral = escapeSvgAttribute(options.neutralFill ?? SYMBOL_NEUTRAL_FILL);
  const clipId = `pile-symbol-${symbol.baseShape}-${symbol.fillPattern}`;
  const clip = renderClip(symbol.baseShape, symbol.fillPattern, clipId);
  const coloredAttributes = symbol.fillPattern === "full"
    ? `fill="${fill}" stroke="none"`
    : `fill="${fill}" stroke="none" clip-path="url(#${clipId})"`;
  const outlineAttributes = [
    `fill="none"`,
    `stroke="${outline}"`,
    `stroke-width="${SYMBOL_STROKE_WIDTH}"`,
    `stroke-linejoin="round"`,
  ].join(" ");

  return [
    `<svg class="pile-symbol-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`,
    clip,
    renderShape(symbol.baseShape, `fill="${neutral}" stroke="none"`),
    renderShape(symbol.baseShape, coloredAttributes),
    renderShape(symbol.baseShape, outlineAttributes),
    `</svg>`,
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
  switch (baseShape) {
    case "circle":
      return `<circle cx="12" cy="12" r="8.5" ${attributes} />`;
    case "square":
      return `<rect x="5" y="5" width="14" height="14" rx="2" ${attributes} />`;
    case "diamond":
      return `<polygon points="12,3 21,12 12,21 3,12" ${attributes} />`;
    case "triangle-up":
      return `<polygon points="12,3 21,20 3,20" ${attributes} />`;
    case "triangle-down":
      return `<polygon points="3,4 21,4 12,21" ${attributes} />`;
    case "triangle-left":
      return `<polygon points="4,12 20,3 20,21" ${attributes} />`;
    case "triangle-right":
      return `<polygon points="4,3 20,12 4,21" ${attributes} />`;
    case "rectangle-horizontal":
      return `<rect x="3" y="7" width="18" height="10" rx="2" ${attributes} />`;
    case "rectangle-vertical":
      return `<rect x="7" y="3" width="10" height="18" rx="2" ${attributes} />`;
  }
}

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
