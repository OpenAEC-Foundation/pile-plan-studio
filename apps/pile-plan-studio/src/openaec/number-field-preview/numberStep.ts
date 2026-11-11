export type NumberStepOptions = { min?: number | string; max?: number | string; step?: number | string };

/** Step a controlled editing draft; comma and point decimals share the same result. */
export function stepNumberDraft(value: string, direction: 1 | -1, options: NumberStepOptions): string {
  const min = parseNumberDraft(options.min), max = parseNumberDraft(options.max);
  const configured = parseNumberDraft(options.step);
  const step = configured !== null && configured > 0 ? configured : 1;
  const parsed = parseNumberDraft(value);
  const fallback = direction === 1 ? (min ?? 0) - step : (max ?? min ?? 0) + step;
  const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, (parsed ?? fallback) + direction * step));
  if (!Number.isFinite(next)) return value;
  const precision = Math.max(...[parsed, min, max, step].map(decimalPlaces));
  return String(precision <= 100 ? Number(next.toFixed(precision)) : next);
}

function decimalPlaces(value: number | null): number {
  if (value === null) return 0;
  const [significand, exponent = "0"] = String(value).split("e");
  return Math.max(0, (significand.split(".")[1]?.length ?? 0) - Number(exponent));
}

export function parseNumberDraft(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  if (typeof value === "string") {
    value = value.trim().replace(",", ".");
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Use the browser's step grid without changing the controlled form field. */
export function stepNativeNumber(field: HTMLInputElement, value: string, direction: 1 | -1): string {
  if (field.step.toLowerCase() === "any") {
    return stepNumberDraft(value || "0", direction, { min: field.min, max: field.max });
  }
  const stepper = field.ownerDocument.createElement("input");
  stepper.type = "number";
  stepper.min = field.min;
  stepper.max = field.max;
  stepper.step = field.step;
  // A React-controlled value attribute would move the step base on every edit.
  stepper.value = value;
  if (direction === 1) stepper.stepUp();
  else stepper.stepDown();
  return stepper.value;
}
