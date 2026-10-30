import SourceTableEditor from "./SourceTableEditor.tsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdviceDraft, AdviceSourceDraft } from "../../../domain/imports/adviceImportModel.ts";
import { addAdviceSource, removeAdviceSource, replaceAdviceFile, replaceStoredAdvice, setAdviceProfile, setAdviceSheetSelection } from "../../../domain/imports/adviceImportModel.ts";
import type { StoredAdviceSource } from "../../../core/adviceImportContract.ts";
import type { ImportProfile } from "../../../core/coreImportContract.ts";
import { importDiagnosticText } from "../../../core/importDiagnosticText.ts";
import ThemedSelect from "../../template/ThemedSelect.tsx";
import { ifcImportIcon } from "../../template/ribbon/icons.ts";
import AdviceImportDiagnostics from "./AdviceImportDiagnostics.tsx";

type Props = { draft: AdviceDraft<File>; onChange: (fn: (d: AdviceDraft<File>) => AdviceDraft<File>) => void;
  refresh: boolean };

export default function AdviceImportSources({ draft, onChange, refresh }: Props) {
  const { t } = useTranslation("common");
  const [emptyCards, setEmptyCards] = useState<string[]>([]);
  const [emptyProfiles, setEmptyProfiles] = useState<Record<string, ImportProfile>>({});
  const stored = refresh ? draft.existingSources ?? [] : [];
  const sourceOrder=[...stored.map(s => `stored:${s.id}`),...draft.sources.filter(s => !s.replacementId || !refresh).map(s => s.id)];
  const sourceLabels=Object.fromEntries(sourceOrder.map((id,index) => [id,t("importProject.advice.sourceNumber",{count:index+1})]));
  const alreadyShownDiagnostics = draft.sources.flatMap(source => source.discovery.status === "ready"
    ? [...source.discovery.preview.diagnostics, ...source.discovery.preview.sheets.flatMap(sheet => sheet.diagnostics.slice(0, 1))]
    : []);
  for (const source of draft.sources) if(refresh && source.replacementId) sourceLabels[source.id]=sourceLabels[`stored:${source.replacementId}`];
  const profiles = ["auto", "standard-table", "capacity-columns"].map(value => ({value,
    label: t(`importProject.profile.${value === "auto" ? "automatic" : value === "standard-table" ? "standardTable" : "capacityColumns"}`)}));
  function card(key: string, source?: AdviceSourceDraft<File>, existing?: StoredAdviceSource) {
    const preview = source?.discovery.status === "ready" ? source.discovery.preview : source?.lastPreview??null;
    const sheets = preview?.sheets ?? [];
    const multiple = sheets.length > 1 && !source?.file.name.toLowerCase().endsWith(".csv");
    const selected = sheets.filter(s => !multiple || source?.sheetSelection?.some(v => v.sheetName === s.sheetName));
    const invalid = source?.discovery.status === "failed" || (preview && (sheets.length === 0 || selected.some(s => s.status !== "ready") || preview.diagnostics.some(d => d.severity === "error")));
    const count = selected.reduce((n,s) => n+s.summary.itemCount, 0);
    const fileName = source?.file.name ?? (existing ? existing.fileNames.join(", ") || t("importProject.advice.legacy") : t("importProject.noFile"));
    const profile = source?.requestedProfile ?? emptyProfiles[key] ?? "auto";
    const choose = (file: File) => {
      onChange(d => {
        if (source) return replaceAdviceFile(d, source.id, file);
        if (existing) { const next=replaceStoredAdvice(d, existing.id, file); return setAdviceProfile(next, next.sources.find(s => s.replacementId===existing.id)!.id, profile); }
        const id = crypto.randomUUID();
        return setAdviceProfile(addAdviceSource(d, id, file), id, profile);
      });
      setEmptyCards(cards => cards.filter(v => v !== key));
    };
    return <section key={key} className="project-import-source-card">
      <div className="project-import-source-header">
        <div><strong>{t("importProject.roles.foundationAdvice")}{sourceOrder.length>1 && (source || existing) ? ` (${sourceLabels[source?.id ?? `stored:${existing!.id}`]})` : ""}</strong><small>{refresh
          ? t(existing ? "importProject.advice.existing" : "importProject.advice.additional")
          : t("importProject.columns.foundationAdvice")}</small></div>

      </div>
      <div className="project-import-file-row">
        <span className="project-import-file-name" title={fileName}>{fileName}</span>
        <label className="project-import-file-button"><span className="project-import-file-icon" aria-hidden="true" dangerouslySetInnerHTML={{__html:ifcImportIcon}} />
          <span>{t(source || existing ? "importProject.replace" : "importProject.choose")}</span>
          <input type="file" accept=".csv,.xlsx" className="project-import-native-file" onChange={e => {
            const file=e.target.files?.[0]; if(file) choose(file); e.target.value="";
          }} />
        </label>
        <button type="button" className="project-import-button project-import-remove" disabled={!source && (Boolean(existing) || key === "default")}
          onClick={() => source ? onChange(d => removeAdviceSource(d,source.id)) : setEmptyCards(cards => cards.filter(v => v!==key))}>{t("importProject.remove")}</button>
      </div>
      {refresh && <small className="advice-import-operation">{t(existing?.combinedLegacy ? "importProject.advice.legacyHelp" : existing ? "importProject.advice.replaceHelp" : "importProject.advice.appendHelp")}</small>}
      {(source || existing) && !(preview && multiple && !selected.length) && <div className={`project-import-status ${invalid ? "error" : source && source.discovery.status !== "ready" ? "analyzing" : "valid"}`}>
        <span className="project-import-status-dot" />{invalid ? source?.discovery.status === "failed" ? source.discovery.message : t("importProject.advice.status.invalid")
          : source && source.discovery.status !== "ready" ? t("importProject.status.analyzing")
          : multiple && !selected.length ? t("importProject.advice.chooseSheets")
          : t("importProject.status.validCount",{count:source ? count : existing!.itemCount})}
      </div>}
      {source&&!preview&&<SourceTableEditor role="bearing-capacities" onChange={()=>{}}>
        <label className="project-import-profile"><span>{t("importProject.profile.label")}</span>
          <ThemedSelect value={profile} options={source?.file.name.toLowerCase().endsWith(".csv") ? profiles.filter(p => p.value !== "capacity-columns") : profiles}
            ariaLabel={`${t("importProject.profile.label")} ${fileName}`} onChange={value => source
              ? onChange(d => setAdviceProfile(d, source.id, value as ImportProfile))
              : setEmptyProfiles(p => ({...p,[key]:value as ImportProfile}))} />
        </label>
      </SourceTableEditor>}
      {preview?.diagnostics.map((d,i) => <p className="project-import-error" key={i}>{importDiagnosticText(d,t)}</p>)}
      {preview && <div className="advice-import-sheet-choice">
        {multiple && <small>{t("importProject.advice.chooseSheets")}</small>}
        {sheets.map(sheet => {
          const selection = source!.sheetSelection?.find(v => v.sheetName===sheet.sheetName);
          return <div className={multiple ? "advice-import-sheet" : "advice-import-single-sheet"} key={sheet.sheetName}>
            {multiple && <>
              <label><input type="checkbox" checked={!!selection} onChange={e => onChange(d => setAdviceSheetSelection(d,source!.id,
                e.target.checked ? [...source!.sheetSelection ?? [],{sheetName:sheet.sheetName,profile:sheet.resolvedProfile ?? profile,table:sheet.table?.settings}]
                  : (source!.sheetSelection ?? []).filter(v => v.sheetName!==sheet.sheetName)))} />{sheet.sheetName}</label>
              <span>{t(`importProject.advice.status.${sheet.status}`)}</span>
            </>}
            {(!multiple||selection)&&<SourceTableEditor key={`${source!.id}:${sheet.sheetName}`} preview={sheet.table} diagnostics={sheet.diagnostics} settings={selection?.table} role="bearing-capacities" matrix={(selection?.profile==="auto"||!selection)?sheet.resolvedProfile==="capacity-columns"||sheet.detectedProfile==="capacity-columns":selection.profile==="capacity-columns"}
              csv={source!.file.name.toLowerCase().endsWith(".csv")}
              onChange={table=>onChange(d=>setAdviceSheetSelection(d,source!.id,(source!.sheetSelection??[{sheetName:sheet.sheetName,profile:sheet.resolvedProfile??profile}]).map(v=>v.sheetName===sheet.sheetName?{...v,table,tensionColumn:null}:v)))}>
              <label className="project-import-profile"><span>{t("importProject.profile.label")}</span><ThemedSelect value={selection?.profile??profile} options={source!.file.name.toLowerCase().endsWith(".csv")?profiles.filter(p=>p.value!=="capacity-columns"):profiles} ariaLabel={`${t("importProject.profile.label")} ${sheet.sheetName||fileName}`}
                onChange={value=>onChange(d=>setAdviceSheetSelection(d,source!.id,(source!.sheetSelection??[{sheetName:sheet.sheetName,profile}]).map(v=>v.sheetName===sheet.sheetName?{...v,profile:value as ImportProfile,table:v.table?{pile_count:v.table.pile_count,fixed_pile_size_mm:value==="capacity-columns"?null:(v.table.fixed_pile_size_mm||null)}:null,tensionColumn:null}:v)))}/></label>
              {(selection?.profile==="capacity-columns"||(selection?.profile!=="standard-table"&&sheet.detectedProfile==="capacity-columns"))&&<label><span>{t("loadDirection.resistanceType")}</span><ThemedSelect value={selection?.direction??"compression"} ariaLabel={`${t("loadDirection.resistanceType")} ${sheet.sheetName||fileName}`}
                options={[{value:"compression",label:t("loadDirection.compressionResistance")},{value:"tension",label:t("loadDirection.tensionResistance")}]}
                onChange={value=>onChange(d=>setAdviceSheetSelection(d,source!.id,(source!.sheetSelection??[{sheetName:sheet.sheetName,profile:sheet.resolvedProfile??profile}]).map(v=>v.sheetName===sheet.sheetName?{...v,direction:value as "compression"|"tension",tensionColumn:null}:v)))}/><small>{t("tableImport.matrixHelp")}</small></label>}
              <small className="source-import-help">{t("loadDirection.designResistanceHelp")}</small>
            </SourceTableEditor>}
            {(!multiple || selection) && sheet.diagnostics[0] && <p className="advice-import-primary-diagnostics project-import-error">{importDiagnosticText(sheet.diagnostics[0],t)}</p>}
          </div>;
        })}
      </div>}
      {preview && <details className="advice-import-details"><summary>{t("importProject.advice.details")}</summary>
        {selected.map(sheet => <div key={sheet.sheetName}><strong>{sheet.sheetName}</strong>
          {sheet.status === "ready" && <p>{t("importProject.advice.sheetSummary",{count:sheet.summary.itemCount,cpts:sheet.summary.cptCount,
            sizes:sheet.summary.pileSizesMm.join(", "),min:sheet.summary.minTipLevelMm===null ? "—" : sheet.summary.minTipLevelMm/1000,
            max:sheet.summary.maxTipLevelMm===null ? "—" : sheet.summary.maxTipLevelMm/1000,missing:sheet.summary.missingCellCount})}</p>}
          {sheet.diagnostics.slice(1).map((d,i) => <p key={i}>{importDiagnosticText(d,t)}</p>)}</div>)}
        <small>{t("importProject.advice.unitsAndRange")}</small>
      </details>}
    </section>;
  }
  return <div className="advice-import-sources">
    {stored.map(s => card(`stored:${s.id}`,draft.sources.find(v => v.replacementId===s.id),s))}
    {draft.sources.filter(s => !refresh || !s.replacementId).map(s => card(s.id,s))}
    {!stored.length && !draft.sources.length && card("default")}
    {emptyCards.map(key => card(key))}
    <button type="button" className="project-import-button advice-import-add" onClick={() => setEmptyCards(cards => [...cards,crypto.randomUUID()])}>{t("importProject.advice.addAdvice")}</button>
    <small>{t("importProject.advice.assumptions")}</small>
    {draft.previewState.status==="failed" && <p className="project-import-error">{draft.previewState.message}</p>}
    {draft.previewState.status==="ready" && (draft.sources.length>0 || draft.previewState.preview.conflicts.length>0) && <AdviceImportDiagnostics preview={draft.previewState.preview} sourceLabels={sourceLabels} alreadyShownDiagnostics={alreadyShownDiagnostics} />}
  </div>;
}
