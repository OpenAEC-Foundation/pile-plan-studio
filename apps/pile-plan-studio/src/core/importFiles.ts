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
    || normalized.includes("trekkracht")
  ) {
    return "load-points";
  }

  const adviceNames = ["draag", "capacity", "capacities", "bearing", "fundering", "foundation", "advies", "advice", "weerstand", "resistance", "trekvermogen", "drukvermogen", "capaciteit"];
  const pileResistanceName = /\b(?:trek|druk)\b/.test(normalized)
    && /prefab|betonpalen|paal|vibro/.test(normalized);
  if (adviceNames.some(name => normalized.includes(name)) || pileResistanceName) {
    return "bearing-capacities";
  }

  if (normalized.includes("sonder") || normalized.includes("cpt")) {
    return "cpts";
  }

  return null;
}

export function getImportFileFormat(fileName: string): "csv" | "xlsx" | null {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".csv")) return "csv";
  if (normalized.endsWith(".xlsx")) return "xlsx";
  return null;
}

export function inferImportFileSelections<TFile extends NamedImportFile>(files: TFile[], current = emptyImportFileAssignments<TFile>()) {
  return { assignments: inferImportFileAssignments(files.filter(f => inferImportFileRole(f.name) !== "bearing-capacities"), current),
    adviceFiles: files.filter(f => inferImportFileRole(f.name) === "bearing-capacities") };
}
