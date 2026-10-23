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

  const advice = diagnostic.advice;
  const field = advice?.field ? t(`importProject.advice.fields.${advice.field}`) : "";
  const action = advice?.field ? t(`importProject.advice.actions.${advice.field}`) : "";
  const requiredProfile = advice?.requiredProfile;
  const profile = requiredProfile ? t(`importProject.profile.${requiredProfile === "capacity-columns" ? "capacityColumns" : "standardTable"}`) : "";
  const message = t(`importProject.diagnostics.${diagnostic.code}`, {
    field, action, profile,
    value: advice?.value ?? "",
    sizes: advice?.pileSizesMm.join(", ") ?? "",
    columns: advice?.columnCount,
    unit: advice?.expectedUnit ? t(`importProject.advice.units.${advice.expectedUnit}`) : "",
    count: diagnostic.count,
    locations,
    values,
    x: diagnostic.xMm,
    y: diagnostic.yMm,
    defaultValue: diagnostic.fallbackMessage,
  });
  const location=diagnostic.location;
  if (!location) return message;
  const source=[location.fileName,
    location.sheetName ? t("importProject.diagnostics.sourceSheet",{sheet:location.sheetName}) : null,
    location.row !== null ? t("importProject.diagnostics.sourceRow",{row:location.row}) : null,
    location.column !== null ? t("importProject.diagnostics.sourceColumn",{column:location.column}) : null,
  ].filter(Boolean).join(", ");
  return `${message} (${source})`;

}
