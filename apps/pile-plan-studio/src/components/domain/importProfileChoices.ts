import type {
  ImportProfile,
  ImportSourcePreview,
} from "../../core/coreImportContract.ts";
import {
  getImportFileFormat,
  type ImportFileRole,
} from "../../core/importFiles.ts";

export function importProfileChoices(
  fileName: string | null,
  role: ImportFileRole,
  preview: ImportSourcePreview | null,
): ImportProfile[] {
  const format = fileName ? getImportFileFormat(fileName) : null;
  const choices = preview?.availableProfiles
    ?? (role === "load-points" && format !== "csv"
      ? ["standard-table", "rfem-export"] as ImportProfile[]
      : ["standard-table"] as ImportProfile[]);
  return ["auto", ...choices.filter((profile) => profile !== "auto")];
}
