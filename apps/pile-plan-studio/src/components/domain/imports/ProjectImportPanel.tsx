import SourceTableEditor from "./SourceTableEditor.tsx";
import SourceMeaningSelect from "./SourceMeaningSelect.tsx";
import AdviceImportSources from "./AdviceImportSources.tsx";
import AdviceImportDiagnostics from "./AdviceImportDiagnostics.tsx";
import { SourceImportError, type ProjectImportPreview } from "../../../core/adviceImportContract.ts";
import { previewProjectImportCore } from "../../../core/coreClient.ts";
import { useAdviceImportPreviews } from "../../../app/import/useAdviceImportPreviews.ts";
import { addAdviceSource, createEmptyAdviceDraft, type AdviceDraft } from "../../../domain/imports/adviceImportModel.ts";
import type { ImportDrafts } from "../../../domain/imports/projectImportModel.ts";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { prepareProjectImportRequest } from "../../../app/import/projectImportRequest.ts";
import { useProjectImportPreviews } from "../../../app/import/useProjectImportPreviews.ts";
import {
  type ImportProfile,
  type ImportProfileOptions,
  type ImportSourceInput,
  type ImportSourcePreview,
} from "../../../core/coreImportContract.ts";
import { importDiagnosticText } from "../../../core/importDiagnosticText.ts";
import {
  inferImportFileSelections,
  type ImportFileRole,
} from "../../../core/importFiles.ts";
import type { ImportSummary } from "../../../core/projectFile.ts";
import { Banner, Button, Checkbox, Heading, IconButton, OpenAECProvider, Select, Status, TextField } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "../../../openaec/openaec-components.css";
import ImportFileButton from "./ImportFileButton.tsx";
import { NumberField } from "../../template/NumberInput.tsx";
import { importProfileChoices } from "./importProfileChoices.ts";
import { normalizePileHeadLevel } from "../project/projectInformationModel.ts";
import {
  projectImportReadiness,
  createEmptyImportDrafts,
  setImportFile,
  setImportProfile,
  setImportProfileOptions,
  shouldWarnAboutMissingFoundationAdvice,
  type ImportPreviewState,
  type ProjectImportMode,
  type ProjectImportProperties,
} from "../../../domain/imports/projectImportModel.ts";
import "./projectImport.css";
import "./projectImportBlueprint.css";
import {useLoadPointRefreshReview, type PrepareLoadPointRefresh} from "../../../app/import/useLoadPointRefreshReview.ts";
import type {LoadPointRefreshSelection} from "../../../core/exportRevisionContract.ts";
import LocationMatchingEntry from "../location-matching/LocationMatchingEntry.tsx";
import LocationMatchingWorkspace from "../location-matching/LocationMatchingWorkspace.tsx";

const ROLES: Array<{ role: ImportFileRole; labelKey: string; columnsKey: string }> = [
  { role: "load-points", labelKey: "importProject.roles.loadPoints", columnsKey: "importProject.columns.loadPoints" },
  { role: "cpts", labelKey: "importProject.roles.cpts", columnsKey: "importProject.columns.cpts" },
  { role: "bearing-capacities", labelKey: "importProject.roles.foundationAdvice", columnsKey: "importProject.columns.foundationAdvice" },
];

const EMPTY_OPTIONS: ImportProfileOptions = {
  coordinateSheet: null,
  reactionSheet: null,
};

const CURRENCY_OPTIONS = ["EUR", "GBP", "USD"].map((currency) => ({ value: currency, label: currency }));

export type { ProjectImportProperties } from "../../../domain/imports/projectImportModel.ts";

