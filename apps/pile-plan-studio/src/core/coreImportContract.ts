import type { ImportFileRole } from "./importFiles.ts";

export type ImportSourceInput = {
  role: ImportFileRole;
  fileName: string;
  format: "csv" | "xlsx";
  bytes: Uint8Array;
};

export function toCoreImportSource(source: ImportSourceInput) {
  return {
    role: source.role,
    file_name: source.fileName,
    format: source.format,
    bytes: source.bytes,
  };
}
