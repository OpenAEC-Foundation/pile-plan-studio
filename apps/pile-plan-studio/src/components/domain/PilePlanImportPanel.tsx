import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { previewPilePlanImportCore } from "../../core/coreClient.ts";
import { getImportFileFormat } from "../../core/importFiles.ts";
import type {
  PilePlanImportPatch,
  PilePlanImportProfile,
} from "../../core/pilePlanImportContract.ts";
import type { Cpt, LoadPoint, PileConfigurationKey } from "../../core/projectTypes.ts";
import {
  applyPilePlanImportPreview,
  beginPilePlanImportPreview,
  canApplyPilePlanImport,
  canImportCptSelections,
  createPilePlanImportDraft,
  failPilePlanImportPreview,
  pilePlanImportTolerance,
  setPilePlanImportCategory,
  setPilePlanImportFile,
  setPilePlanImportProfile,
  setPilePlanImportTolerance,
  type PilePlanImportDraft,
} from "./pilePlanImportModel.ts";
import "./projectImport.css";
import "./pilePlanImport.css";

export default function PilePlanImportPanel({
  loadPoints,
  cpts,
  availablePileConfigurations,
  onImportPilePlan,
}: {
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  availablePileConfigurations: PileConfigurationKey[];
  onImportPilePlan: (patch: PilePlanImportPatch) => void;
}) {
  const { t } = useTranslation("backstage");
  const [draft, setDraft] = useState(() => createPilePlanImportDraft<File>());
  const nextRequestId = useRef(0);

  const preview = async (next: PilePlanImportDraft<File>) => {
    const tolerance = pilePlanImportTolerance(next);
    const file = next.file;
    const format = file ? getImportFileFormat(file.name) : null;
    if (!file || !format || tolerance === null || (!next.importPileAssignments && !next.importCptSelections)) {
      setDraft(next);
      return;
    }

    const requestId = ++nextRequestId.current;
    setDraft(beginPilePlanImportPreview(next, requestId));
    try {
      const result = await previewPilePlanImportCore({
        fileName: file.name,
        format,
        bytes: new Uint8Array(await file.arrayBuffer()),
        profile: next.requestedProfile,
        options: {
          importPileAssignments: next.importPileAssignments,
          importCptSelections: next.importCptSelections,
          coordinateToleranceMm: tolerance,
        },
        loadPoints,
        cpts,
        availablePileConfigurations,
      });
      setDraft((current) => applyPilePlanImportPreview(current, requestId, result));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setDraft((current) => failPilePlanImportPreview(current, requestId, message));
    }
  };

  const changeFile = (file: File | null) => {
    void preview(setPilePlanImportFile(draft, file));
  };
  const changeProfile = (profile: PilePlanImportProfile) => {
    void preview(setPilePlanImportProfile(draft, profile));
  };
  const changeTolerance = (value: string) => {
    void preview(setPilePlanImportTolerance(draft, value));
  };
  const changeCategory = (category: "piles" | "cpts", enabled: boolean) => {
    void preview(setPilePlanImportCategory(draft, category, enabled));
  };

  const result = draft.previewState.status === "ready" ? draft.previewState.preview : null;
  const cptImportAvailable = canImportCptSelections(draft);

  return (
    <div className="project-import-panel pile-plan-import-panel">
      <header className="project-import-heading">
        <h2 className="backstage-panel-title">{t("pilePlanImport.title")}</h2>
        <p className="backstage-panel-intro">{t("pilePlanImport.intro")}</p>
      </header>

      <section className="project-import-source-card">
        <div className="project-import-source-header pile-plan-import-header">
          <div>
            <strong>{t("pilePlanImport.fileTitle")}</strong>
            <small>{t("pilePlanImport.fileDescription")}</small>
          </div>
          <label className="project-import-profile">
            <span>{t("pilePlanImport.profile")}</span>
            <select
              className="project-import-field"
              value={draft.requestedProfile}
              onChange={(event) => changeProfile(event.target.value as PilePlanImportProfile)}
            >
              <option value="automatic">{t("pilePlanImport.profiles.automatic")}</option>
              <option value="standard-table">{t("pilePlanImport.profiles.standard")}</option>
              <option value="legacy">{t("pilePlanImport.profiles.legacy")}</option>
            </select>
          </label>
        </div>

        <div className="project-import-file-row">
          <span className="project-import-file-name" title={draft.file?.name}>
            {draft.file?.name ?? t("pilePlanImport.noFile")}
          </span>
          <label className="project-import-file-button">
            <FileIcon />
            <span>{draft.file ? t("pilePlanImport.replace") : t("pilePlanImport.choose")}</span>
            <input
              className="project-import-native-file"
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => changeFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button className="project-import-button" type="button" disabled={!draft.file} onClick={() => changeFile(null)}>
            {t("pilePlanImport.remove")}
          </button>
        </div>

        <div className="pile-plan-import-controls">
          <label className="pile-plan-import-tolerance">
            <span>{t("pilePlanImport.tolerance")}</span>
            <span className="pile-plan-import-number">
              <input
                className="project-import-field"
                type="number"
                min="0"
                step="0.1"
                value={draft.coordinateToleranceMm}
                onChange={(event) => changeTolerance(event.target.value)}
              />
              <span>mm</span>
            </span>
          </label>
          <fieldset className="pile-plan-import-categories">
            <legend>{t("pilePlanImport.apply")}</legend>
            <label>
              <input
                type="checkbox"
                checked={draft.importPileAssignments}
                onChange={(event) => changeCategory("piles", event.target.checked)}
              />
              <span>{t("pilePlanImport.pileAssignments")}</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.importCptSelections}
                disabled={!canImportCptSelections(draft)}
                onChange={(event) => changeCategory("cpts", event.target.checked)}
              />
              <span>{t("pilePlanImport.cptSelections")}</span>
            </label>
          </fieldset>
        </div>
        {!cptImportAvailable && <p className="pile-plan-import-note">{t("pilePlanImport.legacyCptNote")}</p>}
        <PreviewStatus draft={draft} />
      </section>

      {result && (
        <section className="pile-plan-import-results">
          <div className="pile-plan-import-summary">
            <strong>{t("pilePlanImport.previewTitle")}</strong>
            <span>{t("pilePlanImport.detected", { profile: profileLabel(result.detectedProfile, t) })}</span>
            <span>{t("pilePlanImport.summary", {
              matched: result.summary.matchedRows,
              total: result.summary.sourceRows,
              skipped: result.summary.skippedRows,
              fallbacks: result.summary.coordinateFallbacks,
              conflicts: result.summary.conflicts,
            })}</span>
          </div>
          {result.diagnostics.length > 0 && (
            <ul className="pile-plan-import-diagnostics">
              {result.diagnostics.map((diagnostic, index) => (
                <li className={diagnostic.severity} key={`${diagnostic.code}-${index}`}>
                  {diagnosticLabel(diagnostic.code, t)}{formatDiagnosticLocation(diagnostic.location, t)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <button
        className="primary-action project-import-submit"
        type="button"
        disabled={!canApplyPilePlanImport(draft)}
        onClick={() => {
          if (result && canApplyPilePlanImport(draft)) onImportPilePlan(result.patch);
        }}
      >
        {t("pilePlanImport.import")}
      </button>
    </div>
  );
}

function PreviewStatus({ draft }: { draft: PilePlanImportDraft<File> }) {
  const { t } = useTranslation("backstage");
  if (draft.previewState.status === "empty") return null;
  if (draft.previewState.status === "analyzing") {
    return <div className="project-import-status analyzing"><span className="project-import-status-dot" />{t("pilePlanImport.analyzing")}</div>;
  }
  if (draft.previewState.status === "failed") {
    return <p className="project-import-error" role="alert">{draft.previewState.message}</p>;
  }
  return <div className={`project-import-status ${draft.previewState.preview.canApply ? "valid" : "error"}`}><span className="project-import-status-dot" />{t(draft.previewState.preview.canApply ? "pilePlanImport.ready" : "pilePlanImport.invalid")}</div>;
}

function profileLabel(profile: PilePlanImportProfile | null, t: (key: string) => string): string {
  if (profile === "standard-table") return t("pilePlanImport.profiles.standard");
  if (profile === "legacy") return t("pilePlanImport.profiles.legacy");
  return t("pilePlanImport.profiles.unknown");
}

function diagnosticLabel(code: string, t: (key: string) => string): string {
  return t(`pilePlanImport.diagnostics.${code}`);
}

function formatDiagnosticLocation(
  location: { sheetName: string | null; row: number | null; column: number | null } | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!location || (location.row === null && location.column === null)) return "";
  return ` ${t("pilePlanImport.location", {
    sheet: location.sheetName ?? "-",
    row: location.row ?? "-",
    column: location.column ?? "-",
  })}`;
}

function FileIcon() {
  return (
    <span className="project-import-file-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M12 18v-6m-3 3h6" />
      </svg>
    </span>
  );
}
