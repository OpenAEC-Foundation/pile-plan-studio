import type { PileBaseShape, PileFillPattern, PileSymbol } from "../core/projectTypes.ts";

export const PILE_BASE_SHAPES = [
  "circle",
  "square",
  "diamond",
  "triangle-up",
  "triangle-down",
  "triangle-left",
  "triangle-right",
  "rectangle-horizontal",
  "rectangle-vertical",
] as const satisfies readonly PileBaseShape[];

export const PILE_FILL_PATTERNS = [
  "full",
  "top-half",
  "bottom-half",
  "left-half",
  "right-half",
  "diagonal-half",
] as const satisfies readonly PileFillPattern[];

export const PILE_SYMBOL_CATALOG: readonly PileSymbol[] = PILE_FILL_PATTERNS.flatMap(
  (fillPattern) => PILE_BASE_SHAPES.map((baseShape) => ({ baseShape, fillPattern })),
);

export function pileSymbolKey(symbol: PileSymbol): string {
  return `${symbol.baseShape}:${symbol.fillPattern}`;
}

export function isPileBaseShape(value: unknown): value is PileBaseShape {
  return typeof value === "string" && (PILE_BASE_SHAPES as readonly string[]).includes(value);
}

export function isPileFillPattern(value: unknown): value is PileFillPattern {
  return typeof value === "string" && (PILE_FILL_PATTERNS as readonly string[]).includes(value);
}
