export type ImportFileRole = "load-points" | "cpts" | "bearing-capacities";

export type NamedImportFile = {
  name: string;
};

export type ImportFileAssignments<TFile extends NamedImportFile> = Record<ImportFileRole, TFile | null>;

export function emptyImportFileAssignments<TFile extends NamedImportFile>(): ImportFileAssignments<TFile> {
  return {
    "load-points": null,
    cpts: null,
    "bearing-capacities": null,
  };
}

export function inferImportFileAssignments<TFile extends NamedImportFile>(
  files: TFile[],
  current: ImportFileAssignments<TFile> = emptyImportFileAssignments<TFile>(),
): ImportFileAssignments<TFile> {
  const assignments = { ...current };

  files.forEach((file) => {
    const role = inferImportFileRole(file.name);
    if (role && !assignments[role]) {
      assignments[role] = file;
    }
  });

  return assignments;
}

export function inferImportFileRole(fileName: string): ImportFileRole | null {
  const normalized = fileName.toLowerCase();

  if (!getImportFileFormat(normalized)) {
    return null;
  }

  if (
    normalized.includes("belasting")
    || normalized.includes("load-point")
    || normalized.includes("load_point")
    || normalized.includes("rfem")
  ) {
    return "load-points";
  }

  if (normalized.includes("sonder") || normalized.includes("cpt")) {
    return "cpts";
  }

  if (normalized.includes("draag") || normalized.includes("capacity") || normalized.includes("bearing")) {
    return "bearing-capacities";
  }

  return null;
}

export function getImportFileFormat(fileName: string): "csv" | "xlsx" | null {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".csv")) return "csv";
  if (normalized.endsWith(".xlsx")) return "xlsx";
  return null;
}

export function areImportFileAssignmentsComplete(assignments: ImportFileAssignments<NamedImportFile>): boolean {
  return Boolean(assignments["load-points"] && assignments.cpts && assignments["bearing-capacities"]);
}
