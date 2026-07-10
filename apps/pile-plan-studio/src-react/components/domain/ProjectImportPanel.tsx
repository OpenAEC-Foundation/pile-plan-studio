import { useState } from "react";
import {
  areImportFileAssignmentsComplete,
  emptyImportFileAssignments,
  getImportFileFormat,
  inferImportFileAssignments,
  type ImportFileAssignments,
  type ImportFileRole,
} from "../../../src/importFiles.ts";
import type { ImportSourceInput } from "../../../src/coreImportContract.ts";
import "./projectImport.css";

const ROLES: Array<{ role: ImportFileRole; label: string; columns: string }> = [
  { role: "load-points", label: "Load points", columns: "ID, X, Y, FED" },
  { role: "cpts", label: "CPTs", columns: "ID, X, Y" },
  { role: "bearing-capacities", label: "Bearing capacities", columns: "CPT ID, tip, size, FRD" },
];

export default function ProjectImportPanel({
  onImportProject,
}: {
  onImportProject: (projectName: string, sources: ImportSourceInput[]) => Promise<void>;
}) {
  const [projectName, setProjectName] = useState("Imported Project");
  const [assignments, setAssignments] = useState<ImportFileAssignments<File>>(
    emptyImportFileAssignments<File>(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignFiles = (files: File[]) => {
    setAssignments((current) => inferImportFileAssignments(files, current));
    setError(null);
  };

  const importProject = async () => {
    if (!areImportFileAssignmentsComplete(assignments)) return;
    setBusy(true);
    setError(null);
    try {
      const sources = await Promise.all(ROLES.map(async ({ role }) => {
        const file = assignments[role]!;
        const format = getImportFileFormat(file.name);
        if (!format) throw new Error(`Unsupported file format: ${file.name}`);
        return { role, fileName: file.name, format, bytes: new Uint8Array(await file.arrayBuffer()) };
      }));
      await onImportProject(projectName.trim() || "Imported Project", sources);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="project-import-panel">
      <h2>Import project data</h2>
      <label className="project-import-name">
        <span>Project name</span>
        <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
      </label>
      <label className="project-import-bulk">
        <span>Choose up to three files</span>
        <input type="file" accept=".csv,.xlsx" multiple onChange={(event) => assignFiles([...event.target.files ?? []])} />
      </label>
      <div className="project-import-sources">
        {ROLES.map(({ role, label, columns }) => (
          <div className="project-import-source" key={role}>
            <div><strong>{label}</strong><small>{columns}</small></div>
            <span title={assignments[role]?.name}>{assignments[role]?.name ?? "No file selected"}</span>
            <label className="project-import-replace">
              Choose
              <input type="file" accept=".csv,.xlsx" onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setAssignments((current) => ({ ...current, [role]: file }));
                setError(null);
              }} />
            </label>
            <button type="button" disabled={!assignments[role]} onClick={() => setAssignments((current) => ({ ...current, [role]: null }))}>Remove</button>
          </div>
        ))}
      </div>
      {error && <p className="project-import-error" role="alert">{error}</p>}
      <button className="project-import-submit" type="button" disabled={busy || !areImportFileAssignmentsComplete(assignments)} onClick={importProject}>
        {busy ? "Importing..." : "Import project"}
      </button>
    </div>
  );
}
