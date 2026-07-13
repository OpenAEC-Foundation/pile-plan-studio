export function normalizeProjectName(value: string): string | null {
  const name = value.trim();
  return name.length > 0 ? name : null;
}
