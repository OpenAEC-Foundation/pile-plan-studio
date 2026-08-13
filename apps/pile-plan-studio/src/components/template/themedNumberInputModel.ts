type NumericStepOptions = {
  max?: number | string;
  min?: number | string;
  step?: number | string;
};

export function stepNumericDraft(value: string, direction: 1 | -1, options: NumericStepOptions): string {
  const min = finiteNumber(options.min);
  const max = finiteNumber(options.max);
  const configuredStep = finiteNumber(options.step);
  const step = configuredStep !== null && configuredStep > 0 ? configuredStep : 1;
  const parsed = finiteNumber(value);
  const fallback = direction === 1
    ? (min ?? 0) - step
    : (max ?? min ?? 0) + step;
  const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, (parsed ?? fallback) + direction * step));
  return String(Number(next.toFixed(10)));
}

function finiteNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
