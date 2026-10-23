import type { ImportDiagnostic } from "../../core/coreImportContract.ts";

function diagnosticKey(diagnostic: ImportDiagnostic): string {
  return JSON.stringify([
    diagnostic.code, diagnostic.severity, diagnostic.location, diagnostic.advice,
    diagnostic.count, diagnostic.nodeIds, diagnostic.loadPointNames,
    diagnostic.xMm, diagnostic.yMm, diagnostic.tipLevelValues,
  ]);
}

export function remainingAdviceDiagnostics(
  diagnostics: readonly ImportDiagnostic[],
  alreadyShown: readonly ImportDiagnostic[],
): ImportDiagnostic[] {
  const shown = new Set(alreadyShown.map(diagnosticKey));
  return diagnostics.filter(diagnostic => !shown.has(diagnosticKey(diagnostic)));
}
