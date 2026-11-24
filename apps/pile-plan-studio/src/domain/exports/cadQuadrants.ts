import type { CadPileType, CadQuadrantSymbol } from "../../core/cadExportCoreClient.ts";
import type { ProjectState } from "../project/projectState.ts";

// Starting patterns match the Rust CAD exporter. Bits run counterclockwise from top right.
export const CAD_QUADRANT_PATTERNS = [2, 3, 10, 15, 7, 1, 6, 12, 9, 5, 8, 13, 11, 4, 14, 0] as const;

export function cadPileTypes(
  assignments: ProjectState["selectedPileConfigurationsByLoadPoint"],
  costItems: ProjectState["pileCostSettings"]["items"],
): CadPileType[] {
  const shapes = new Map(costItems.map(item => [item.pile_size_mm, item.shape]));
  const sizes = new Set([...assignments.values()].map(pile => pile.pile_size_mm));
  return Array.from(sizes, (size_mm): CadPileType => ({ size_mm, shape: shapes.get(size_mm) ?? "square" }))
    .sort((a, b) => a.shape.localeCompare(b.shape) || a.size_mm - b.size_mm);
}

export function defaultCadQuadrants(types: readonly CadPileType[]): CadQuadrantSymbol[] {
  const indices = { square: 0, round: 0 };
  return types.map(type => ({ ...type, quadrants: CAD_QUADRANT_PATTERNS[indices[type.shape]++ % CAD_QUADRANT_PATTERNS.length] }));
}
