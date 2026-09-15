export function normalizeProjectName(value: string): string | null {
  const name = value.trim();
  return name.length > 0 ? name : null;
}

export function normalizePileHeadLevel(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (normalized.length === 0) {
    return null;
  }

  const pileHeadLevel = Number(normalized);
  return Number.isFinite(pileHeadLevel) ? pileHeadLevel : null;
}
