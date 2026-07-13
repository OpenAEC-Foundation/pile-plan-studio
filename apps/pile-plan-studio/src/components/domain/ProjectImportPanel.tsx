import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  areImportFileAssignmentsComplete,
  emptyImportFileAssignments,
  getImportFileFormat,
  inferImportFileAssignments,
  type ImportFileAssignments,
  type ImportFileRole,
} from "../../core/importFiles.ts";
import type { ImportSourceInput } from "../.././core/coreImportContract.ts";
import type { ImportSummary } from "../.././core/projectFile.ts";
import "./projectImport.css";

const ROLES: Array<{ role: ImportFileRole; labelKey: string; columnsKey: string }> = [
  { role: "load-points", labelKey: "importProject.roles.loadPoints", columnsKey: "importProject.columns.loadPoints" },
  { role: "cpts", labelKey: "importProject.roles.cpts", columnsKey: "importProject.columns.cpts" },
  { role: "bearing-capacities", labelKey: "importProject.roles.foundationAdvice", columnsKey: "importProject.columns.foundationAdvice" },
];

export default function ProjectImportPanel({
  onImportProject,
}: {
  onImportProject: (projectName: string, sources: ImportSourceInput[]) => Promise<ImportSummary | null>;
}) {
  const { t } = useTranslation("common");
  const [projectName, setProjectName] = useState(() => t("importProject.defaultName"));
  const [assignments, setAssignments] = useState<ImportFileAssignments<File>>(
    emptyImportFileAssignments<File>(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

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
      const result = await onImportProject(projectName.trim() || "Imported Project", sources);
      if (result) setSummary(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="project-import-panel">
      <h2>{t("importProject.title")}</h2>
      <label className="project-import-name">
        <span>{t("importProject.projectName")}</span>
        <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
      </label>
      <label className="project-import-bulk">
        <span>{t("importProject.chooseFiles")}</span>
        <input type="file" accept=".csv,.xlsx" multiple onChange={(event) => assignFiles([...event.target.files ?? []])} />
      </label>
      <div className="project-import-sources">
        {ROLES.map(({ role, labelKey, columnsKey }) => (
          <div className="project-import-source" key={role}>
            <div><strong>{t(labelKey)}</strong><small>{t(columnsKey)}</small></div>
            <span title={assignments[role]?.name}>{assignments[role]?.name ?? t("importProject.noFile")}</span>
            <label className="project-import-replace">
              {t("importProject.choose")}
              <input type="file" accept=".csv,.xlsx" onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setAssignments((current) => ({ ...current, [role]: file }));
                setError(null);
              }} />
            </label>
            <button type="button" disabled={!assignments[role]} onClick={() => setAssignments((current) => ({ ...current, [role]: null }))}>{t("importProject.remove")}</button>
          </div>
        ))}
      </div>
      {error && <p className="project-import-error" role="alert">{error}</p>}
      {summary && (
        <section className="project-import-summary" aria-label={t("importProject.summaryAria")}>
          <strong>{t("importProject.completed")}</strong>
          <span>{t("importProject.summary", { loadPoints: summary.loadPointCount.toLocaleString(), cpts: summary.cptCount.toLocaleString(), advice: summary.bearingCapacityCount.toLocaleString() })}</span>
          {summary.warnings.length > 0 && (
            <ul>{summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          )}
        </section>
      )}
      <button className="project-import-submit" type="button" disabled={busy || !areImportFileAssignmentsComplete(assignments)} onClick={importProject}>
        {busy ? t("importProject.importing") : t("importProject.submit")}
      </button>
    </div>
  );
}
