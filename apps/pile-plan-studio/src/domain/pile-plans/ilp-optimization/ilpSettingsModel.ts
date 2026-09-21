export function parseScaledDecimal(text: string, decimals: number): number | null {
  const match=/^(\d+)(?:[.,](\d*))?$/.exec(text.trim());
  if (!match || (match[2]?.length ?? 0)>decimals) return null;
  const value=Number(match[1]+(match[2] ?? "").padEnd(decimals,"0"));
  return Number.isSafeInteger(value) && value<=0xffffffff ? value : null;
}
