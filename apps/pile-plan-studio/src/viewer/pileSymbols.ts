import type { PileBaseShape, PileFillPattern, PileSymbol } from "../core/projectTypes.ts";

const SYMBOL_STROKE = "#172026";
const SYMBOL_STROKE_WIDTH = 2.4;
const SYMBOL_NEUTRAL_FILL = "#F3F5F6";

export function renderPileSymbol(symbol: PileSymbol, fillColor: string): string {
  const fill = escapeSvgAttribute(fillColor);
  const clipId = `pile-symbol-${symbol.fillPattern}`;
  const clip = renderClip(symbol.fillPattern, clipId);
  const coloredAttributes = symbol.fillPattern === "full"
    ? `fill="${fill}" stroke="none"`
    : `fill="${fill}" stroke="none" clip-path="url(#${clipId})"`;
  const outlineAttributes = [
    `fill="none"`,
    `stroke="${SYMBOL_STROKE}"`,
    `stroke-width="${SYMBOL_STROKE_WIDTH}"`,
    `stroke-linejoin="round"`,
  ].join(" ");

  return [
    `<svg class="pile-symbol-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`,
    clip,
    renderShape(symbol.baseShape, `fill="${SYMBOL_NEUTRAL_FILL}" stroke="none"`),
    renderShape(symbol.baseShape, coloredAttributes),
    renderShape(symbol.baseShape, outlineAttributes),
    `</svg>`,
  ].join("");
}

function renderClip(fillPattern: PileFillPattern, clipId: string): string {
  if (fillPattern === "full") return "";
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
