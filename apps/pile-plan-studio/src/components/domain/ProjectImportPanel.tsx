import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { previewImportSourceCore } from "../../core/coreClient.ts";
import {
  type ImportProfile,
  type ImportProfileOptions,
  type ImportSourceInput,
  type ImportSourcePreview,
} from "../../core/coreImportContract.ts";
import {
  getImportFileFormat,
  inferImportFileAssignments,
  type ImportFileRole,
} from "../../core/importFiles.ts";
import type { ImportSummary } from "../../core/projectFile.ts";
import {
  applyImportPreview,
  beginImportPreview,
  canImportProject,
  createEmptyImportDrafts,
  failImportPreview,
  setImportFile,
  setImportProfile,
  setImportProfileOptions,
  type ImportPreviewState,
} from "./projectImportModel.ts";
import "./projectImport.css";

const ROLES: Array<{ role: ImportFileRole; labelKey: string; columnsKey: string }> = [
  { role: "load-points", labelKey: "importProject.roles.loadPoints", columnsKey: "importProject.columns.loadPoints" },
  { role: "cpts", labelKey: "importProject.roles.cpts", columnsKey: "importProject.columns.cpts" },
  { role: "bearing-capacities", labelKey: "importProject.roles.foundationAdvice", columnsKey: "importProject.columns.foundationAdvice" },
];

const EMPTY_OPTIONS: ImportProfileOptions = {
  coordinateSheet: null,
  reactionSheet: null,
};

