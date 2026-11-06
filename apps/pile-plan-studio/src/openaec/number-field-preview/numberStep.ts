export type NumberStepOptions = { min?: number | string; max?: number | string; step?: number | string };

/** Step a controlled editing draft; comma and point decimals share the same result. */
export function stepNumberDraft(value: string, direction: 1 | -1, options: NumberStepOptions): string {
  const min = finite(options.min), max = finite(options.max);
  const configured = finite(options.step);
  const step = configured !== null && configured > 0 ? configured : 1;
  const parsed = finite(value);
  const fallback = direction === 1 ? (min ?? 0) - step : (max ?? min ?? 0) + step;
  const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, (parsed ?? fallback) + direction * step));
  return String(Number(next.toFixed(10)));
}

function finite(value: number | string | undefined): number | null {
  if (value === undefined || typeof value === "string" && !value.trim()) return null;
  const parsed = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(parsed) ? parsed : null;
}
