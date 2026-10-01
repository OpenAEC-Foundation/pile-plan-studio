export function parseCostInput(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function commitCostInput(value: string): number | null {
  return value.trim() === "" ? 0 : parseCostInput(value);
}