export default function ProjectImportPanel({
  onImportProject,
}: {
  onImportProject: (projectName: string, sources: ImportSourceInput[]) => Promise<ImportSummary | null>;
}) {
  const { t } = useTranslation("common");
  const [projectName, setProjectName] = useState(() => t("importProject.defaultName"));
  const [drafts, setDrafts] = useState(() => createEmptyImportDrafts<File>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const nextRequestId = useRef(0);

  const previewFile = async (
    role: ImportFileRole,
    file: File,
    profile: ImportProfile,
    profileOptions: ImportProfileOptions,
  ) => {
    const format = getImportFileFormat(file.name);
    if (!format) return;
    const requestId = ++nextRequestId.current;
    setDrafts((current) => beginImportPreview(current, role, requestId));
    try {
      const preview = await previewImportSourceCore({
        role,
        profile,
        profileOptions,
        fileName: file.name,
        format,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      setDrafts((current) => applyImportPreview(current, role, requestId, preview));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setDrafts((current) => failImportPreview(current, role, requestId, message));
    }
  };

  const assignRoleFile = (role: ImportFileRole, file: File | null) => {
    setDrafts((current) => setImportFile(current, role, file));
    setError(null);
    if (file) void previewFile(role, file, "auto", EMPTY_OPTIONS);
  };

  const assignFiles = (files: File[]) => {
    const currentAssignments = Object.fromEntries(
      ROLES.map(({ role }) => [role, drafts[role].file]),
    ) as Record<ImportFileRole, File | null>;
    const assignments = inferImportFileAssignments(files, currentAssignments);
    ROLES.forEach(({ role }) => {
      if (assignments[role] && assignments[role] !== drafts[role].file) {
        assignRoleFile(role, assignments[role]);
      }
    });
  };

  const changeProfile = (role: ImportFileRole, profile: ImportProfile) => {
    const file = drafts[role].file;
    setDrafts((current) => setImportProfile(current, role, profile));
    if (file) void previewFile(role, file, profile, EMPTY_OPTIONS);
  };

  const changeRfemOptions = (role: ImportFileRole, options: ImportProfileOptions) => {
    const draft = drafts[role];
    setDrafts((current) => setImportProfileOptions(current, role, options));
    if (draft.file) void previewFile(role, draft.file, draft.requestedProfile, options);
  };

  const importProject = async () => {
    if (!canImportProject(drafts)) return;
    setBusy(true);
    setError(null);
    try {
      const sources = await Promise.all(ROLES.map(async ({ role }) => {
        const draft = drafts[role];
        const file = draft.file!;
        const format = getImportFileFormat(file.name);
        if (!format) throw new Error(`Unsupported file format: ${file.name}`);
        return {
          role,
          profile: draft.requestedProfile,
          profileOptions: draft.profileOptions,
          fileName: file.name,
          format,
          bytes: new Uint8Array(await file.arrayBuffer()),
        };
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
        {ROLES.map(({ role, labelKey, columnsKey }) => {
          const draft = drafts[role];
          const preview = draft.previewState.status === "ready" ? draft.previewState.preview : null;
          return (
            <section className="project-import-source-card" key={role}>
              <div className="project-import-source-header">
                <div>
                  <strong>{t(labelKey)}</strong>
                  <small>{t(columnsKey)}</small>
                </div>
                <label>
                  <span>{t("importProject.profile.label")}</span>
                  <select
                    value={draft.requestedProfile}
                    onChange={(event) => changeProfile(role, event.target.value as ImportProfile)}
                  >
                    {profileChoices(draft.file?.name ?? null, role, preview).map((profile) => (
                      <option key={profile} value={profile}>{t(`importProject.profile.${profileKey(profile)}`)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="project-import-file-row">
                <span className="project-import-file-name" title={draft.file?.name}>
                  {draft.file?.name ?? t("importProject.noFile")}
                </span>
                <label className="project-import-replace">
                  {draft.file ? t("importProject.replace") : t("importProject.choose")}
                  <input type="file" accept=".csv,.xlsx" onChange={(event) => assignRoleFile(role, event.target.files?.[0] ?? null)} />
                </label>
                <button type="button" disabled={!draft.file} onClick={() => assignRoleFile(role, null)}>
                  {t("importProject.remove")}
                </button>
              </div>

              <ImportStatus previewState={draft.previewState} t={t} />
              {preview?.details?.kind === "rfem-export" && (
                <RfemAnalysis
                  preview={preview}
                  options={draft.profileOptions}
                  onChange={(options) => changeRfemOptions(role, options)}
                  t={t}
                />
              )}
            </section>
          );
        })}
      </div>

      {error && <p className="project-import-error" role="alert">{error}</p>}
      {summary && (
        <section className="project-import-summary" aria-label={t("importProject.summaryAria")}>
          <strong>{t("importProject.completed")}</strong>
          <span>{t("importProject.summary", { loadPoints: summary.loadPointCount.toLocaleString(), cpts: summary.cptCount.toLocaleString(), advice: summary.bearingCapacityCount.toLocaleString() })}</span>
          {summary.warnings.length > 0 && <ul>{summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        </section>
      )}
      <button className="project-import-submit" type="button" disabled={busy || !canImportProject(drafts)} onClick={importProject}>
        {busy ? t("importProject.importing") : t("importProject.submit")}
      </button>
    </div>
  );
}

function ImportStatus({ previewState, t }: {
  previewState: ImportPreviewState;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (previewState.status === "empty") return null;
  if (previewState.status === "analyzing") return <div className="project-import-status">{t("importProject.status.analyzing")}</div>;
  if (previewState.status === "failed") return <div className="project-import-status error">{previewState.message}</div>;
  const { preview } = previewState;
  const errors = preview.diagnostics.filter((item) => item.severity === "error");
  if (errors.length > 0) {
    return <div className="project-import-status error">{errors.map((item) => item.fallbackMessage).join(" ")}</div>;
  }
  if (preview.details?.kind === "rfem-export") return null;
  return (
    <div className="project-import-status valid">
      {t("importProject.status.validCount", { count: preview.itemCount })}
    </div>
  );
}

function RfemAnalysis({ preview, options, onChange, t }: {
  preview: ImportSourcePreview;
  options: ImportProfileOptions;
  onChange: (options: ImportProfileOptions) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (preview.details?.kind !== "rfem-export") return null;
  const details = preview.details;
  return (
    <div className="project-import-rfem">
      <div className="project-import-rfem-heading">
        <strong>{t("importProject.rfem.analysis")}</strong>
        <span>{preview.resolvedProfile ? t("importProject.status.valid") : t("importProject.status.needsInput")}</span>
      </div>
      <div className="project-import-rfem-grid">
        <span>{t("importProject.rfem.coordinateSheet")}</span>
        <SheetValue
          candidates={details.coordinateSheetCandidates}
          value={options.coordinateSheet}
          onChange={(coordinateSheet) => onChange({ ...options, coordinateSheet })}
          placeholder={t("importProject.rfem.selectSheet")}
        />
        <span>{t("importProject.rfem.reactionSheet")}</span>
        <SheetValue
          candidates={details.reactionSheetCandidates}
          value={options.reactionSheet}
          onChange={(reactionSheet) => onChange({ ...options, reactionSheet })}
          placeholder={t("importProject.rfem.selectSheet")}
        />
        <span>{t("importProject.rfem.loadRule")}</span>
        <span>{details.loadRule === "abs-min-pz-prime" && <>F<sub>Ed</sub> = |Min PZ'|</>}</span>
        <span>{t("importProject.rfem.result")}</span>
        <strong>{t("importProject.rfem.loadPointCount", { count: preview.itemCount })}</strong>
      </div>
      {preview.diagnostics.length > 0 && (
        <ul className="project-import-diagnostics">
          {preview.diagnostics.map((diagnostic, index) => (
            <li className={diagnostic.severity} key={`${diagnostic.code}-${index}`}>
              {t(`importProject.diagnostics.${diagnostic.code}`, {
                count: diagnostic.count,
                defaultValue: diagnostic.fallbackMessage,
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SheetValue({ candidates, value, onChange, placeholder }: {
  candidates: string[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  if (candidates.length <= 1) return <span>{value ?? candidates[0] ?? "-"}</span>;
  return (
    <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {candidates.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
    </select>
  );
}

function profileChoices(
  fileName: string | null,
  role: ImportFileRole,
  preview: ImportSourcePreview | null,
): ImportProfile[] {
  const format = fileName ? getImportFileFormat(fileName) : null;
  const choices = preview?.availableProfiles
    ?? (role === "load-points" && format === "xlsx"
      ? ["standard-table", "rfem-export"] as ImportProfile[]
      : ["standard-table"] as ImportProfile[]);
  return ["auto", ...choices.filter((profile) => profile !== "auto")];
}

function profileKey(profile: ImportProfile): string {
  return profile === "auto" ? "automatic" : profile === "standard-table" ? "standardTable" : "rfemExport";
}
