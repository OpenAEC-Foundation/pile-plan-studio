export function mergeDefaultPileChoices(
  retained: Map<number, string>,
  defaults: Map<number, string>,
): Map<number, string> {
  return new Map([...defaults, ...retained]);
}
