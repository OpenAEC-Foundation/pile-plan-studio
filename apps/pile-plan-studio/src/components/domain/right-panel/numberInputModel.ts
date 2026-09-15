type NumberDraftOptions = {
  emptyValue: number;
  min?: number;
  max?: number;
};

export function commitNumberDraft(
  draft: string,
  currentValue: number | null,
  options: NumberDraftOptions,
): number | null {
  if (draft.trim() === "") {
    return currentValue === null ? null : clamp(options.emptyValue, options);
  }

  const parsed = Number(draft);
  return Number.isFinite(parsed) ? clamp(parsed, options) : currentValue;
}

function clamp(value: number, { min, max }: NumberDraftOptions): number {
  if (min !== undefined) value = Math.max(min, value);
  if (max !== undefined) value = Math.min(max, value);
  return value;
}