export default function ProjectImportPanel({
  onImportProject,
  initialSource,
  defaultCurrencyCode,
  onPreviewProjectImport = (_mode, sources) => previewProjectImportCore({ sources, currentProject: null }),
  importPreviewContextKey = "",
  onPrepareLoadPointRefresh,
}: {
  onImportProject: (
    mode: ProjectImportMode,
    projectName: string | null,
    sources: ImportSourceInput[],
    properties: ProjectImportProperties | null,
    selection?: LoadPointRefreshSelection,
  ) => Promise<ImportSummary | null>;
  initialSource?: { role: ImportFileRole; file: File } | null;
  defaultCurrencyCode: string;
  onPreviewProjectImport?: (mode: ProjectImportMode, sources: ImportSourceInput[]) => Promise<ProjectImportPreview>;
  importPreviewContextKey?: string;
  onPrepareLoadPointRefresh?: PrepareLoadPointRefresh;
}) {
  const { t } = useTranslation("common");
  const levelHelpId = useId();
  const [mode, setMode] = useState<ProjectImportMode>("new-project");
  const [projectName, setProjectName] = useState(() => t("importProject.defaultName"));
  const [pileHeadLevel, setPileHeadLevel] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrencyCode);
  const [drafts, setDrafts] = useState<ImportDrafts<File>>(() => ({ ...createEmptyImportDrafts<File>(), advice: createEmptyAdviceDraft<File>() }));
  const [finalFailure, setFinalFailure] = useState<ProjectImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const { preview: previewFile } = useProjectImportPreviews(setDrafts);
  useAdviceImportPreviews(drafts, setDrafts, mode, importPreviewContextKey, onPreviewProjectImport);
  const normalizedPileHeadLevel = normalizePileHeadLevel(pileHeadLevel);
  const { canSubmit, showPileHeadLevelBlocker } = projectImportReadiness(drafts, mode, normalizedPileHeadLevel);
  const refreshReview = useLoadPointRefreshReview(importPreviewContextKey, drafts["load-points"].file,
    JSON.stringify([mode, drafts["load-points"].requestedProfile, drafts["load-points"].profileOptions]), onPrepareLoadPointRefresh);
  const needsLocationReview = mode === "refresh" && !!drafts["load-points"].file && !!onPrepareLoadPointRefresh;

  const missingProjectSources = mode === "new-project" && drafts.advice!.sources.length > 0
    ? !drafts["load-points"].file && !drafts.cpts.file ? "requiresLoadPointsAndCpts"
      : !drafts["load-points"].file ? "requiresLoadPoints"
      : !drafts.cpts.file ? "requiresCpts" : null
    : null;

  const updateAdvice = (fn: (draft: AdviceDraft<File>) => AdviceDraft<File>) => {
    setDrafts(current => ({ ...current, advice: fn(current.advice!) })); setError(null); setFinalFailure(null);
  };
  const addAdviceFiles = (files: File[]) => updateAdvice(d => files.reduce((current, file) => addAdviceSource(current, crypto.randomUUID(), file), d));
  const assignRoleFile = (role: ImportFileRole, file: File | null) => {
    if (role === "bearing-capacities") { if (file) addAdviceFiles([file]); return; }

    setDrafts((current) => setImportFile(current, role, file));
    setError(null);
    if (file) void previewFile(role, file, "auto", EMPTY_OPTIONS);
  };

  useEffect(() => {
    if (!initialSource) return;
    setMode("refresh");
    assignRoleFile(initialSource.role, initialSource.file);
  }, [initialSource]);

  const assignFiles = (files: File[]) => {
    const currentAssignments = Object.fromEntries(
      ROLES.map(({ role }) => [role, drafts[role].file]),
    ) as Record<ImportFileRole, File | null>;
    const { assignments, adviceFiles } = inferImportFileSelections(files, currentAssignments);
    if (adviceFiles.length) addAdviceFiles(adviceFiles);
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

  const openLocationReview = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);setError(null);
    try {
      const request=await prepareProjectImportRequest({drafts,mode,projectName,pileHeadLevelM:normalizedPileHeadLevel,currencyCode});
      if(request)await refreshReview.prepare(request.sources);
    } catch(reason) {
      setError(reason instanceof Error && reason.message==="project_changed" ? t("exportTools.projectChanged") : reason instanceof Error ? reason.message : String(reason));
    } finally {setBusy(false);}
  };

  const importProject = async () => {
    if (!canSubmit || (needsLocationReview && !refreshReview.selection)) return;
    setBusy(true);
    setError(null);
    setFinalFailure(null);
    try {
      const request = await prepareProjectImportRequest({
        drafts, mode, projectName, pileHeadLevelM: normalizedPileHeadLevel, currencyCode,
      });
      if (!request) return;
      const result = refreshReview.selection && needsLocationReview
        ? await onImportProject(request.mode, request.projectName, request.sources, request.properties, refreshReview.selection)
        : await onImportProject(request.mode, request.projectName, request.sources, request.properties);
      if (result) {
        setSummary(result);
        if (mode === "refresh") setDrafts({ ...createEmptyImportDrafts<File>(), advice: createEmptyAdviceDraft<File>() });
      }
    } catch (reason) {
      if (reason instanceof SourceImportError) setFinalFailure({ canApply: false, uniqueValueCount: 0, importedValueCount: 0, exactDuplicateCount: 0, orphanValueCount: 0, conflicts: reason.conflicts, diagnostics: reason.diagnostics });
      setError(reason instanceof Error && reason.message === "project_changed" ? t("exportTools.projectChanged") : reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OpenAECProvider sprite={spriteUrl}><div className="oa-app project-import-panel project-import-blueprint">
      <header className="project-import-heading">
        <Heading level="page">{t("importProject.title")}</Heading>
      </header>
      <fieldset className="project-import-controls" disabled={busy}>
      <div className="project-import-mode" role="group" aria-label={t("importProject.modes.label")}>
        {(["new-project", "refresh"] as const).map((value) => (
          <Button
            className={mode === value ? "is-active" : ""}
            type="button"
            key={value}
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setError(null);
              setSummary(null);
            }}
          >
            {t(value === "new-project" ? "importProject.modes.newProject" : "importProject.modes.refresh")}
          </Button>
        ))}
      </div>
      <p className="project-import-mode-description">
        {t(mode === "new-project" ? "importProject.modes.newProjectDescription" : "importProject.modes.refreshDescription")}
      </p>
      {mode === "new-project" && (
        <section className="project-import-properties-section">
          <Heading>{t("importProject.projectProperties")}</Heading>
          <div className="project-import-properties">
            <TextField label={t("importProject.projectName")} value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            <div className="project-import-reference">
              <NumberField label={<>{t("importProject.pileHeadLevel")} <span aria-hidden="true">*</span></>} type="text" step={0.1}
                aria-describedby={levelHelpId}
                aria-invalid={showPileHeadLevelBlocker}
                inputMode="decimal"
                required
                value={pileHeadLevel}
                onValueChange={setPileHeadLevel}
              />
              <IconButton small icon="ui.about" label={t("importProject.pileHeadLevelHelp")}
                className="project-import-reference-help" aria-describedby={levelHelpId} />
              <span id={levelHelpId} hidden>{t("importProject.pileHeadLevelHelp")}</span>
            </div>
              <Select label={t("importProject.currency")}
                value={currencyCode}
                options={CURRENCY_OPTIONS}
                onChange={event => setCurrencyCode(event.currentTarget.value)}
              />
          </div>
        </section>
      )}
      <div className="project-import-file-actions">
        <ImportFileButton label={t("importProject.chooseFiles")} multiple onFiles={assignFiles} />
      </div>

      <div className="project-import-sources">
        {ROLES.map(({ role, labelKey, columnsKey }) => {
          if (role === "bearing-capacities") return <AdviceImportSources key={role} draft={drafts.advice!} onChange={updateAdvice} refresh={mode === "refresh"} />;
          const draft = drafts[role];
          const preview = draft.previewState.status === "ready" || draft.previewState.status === "analyzing" ? draft.previewState.preview??draft.lastPreview??null : draft.lastPreview??null;
          return (
            <section className="project-import-source-card" key={role}>
              <div className="project-import-source-header">
                <div>
                  <Heading>{t(labelKey)}</Heading>
                  <small>{t(columnsKey)}</small>
                </div>

              </div>

              <div className="project-import-file-row">
                <span className="project-import-file-name" title={draft.file?.name}>
                  {draft.file?.name ?? t("importProject.noFile")}
                </span>
                <ImportFileButton label={draft.file ? t("importProject.replace") : t("importProject.choose")}
                  onFiles={files => assignRoleFile(role, files[0])} />
                <Button
                  className="project-import-remove"
                  type="button"
                  disabled={!draft.file}
                  onClick={() => assignRoleFile(role, null)}
                >
                  {t("importProject.remove")}
                </Button>
              </div>

              <ImportStatus previewState={draft.previewState} t={t} />
              {draft.file&&<SourceTableEditor variant="blueprint" preview={preview?.table} diagnostics={preview?.diagnostics} settings={draft.profileOptions.table} role={role} csv={draft.file.name.toLowerCase().endsWith(".csv")} processed={preview?.detectedProfile==="rfem-export"||draft.requestedProfile==="rfem-export"}
                onChange={table=>changeRfemOptions(role,{...draft.profileOptions,table})}>
                  <Select label={t("importProject.profile.label")}
                    value={draft.requestedProfile}
                    options={importProfileChoices(draft.file?.name ?? null, role, preview).map((profile) => ({
                      value: profile,
                      label: t(`importProject.profile.${profileKey(profile)}`),
                    }))}
                    onChange={event => changeProfile(role, event.currentTarget.value as ImportProfile)}
                  />
                {(preview?.detectedProfile==="rfem-export"||draft.requestedProfile==="rfem-export")&&<div className="project-import-tension-options">
                  <Checkbox label={t("loadDirection.importTension")} checked={draft.profileOptions.importTension??true} onChange={e=>changeRfemOptions(role,{...draft.profileOptions,importTension:e.target.checked,clearTension:false})}/>
                  <small>{t("tableImport.rfemHelp")}</small>
                </div>}
                {mode==="refresh"&&role==="load-points"&&!draft.profileOptions.importTension&&<Checkbox label={t("loadDirection.clearTension")} checked={draft.profileOptions.clearTension??false} onChange={e=>changeRfemOptions(role,{...draft.profileOptions,clearTension:e.target.checked})}/>}
                {preview?.details?.kind==="rfem-export"&&<RfemAnalysis preview={preview} options={draft.profileOptions} onChange={options=>changeRfemOptions(role,options)} t={t}/>}
              </SourceTableEditor>}
            </section>
          );
        })}
      </div>

      {missingProjectSources && <p className="project-import-mode-description" role="status">
        {t(`importProject.advice.${missingProjectSources}`)}
      </p>}
      {shouldWarnAboutMissingFoundationAdvice(drafts, mode) && (
        <Banner tone="warning" word="">
          {t("importProject.warnings.cptsWithoutFoundationAdvice")}
        </Banner>
      )}
      {error && <Banner tone="error" word="">{error}</Banner>}
      {summary && (
        <section aria-label={t("importProject.summaryAria")}><Banner tone="success" word={t("importProject.completed")}>
          <div className="project-import-summary-content">
          <span>{t("importProject.summary", { loadPoints: summary.loadPointCount.toLocaleString(), cpts: summary.cptCount.toLocaleString(), advice: summary.bearingCapacityCount.toLocaleString() })}</span>
          {summary.warnings.length > 0 && <ul>{summary.warnings.map((warning) => <li key={warning}>{warning === "load_refresh_removed_cap_proposals" ? t("exportTools.removedCapProposals") : warning}</li>)}</ul>}
          </div>
        </Banner></section>
      )}
      </fieldset>
      {needsLocationReview && <LocationMatchingEntry
        summary={refreshReview.selection ? t("locationMatchingEntry.refreshSummary",{linked:refreshReview.selection.decisions.links.length,added:refreshReview.selection.decisions.added.length,removed:refreshReview.selection.decisions.removed.length}) : undefined}
        help={t("locationMatchingEntry.refreshHelp")} reviewed={!!refreshReview.selection}
        disabled={busy||!canSubmit} onOpen={()=>void openLocationReview()}
        tolerance={refreshReview.tolerance} onToleranceChange={value=>refreshReview.setTolerance(Number(value))}/>}
      {needsLocationReview && refreshReview.preview && <LocationMatchingWorkspace
        key={JSON.stringify([importPreviewContextKey, refreshReview.tolerance])}
        oldLocations={refreshReview.preview.old_locations} newLocations={refreshReview.preview.new_locations}
        initial={refreshReview.preview.matching} toleranceMm={refreshReview.tolerance}
        onConfirm={refreshReview.confirm} onCancel={refreshReview.cancel} initialAutomatic={!refreshReview.selection}/>}
      {finalFailure && <AdviceImportDiagnostics preview={finalFailure} />}
      <div className="project-import-submit-area">
        <Button kind="primary" className="project-import-submit" disabled={busy || !canSubmit || (needsLocationReview && !refreshReview.selection)} onClick={importProject}>
          {busy
            ? t(mode === "refresh" ? "importProject.refreshing" : "importProject.importing")
            : t(mode === "refresh" ? "importProject.refreshSubmit" : "importProject.submit")}
        </Button>
        {showPileHeadLevelBlocker && (
          <p className="project-import-property-blocker" role="status">
            {t("importProject.pileHeadLevelRequired")}
          </p>
        )}
      </div>
    </div></OpenAECProvider>
  );
}
function ImportStatus({ previewState, t }: {
  previewState: ImportPreviewState;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (previewState.status === "empty") return null;
  if (previewState.status === "analyzing") {
    return (
      <div className="project-import-status" role="status"><Status tone="info">
        {t("importProject.status.analyzing")}
      </Status></div>
    );
  }
  if (previewState.status === "failed") {
    return (
      <Banner tone="error" word="">
        {previewState.message}
      </Banner>
    );
  }
  const { preview } = previewState;
  if (preview.details?.kind === "rfem-export") return null;
  const errors = preview.diagnostics.filter((item) => item.severity === "error");
  if (errors.length > 0) {
    return (
      <Banner tone="error" word="">
        {errors.map((item) => importDiagnosticText(item, t)).join(" ")}
      </Banner>
    );
  }
  return (
    <div className="project-import-status" role="status"><Status tone="success">
      {t("importProject.status.validCount", { count: preview.itemCount })}
    </Status></div>
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
        <Heading>{t("importProject.rfem.analysis")}</Heading>
        <Status tone={preview.resolvedProfile ? "success" : "warning"}>
          {preview.resolvedProfile ? t("importProject.status.valid") : t("importProject.status.needsInput")}
        </Status>
      </div>
      <div className="project-import-rfem-grid">
        <SheetValue
          label={t("importProject.rfem.coordinateSheet")}
          candidates={details.coordinateSheetCandidates}
          value={options.coordinateSheet}
          onChange={(coordinateSheet) => onChange({ ...options, coordinateSheet })}
          placeholder={t("importProject.rfem.selectSheet")}
        />
        <SheetValue
          label={t("importProject.rfem.reactionSheet")}
          candidates={details.reactionSheetCandidates}
          value={options.reactionSheet}
          onChange={(reactionSheet) => onChange({ ...options, reactionSheet })}
          placeholder={t("importProject.rfem.selectSheet")}
        />
        <span className="project-import-sheet-label">{t("importProject.rfem.loadRule")}</span>
        <span>{details.loadRule === "signed-vertical-envelope" ? t("loadDirection.rfemRule") : details.loadRule === "abs-min-pz-prime" && <>F<sub>Ed</sub> = |Min PZ'|</>}</span>
        <span className="project-import-sheet-label">{t("importProject.rfem.result")}</span>
        <strong>{t("importProject.rfem.loadPointCount", { count: preview.itemCount })}</strong>
      </div>
      {preview.diagnostics.length > 0 && (
        <ul className="project-import-diagnostics">
          {preview.diagnostics.map((diagnostic, index) => (
            <li className={diagnostic.severity} key={`${diagnostic.code}-${index}`}>
              {importDiagnosticText(diagnostic, t)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SheetValue({ candidates, value, onChange, placeholder, label }: {
  candidates: string[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  if (candidates.length <= 1) return <><span className="project-import-sheet-label">{label}</span><span>{value ?? candidates[0] ?? "-"}</span></>;
  return <SourceMeaningSelect compact label={label} value={value ?? ""}
    options={[{value:"",label:placeholder,disabled:true},...candidates.map(candidate=>({value:candidate,label:candidate}))]}
    onChange={event=>onChange(event.currentTarget.value)}/>;
}

function profileKey(profile: ImportProfile): string {
  return profile === "auto" ? "automatic" : profile === "standard-table" ? "standardTable" : "rfemExport";
}
