import SourceTableEditor from "./SourceTableEditor.tsx";
import PilePlanImportMatching from "./PilePlanImportMatching.tsx";
import { useState,useEffect,useId } from "react";
import { useTranslation } from "react-i18next";
import { usePilePlanImportPreview } from "../../../app/import/usePilePlanImportPreview.ts";
import type {
  PilePlanImportPatch,
  PilePlanImportProfile,
} from "../../../core/pilePlanImportContract.ts";
import type { Cpt, LoadPoint, PileConfigurationKey } from "../../../core/projectTypes.ts";
import LocationMatchingEntry from "../location-matching/LocationMatchingEntry.tsx";
import { Banner, Button, Checkbox, Heading, OpenAECProvider, Select, Status } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "../../../openaec/openaec-components.css";
import SourceFileButton from "../shared/SourceFileButton.tsx";
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
import "./projectImportBlueprint.css";

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
  const pileColumnsHelpId=useId();
  const importWarningId = useId();
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
  const canImport = canApplyPilePlanImport(draft);
  const missingPileColumns = canImport && result?.supportsPileAssignments === false;
  const shown=result??draft.lastPreview;
  const cptImportAvailable = canImportCptSelections(draft);
  const unmatched = shown?.matching?.unmatched_new.length ?? 0;
  const skipped = shown?.matching?.added.length ?? 0;

  return (
    <OpenAECProvider sprite={spriteUrl}><div className="oa-app project-import-panel project-import-blueprint pile-plan-import-panel">
      <header className="project-import-heading">
        <Heading level="page">{t("pilePlanImport.title")}</Heading>
        <p className="backstage-panel-intro">{t("pilePlanImport.intro")}</p>
      </header>

      <section className="project-import-source-card">
        <div className="project-import-source-header pile-plan-import-header">
          <div>
            <Heading>{t("pilePlanImport.fileTitle")}</Heading>
            <small>{t("pilePlanImport.fileDescription")}</small>
          </div>

        </div>

        <div className="project-import-file-row">
          <span className="project-import-file-name" title={draft.file?.name}>
            {draft.file?.name ?? t("pilePlanImport.noFile")}
          </span>
          <SourceFileButton label={draft.file ? t("pilePlanImport.replace") : t("pilePlanImport.choose")}
            onFiles={files => { changeFile(files[0]); setMatchingOpen(false); }} />
          <Button disabled={!draft.file} onClick={() => changeFile(null)}>
            {t("pilePlanImport.remove")}
          </Button>
        </div>

        {draft.file&&<SourceTableEditor variant="blueprint" role="pile-plan" preview={shown?.table} settings={draft.table} csv={draft.file.name.toLowerCase().endsWith(".csv")}
          sourceErrors={shown?.diagnostics.filter(d=>d.severity==="error").map(d=>({
            row:d.location?.row??null,column:d.location?.column??null,message:diagnosticLabel(d.code,t)+formatDiagnosticLocation(d.location,t),
          }))}
          onChange={table=>void preview(setPilePlanImportTable(draft,table))}>
            <Select label={t("pilePlanImport.profile")}
              value={draft.requestedProfile}
              options={[
                { value: "automatic", label: t("pilePlanImport.profiles.automatic") },
                { value: "standard-table", label: t("pilePlanImport.profiles.standard") },
                { value: "legacy", label: t("pilePlanImport.profiles.legacy") },
              ]}
              onChange={event => changeProfile(event.currentTarget.value as PilePlanImportProfile)}
            />
        <div className="pile-plan-import-controls">
          <fieldset className="pile-plan-import-categories">
            <legend>{t("pilePlanImport.apply")}</legend>
              <Checkbox label={t("pilePlanImport.pileAssignments")}
                checked={draft.importPileAssignments}
                disabled={shown?.supportsPileAssignments===false}
                aria-describedby={shown?.supportsPileAssignments===false?pileColumnsHelpId:undefined}
                onChange={(event) => changeCategory("piles", event.target.checked)}
              />
              <Checkbox label={t("pilePlanImport.cptSelections")}
                checked={draft.importCptSelections}
                disabled={!canImportCptSelections(draft)}
                onChange={(event) => changeCategory("cpts", event.target.checked)}
              />
          </fieldset>
        </div>
        {shown?.supportsPileAssignments===false&&<p id={pileColumnsHelpId} className="pile-plan-import-note">{t("pilePlanImport.pileColumnsRequired")}</p>}
        {!cptImportAvailable && <p className="pile-plan-import-note">{shown?.detectedProfile==="legacy"?t("pilePlanImport.legacyCptNote"):common("pilePlanMatching.mapCpts")}</p>}
          <p className="source-import-help">{common("pilePlanMatching.clearHelp")}</p>
          <p className="source-import-help">{common("pilePlanMatching.cptHelp")}</p>
        </SourceTableEditor>}
        <PreviewStatus draft={draft} />
      </section>

      {shown?.matching&&<LocationMatchingEntry
        summary={common("pilePlanMatching.summary",{linked:shown.matching.links.length,pending:unmatched,skipped})}
        help={common("pilePlanMatching.matchHelp")} reviewed={!!draft.locationDecisions&&!!result?.matching?.complete}
        reviewAction={unmatched ? common("pilePlanMatching.reviewUnmatched") : undefined}
        notice={(unmatched>0||skipped>0) && <div className="pile-plan-matching-notice" role="status">
          {unmatched>0&&<p>{common(draft.importPileAssignments?"pilePlanMatching.unmatchedImpact":"pilePlanMatching.unmatchedRows",{count:unmatched})}</p>}
          {skipped>0&&<p>{common(draft.importPileAssignments?"pilePlanMatching.skippedImpact":"pilePlanMatching.skippedRows",{count:skipped})}</p>}
        </div>}
        disabled={!result?.matching} tolerance={draft.coordinateToleranceMm} onToleranceChange={changeTolerance} onOpen={()=>setMatchingOpen(true)}/>}
      {matchingOpen&&result?.matching&&draft.file&&<PilePlanImportMatching draft={draft} result={result} loadPoints={loadPoints} cpts={cpts} availablePileConfigurations={availablePileConfigurations}
        onCancel={()=>setMatchingOpen(false)} onConfirm={(decisions,tolerance)=>{setMatchingOpen(false);void preview(setPilePlanImportDecisions(setPilePlanImportTolerance(draft,String(tolerance)),decisions));}}/>}

      {result && (
        <section className="pile-plan-import-results">
          <div className="pile-plan-import-summary">
            <Heading>{t("pilePlanImport.previewTitle")}</Heading>
            <span>{t("pilePlanImport.detected", { profile: profileLabel(result.detectedProfile, t) })}</span>
            <span>{t("pilePlanImport.summary", {
              matched: result.summary.matchedRows,
              total: result.summary.sourceRows,
              skipped: Math.max(0,result.summary.skippedRows-(result.matching?.unmatched_new.length??0)),
              fallbacks: result.summary.coordinateFallbacks,
              conflicts: result.summary.conflicts,
            })}</span>
          </div>
          {result.diagnostics.some(diagnostic => diagnostic.severity !== "error") && (
            <ul className="pile-plan-import-diagnostics">
              {result.diagnostics.filter(diagnostic => diagnostic.severity !== "error").map((diagnostic, index) => (
                <li className={diagnostic.severity} key={`${diagnostic.code}-${index}`}>
                  <Banner tone={diagnostic.severity === "error" ? "error" : "warning"} word="">{diagnosticLabel(diagnostic.code, t)}{formatDiagnosticLocation(diagnostic.location, t)}</Banner>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {missingPileColumns && <div>
        <Banner tone="warning" word="">
          <span id={importWarningId}>{t("pilePlanImport.missingPileColumnsWarning")}</span>
        </Banner>
      </div>}
      <Button kind="primary"
        className="project-import-submit"
        disabled={!canImport}
        aria-describedby={missingPileColumns ? importWarningId : undefined}
        onClick={() => {
          if (result && draft.file && canImport) {
            onImportPilePlan(result.patch, draft.file.name);
          }
        }}
      >
        {t("pilePlanImport.import")}
      </Button>
    </div></OpenAECProvider>
  );
}

function PreviewStatus({ draft }: { draft: PilePlanImportDraft<File> }) {
  const { t } = useTranslation("backstage");
  const {t:common}=useTranslation("common");
  if (draft.previewState.status === "empty") return null;
  if (draft.previewState.status === "analyzing") {
    return <div className="project-import-status" role="status"><Status tone="info">{t("pilePlanImport.analyzing")}</Status></div>;
  }
  if (draft.previewState.status === "failed") {
    return <Banner tone="error" word="">{draft.previewState.message}</Banner>;
  }
  const preview=draft.previewState.preview;
  const ready=canApplyPilePlanImport(draft);
  const hasErrors=preview.diagnostics.some(diagnostic=>diagnostic.severity==="error");
  let message=t("pilePlanImport.ready");
  if(!ready){
    if(hasErrors)message=t("pilePlanImport.invalid");
    else if(!draft.importPileAssignments&&!draft.importCptSelections)message=t(preview.supportsPileAssignments===false&&!canImportCptSelections(draft)?"pilePlanImport.mapImportColumns":"pilePlanImport.chooseCategory");
    else if(preview.matching&&!preview.matching.complete)message=common("pilePlanMatching.reviewNeeded");
    else message=t("pilePlanImport.noChanges");
  }
  return <div className="project-import-status" role="status"><Status tone={ready ? "success" : "warning"}>{message}</Status></div>;
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
