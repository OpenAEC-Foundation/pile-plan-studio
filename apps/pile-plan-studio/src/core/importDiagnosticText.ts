import type { ImportDiagnostic } from "./coreImportContract.ts";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function importDiagnosticText(
  diagnostic: ImportDiagnostic,
  t: Translate,
): string {
  const locations = diagnostic.loadPointNames.length > 0
    ? diagnostic.loadPointNames
      .map((name, index) => `${name} (${diagnostic.nodeIds[index] ?? "?"})`)
      .join(", ")
    : diagnostic.nodeIds.join(", ");
  const values = diagnostic.tipLevelValues
    .map((item) => {
      const source = [
        item.location.fileName,
        item.location.sheetName
          ? t("importProject.diagnostics.sourceSheet", { sheet: item.location.sheetName })
          : null,
        item.location.row !== null
          ? t("importProject.diagnostics.sourceRow", { row: item.location.row })
          : null,
        item.location.column !== null
          ? t("importProject.diagnostics.sourceColumn", { column: item.location.column })
          : null,
      ].filter((part): part is string => Boolean(part)).join(", ");
      return `${item.value} m (${source})`;
    })
    .join("; ");

  return t(`importProject.diagnostics.${diagnostic.code}`, {
    count: diagnostic.count,
    locations,
    values,
    x: diagnostic.xMm,
    y: diagnostic.yMm,
    defaultValue: diagnostic.fallbackMessage,
  });
}
