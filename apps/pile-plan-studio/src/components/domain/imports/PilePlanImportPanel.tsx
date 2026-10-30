import SourceTableEditor from "./SourceTableEditor.tsx";
import PilePlanImportMatching from "./PilePlanImportMatching.tsx";
import { useState,useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePilePlanImportPreview } from "../../../app/import/usePilePlanImportPreview.ts";
import type {
  PilePlanImportPatch,
  PilePlanImportProfile,
} from "../../../core/pilePlanImportContract.ts";
import type { Cpt, LoadPoint, PileConfigurationKey } from "../../../core/projectTypes.ts";
import LocationMatchingEntry from "../location-matching/LocationMatchingEntry.tsx";
import ThemedSelect from "../../template/ThemedSelect.tsx";
import "../../template/ThemedSelect.css";
import { ifcImportIcon } from "../../template/ribbon/icons.ts";
import {
  canApplyPilePlanImport,
  canImportCptSelections,
  createPilePlanImportDraft,
  setPilePlanImportCategory,
  setPilePlanImportFile,
  setPilePlanImportProfile,
  setPilePlanImportTolerance,
  setPilePlanImportTable,
  setPilePlanImportDecisions,
  type PilePlanImportDraft,
} from "../../../domain/imports/pilePlanImportModel.ts";
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
  onImportPilePlan: (patch: PilePlanImportPatch, fileName: string) => void;
}) {
  const { t } = useTranslation("backstage");
  const {t:common}=useTranslation("common");
  const [matchingOpen,setMatchingOpen]=useState(false);
  useEffect(()=>setMatchingOpen(false),[loadPoints,cpts,availablePileConfigurations]);
  const [draft, setDraft] = useState(() => createPilePlanImportDraft<File>());
  const { preview } = usePilePlanImportPreview({ loadPoints, cpts, availablePileConfigurations }, setDraft);

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
  const shown=result??draft.lastPreview;
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

        </div>

        <div className="project-import-file-row">
          <span className="project-import-file-name" title={draft.file?.name}>
            {draft.file?.name ?? t("pilePlanImport.noFile")}
          </span>
          <label className="project-import-file-button">
            <span
              className="project-import-file-icon"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: ifcImportIcon }}
            />
            <span>{draft.file ? t("pilePlanImport.replace") : t("pilePlanImport.choose")}</span>
            <input
              className="project-import-native-file"
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => {changeFile(event.target.files?.[0] ?? null);event.target.value="";setMatchingOpen(false);}}
            />
          </label>
          <button className="project-import-button" type="button" disabled={!draft.file} onClick={() => changeFile(null)}>
            {t("pilePlanImport.remove")}
          </button>
        </div>

        {draft.file&&<SourceTableEditor role="pile-plan" preview={shown?.table} settings={draft.table} csv={draft.file.name.toLowerCase().endsWith(".csv")}
          sourceErrors={shown?.diagnostics.filter(d=>d.severity==="error"&&d.location?.row!=null).map(d=>({row:d.location!.row!,column:d.location!.column,message:diagnosticLabel(d.code,t)}))}
          onChange={table=>void preview(setPilePlanImportTable(draft,table))}>
          <label className="project-import-profile">
            <span>{t("pilePlanImport.profile")}</span>
            <ThemedSelect
              ariaLabel={t("pilePlanImport.profile")}
              value={draft.requestedProfile}
              options={[
                { value: "automatic", label: t("pilePlanImport.profiles.automatic") },
                { value: "standard-table", label: t("pilePlanImport.profiles.standard") },
                { value: "legacy", label: t("pilePlanImport.profiles.legacy") },
              ]}
              onChange={(value) => changeProfile(value as PilePlanImportProfile)}
            />
          </label>
        <div className="pile-plan-import-controls">
          <fieldset className="pile-plan-import-categories">
            <legend>{t("pilePlanImport.apply")}</legend>
            <label>
              <input
                type="checkbox"
                checked={draft.importPileAssignments}
                disabled={shown?.supportsPileAssignments===false}
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
        {!cptImportAvailable && <p className="pile-plan-import-note">{shown?.detectedProfile==="legacy"?t("pilePlanImport.legacyCptNote"):common("pilePlanMatching.mapCpts")}</p>}
          <p className="source-import-help">{common("pilePlanMatching.clearHelp")}</p>
          <p className="source-import-help">{common("pilePlanMatching.cptHelp")}</p>
        </SourceTableEditor>}
        <PreviewStatus draft={draft} />
      </section>

      {shown?.matching&&<LocationMatchingEntry
        summary={common("pilePlanMatching.summary",{linked:shown.matching.links.length,pending:shown.matching.unmatched_new.length,skipped:shown.matching.added.length})}
        help={common("pilePlanMatching.matchHelp")} reviewed={!!draft.locationDecisions&&!!result?.matching?.complete}
        disabled={!result?.matching} tolerance={draft.coordinateToleranceMm} onToleranceChange={changeTolerance} onOpen={()=>setMatchingOpen(true)}/>}
      {matchingOpen&&result?.matching&&draft.file&&<PilePlanImportMatching draft={draft} result={result} loadPoints={loadPoints} cpts={cpts} availablePileConfigurations={availablePileConfigurations}
        onCancel={()=>setMatchingOpen(false)} onConfirm={(decisions,tolerance)=>{setMatchingOpen(false);void preview(setPilePlanImportDecisions(setPilePlanImportTolerance(draft,String(tolerance)),decisions));}}/>}

      {result && (
        <section className="pile-plan-import-results">
          <div className="pile-plan-import-summary">
            <strong>{t("pilePlanImport.previewTitle")}</strong>
            <span>{t("pilePlanImport.detected", { profile: profileLabel(result.detectedProfile, t) })}</span>
            <span>{t("pilePlanImport.summary", {
              matched: result.summary.matchedRows,
              total: result.summary.sourceRows,
              skipped: Math.max(0,result.summary.skippedRows-(result.matching?.unmatched_new.length??0)),
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
          if (result && draft.file && canApplyPilePlanImport(draft)) {
            onImportPilePlan(result.patch, draft.file.name);
          }
        }}
      >
        {t("pilePlanImport.import")}
      </button>
    </div>
  );
}

function PreviewStatus({ draft }: { draft: PilePlanImportDraft<File> }) {
  const { t } = useTranslation("backstage");
  const {t:common}=useTranslation("common");
  if (draft.previewState.status === "empty") return null;
  if (draft.previewState.status === "analyzing") {
    return <div className="project-import-status analyzing"><span className="project-import-status-dot" />{t("pilePlanImport.analyzing")}</div>;
  }
  if (draft.previewState.status === "failed") {
    return <p className="project-import-error" role="alert">{draft.previewState.message}</p>;
  }
  return <div className={`project-import-status ${canApplyPilePlanImport(draft) ? "valid" : "error"}`}><span className="project-import-status-dot" />{draft.previewState.preview.matching?.unmatched_new.length?common("pilePlanMatching.reviewNeeded"):t(canApplyPilePlanImport(draft) ? "pilePlanImport.ready" : "pilePlanImport.invalid")}</div>;
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
