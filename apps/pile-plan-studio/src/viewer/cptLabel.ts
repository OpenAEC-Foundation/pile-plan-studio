const DEFAULT_LABEL_SCALE = 0.34;
const MINIMUM_LABEL_SCALE = 0.18;
const COMFORTABLE_CHARACTER_COUNT = 2.4;

export function getCptLabelScale(label: string): number {
  const characterCount = Math.max(label.trim().length, 1);
  return Math.max(
    MINIMUM_LABEL_SCALE,
    DEFAULT_LABEL_SCALE * Math.min(1, COMFORTABLE_CHARACTER_COUNT / characterCount),
  );
}

export function getCptLabelStyle(label: string): { "--cpt-label-scale": number } {
  return { "--cpt-label-scale": getCptLabelScale(label) };
}
