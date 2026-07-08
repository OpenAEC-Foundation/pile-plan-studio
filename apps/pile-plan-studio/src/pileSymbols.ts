import type { PileShape } from "./projectTypes.ts";

const SYMBOL_STROKE = "#172026";
const SYMBOL_STROKE_WIDTH = 2.4;

export function renderPileSymbol(shape: PileShape, fillColor: string): string {
  const fill = escapeSvgAttribute(fillColor);
  const shapeAttributes = [
    `fill="${fill}"`,
    `stroke="${SYMBOL_STROKE}"`,
    `stroke-width="${SYMBOL_STROKE_WIDTH}"`,
    `stroke-linejoin="round"`,
    `vector-effect="non-scaling-stroke"`,
  ].join(" ");

  return `<svg class="pile-symbol-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${renderShape(shape, shapeAttributes)}</svg>`;
}

function renderShape(shape: PileShape, shapeAttributes: string): string {
  switch (shape) {
    case "circle":
      return `<circle cx="12" cy="12" r="8.5" ${shapeAttributes} />`;
    case "square":
      return `<rect x="5" y="5" width="14" height="14" rx="2" ${shapeAttributes} />`;
    case "diamond":
      return `<polygon points="12,3 21,12 12,21 3,12" ${shapeAttributes} />`;
    case "triangle-up":
      return `<polygon points="12,3 21,20 3,20" ${shapeAttributes} />`;
    case "triangle-down":
      return `<polygon points="3,4 21,4 12,21" ${shapeAttributes} />`;
    case "triangle-left":
      return `<polygon points="4,12 20,3 20,21" ${shapeAttributes} />`;
    case "triangle-right":
      return `<polygon points="4,3 20,12 4,21" ${shapeAttributes} />`;
    case "pentagon":
      return `<polygon points="12,3 21,10 18,21 6,21 3,10" ${shapeAttributes} />`;
    case "star":
      return `<polygon points="12,2.5 14.8,8.7 21.5,9.2 16.4,13.6 18,20.2 12,16.8 6,20.2 7.6,13.6 2.5,9.2 9.2,8.7" ${shapeAttributes} />`;
    case "thin-diamond":
      return `<polygon points="12,2 17,12 12,22 7,12" ${shapeAttributes} />`;
    case "hexagon":
      return `<polygon points="7,3 17,3 22,12 17,21 7,21 2,12" ${shapeAttributes} />`;
    case "octagon":
      return `<polygon points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8" ${shapeAttributes} />`;
  }
}

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
