export function getUseColumnLabel(selectedLoadPointCount: number): "Use" | "Use (Avg)" {
  return selectedLoadPointCount > 1 ? "Use (Avg)" : "Use";
}
