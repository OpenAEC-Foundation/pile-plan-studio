import {useFoundationAdviceInspection} from "../../../app/derived-state/useFoundationAdviceInspection.ts";
import {useDisplayOptions,useLoadDirection} from "../../../app/derived-state/LoadDirectionContext.tsx";
import CptEditScope from "./CptEditScope.tsx";
import CptUsageButton from "./CptUsageButton.tsx";
import type { CptEditCompletion, CptSelectionMethod } from "../../../app/project/manualCptEditController.ts";
import {useEffect,useRef,type ReactNode} from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { openCpt } from "../../../domain/workspace/selectionState.ts";
import { getCptFrdPanelModel, getSelectedCptOverviewModel, getSelectedLoadPoints } from "./rightPanelModel.ts";
import { cancelManualCptSelection, clearManualCptSelection, removeManualCpt, isManualCptSelectionPending, selectOnlyNearestCpts, startManualCptSelectionEdit, synchronizeManualCptSelection } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import { Banner, Button, IconButton, OpenAECProvider, Panel, Status } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "../../../openaec/openaec-components.css";
import "./cptPanel.css";
import { CoordinateReadout } from "../shared/CoordinateReadout.ts";
import { ResistanceLabel, localizeCptName, localizeCptTableValue, localizeLoadPointName } from "./PanelControls.tsx";

export default function CptPanel({ state, onStateChange: publishState, selectedLoadPoints, pileNumbers, saving = false, onSave, onApplyMethod }: {
  saving?: boolean;
  onSave?: (afterSave?: CptEditCompletion) => Promise<void>;
  onApplyMethod?: (method: CptSelectionMethod) => Promise<void>;
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>;
  pileNumbers?: ReadonlyMap<number, string>;
}) {
  const { t, i18n } = useTranslation("rightPanel");
  const {t:common}=useTranslation("common");
  const {mode}=useLoadDirection();
  const displayOptions=useDisplayOptions(state.pileOptionsByLoadPointId);
  const displayState={...state,pileOptionsByLoadPointId:displayOptions,bearingCapacities:state.bearingCapacities.filter(r=>(r.direction??"compression")===mode),cptFrdRowsByCptId:new Map([...state.cptFrdRowsByCptId].map(([id,rows])=>[id,rows.filter(r=>(r.direction??"compression")===mode)]))};
  const inspection=useFoundationAdviceInspection(state);
  const selectedCpt = getCptFrdPanelModel(displayState, i18n.language,inspection.rows);
  const draft = state.cptSelectionEditDraft;
  const isEditing = draft !== null;
  const onStateChange = (next: ProjectState) => publishState(synchronizeManualCptSelection(next));
  const formatMember = pileNumbers && ((id: number) =>
    localizeLoadPointName(t("loadPoints.name", { id }), t, pileNumbers.get(id)));
  const actions = <CptSelectionActions state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints}
    saving={saving} formatMember={formatMember} onSave={onSave} onApplyMethod={onApplyMethod} />;

  if (isEditing) {
    return <CptSelectionOverview state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} formatMember={formatMember} actions={actions} editing saving={saving} />;
  }

  if (selectedCpt) {
    return (
      <CptFrame title={localizeCptName(selectedCpt.cpt.name, t)}>
        <p className="cpt-panel-subtitle oa-secondary">{t("cpts.selected")}</p>
        {actions}
        <CoordinateReadout points={[selectedCpt.cpt]} locale={i18n.language} />
        {selectedCpt.rows.some(row=>row.highlighted)&&<p className="cpt-advice-selection-key">▶ {t("cpts.selectedPileAdvice")}</p>}
        {inspection.failed&&<Banner tone="warning" word="">{t("cpts.adviceHighlightFailed")}</Banner>}
        <CptTable
          label={t("cpts.selected")}
          highlighted={selectedCpt.rows.map((row,i)=>row.highlighted?i:-1).filter(i=>i>=0)} highlightLabel={t("cpts.selectedPileAdvice")} scrollKey={`${selectedCpt.cpt.id}:${mode}`}
          columns={[t("columns.size"), t("columns.tip"), ...(selectedCpt.rows.some(row=>row.pileCount!=null)?[common("tableImport.capPileCount")]:[]), <ResistanceLabel key="resistance" />]}
          rows={selectedCpt.rows.map((row) => [row.sizeLabel, row.tipLabel, ...(selectedCpt.rows.some(v=>v.pileCount!=null)?[row.pileCount==null?common("tableImport.allPileCounts"):String(row.pileCount)]:[]), row.frdLabel])}
        />
      </CptFrame>
    );
  }

  if (selectedLoadPoints.length === 0) {
    return (
      <CptFrame title={t("tabs.cpts")}>
        {actions}
        <div className="right-panel-empty">
          <strong>{t("empty.noCpts")}</strong>
          <span>{t("empty.selectCpt")}</span>
        </div>
      </CptFrame>
    );
  }

  return <CptSelectionOverview state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} formatMember={formatMember} actions={actions} editing={false} saving={saving} />;
}

function CptSelectionOverview({ state, onStateChange, selectedLoadPoints, formatMember, actions, editing, saving }: {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>;
  formatMember?: (id: number) => string;
  editing: boolean;
  saving: boolean;
  actions: ReactNode;
}) {
  const { t } = useTranslation("rightPanel");
  const editPending = saving || isManualCptSelectionPending(state);
  const {mode}=useLoadDirection();
  const displayOptions=useDisplayOptions(state.pileOptionsByLoadPointId);
  const overview = getSelectedCptOverviewModel({...state,pileOptionsByLoadPointId:displayOptions,bearingCapacities:state.bearingCapacities.filter(r=>(r.direction??"compression")===mode&&!r.missing)}, selectedLoadPoints, mode);
  const preview = state.cptSelectionPreview?.draft === state.cptSelectionEditDraft
    ? state.cptSelectionPreview
    : editing ? { status: "analyzing" as const } : null;
  const heading = t("tabs.cpts");
  const columnLabels: Record<string, ReactNode> = {
    CPT: t("cpts.name"),
    Selection: t("cpts.selection"),
    Distance: t("cpts.distance"),
    "Used by": t("cpts.usedBy"),
    "FRD range": <span aria-label={t("cpts.frdRange")}><ResistanceLabel qualifier={t("cpts.rangeQualifier")} /></span>,
    "Chosen pile FRD": <span aria-label={t("cpts.chosenPileFrd")} title={t("cpts.chosenPileFrd")}><ResistanceLabel /></span>,
    "Governing for": t("cpts.governingFor"),
  };

  return (
    <CptFrame title={heading}>
      {actions}
      {editing && preview?.status === "analyzing" ? (
        <div className="cpt-preview-status" role="status"><Status tone="info">{t("cpts.previewCalculating")}</Status></div>
      ) : null}
      {editing && preview?.status === "failed" ? (
        <Banner tone="error" word="" action={<Button compact disabled={saving} onClick={() => onStateChange({
            ...state, cptSelectionEditDraft: { ...state.cptSelectionEditDraft! }, cptSelectionPreview: null,
          })}>{t("cpts.retryPreview")}</Button>}>
          {t("cpts.previewFailed", { error: preview.error })}
        </Banner>
      ) : null}
      <div className="cpt-table-wrap">
        <table className="oa-table cpt-table" aria-label={heading}>
          <thead>
            <tr>
              {overview.columns.map((column) => <th key={column} scope="col">{columnLabels[column] ?? column}</th>)}
              {editing ? <th className="cpt-remove-cell" scope="col"><span className="sr-only">{t("actions.remove")}</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {overview.rows.length === 0 ? (
              <tr><td className="empty-table-cell" colSpan={overview.columns.length + (editing ? 1 : 0)}>{t("empty.noCptsAvailable")}</td></tr>
            ) : overview.rows.map((row) => (
              <tr
                className={row.governingLoadPointCount > 0 ? "is-governing" : undefined}
                key={row.cpt.id}
                title={row.governingLoadPointCount > 0
                  ? t("cpts.governingCount", { used: row.governingLoadPointCount, total: selectedLoadPoints.length })
                  : undefined}
              >
                {row.values.map((value, index) => {
                  const column = overview.columns[index];
                  const usageTitle = column === "Used by" && row.usageDetails
                    ? t("cpts.usedByDetails", {
                        loadPoints: formatMember ? row.usingLoadPointIds.map(formatMember).join(", ") : row.usageDetails,
                      })
                    : undefined;

                  return (
                    <td key={`${row.cpt.id}-${column}`}>
                      {column === "Used by" ? (
                        <CptUsageButton state={state} ids={row.usingLoadPointIds} formatMember={formatMember} onStateChange={onStateChange} disabled={saving} tooltip={usageTitle}>
                          {localizeCptTableValue(column, value, t)}
                        </CptUsageButton>
                      ) : overview.columns[index] === "CPT" && !editing ? (
                        <Button compact kind="quiet"
                          className="cpt-link"
                          type="button"
                          onClick={() => onStateChange({ ...state, ...openCpt(state, row.cpt.id) })}
                        >
                          {localizeCptName(value, t)}
                        </Button>
                      ) : overview.columns[index] === "CPT"
                        ? localizeCptName(value, t)
                        : localizeCptTableValue(overview.columns[index], value, t)}
                    </td>
                  );
                })}
                {editing ? (
                  <td className="cpt-remove-cell">
                    <IconButton small icon="ui.close"
                      label={t("actions.removeCpt", { cpt: localizeCptName(row.cpt.name, t) })}
                      title={t("cpts.removeFromLocations", { cpt: localizeCptName(row.cpt.name, t), count: selectedLoadPoints.length })}
                      disabled={editPending}
                      className="cpt-remove-button"
                      type="button"
                      onClick={() => onStateChange(removeManualCpt(state, row.cpt.id))}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CptFrame>
  );
}

function CptSelectionActions({ state, onStateChange, selectedLoadPoints, formatMember, saving, onSave, onApplyMethod }: {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>;
  formatMember?: (id: number) => string;
  saving: boolean;
  onSave?: (afterSave?: CptEditCompletion) => Promise<void>;
  onApplyMethod?: (method: CptSelectionMethod) => Promise<void>;
}) {
  const { t } = useTranslation("rightPanel");
  const editing = state.cptSelectionEditDraft !== null;
  const pending = saving || isManualCptSelectionPending(state);
  const noTargets = selectedLoadPoints.length === 0;
  const method = (value: CptSelectionMethod) => {
    if (editing) onStateChange(value === "automatic" ? clearManualCptSelection(state) : selectOnlyNearestCpts(state));
    else void onApplyMethod?.(value);
  };
  return <>
    <div className="cpt-edit-actions" aria-busy={saving}>
      <div className="cpt-edit-methods">
        <Button compact disabled={pending || noTargets || (!editing && !onApplyMethod)} onClick={() => method("automatic")}>{t("actions.useAlgorithm")}</Button>
        <Button compact disabled={pending || noTargets || (!editing && !onApplyMethod)} onClick={() => method("nearest")}>{t("actions.onlyNearest")}</Button>
      </div>
      <div className="cpt-edit-commit-actions">{editing ? <>
        <Button compact kind="primary" disabled={pending || !onSave} onClick={() => void onSave?.()}>{t(saving ? "cpts.saving" : "actions.save")}</Button>
        <Button compact disabled={saving} onClick={() => onStateChange(cancelManualCptSelection(state))}>{t("actions.cancel")}</Button>
      </> : <Button compact className="cpt-modify-button" disabled={pending || noTargets}
        onClick={() => onStateChange(startCptSelectionEdit(state))}>{t("actions.modify")}</Button>}</div>
    </div>
    {editing ? <CptEditScope state={state} formatMember={formatMember} onStateChange={onStateChange} disabled={saving} /> : null}
  </>;
}

export function startCptSelectionEdit(state: ProjectState): ProjectState {
  return startManualCptSelectionEdit(state);
}

function CptTable({ label, columns, rows, highlighted=[],highlightLabel,scrollKey }: { label: string; columns: ReactNode[]; rows: string[][];highlighted?:number[];highlightLabel?:string;scrollKey?:string }) {
  const wrapper=useRef<HTMLDivElement>(null),highlightKey=highlighted.join(",");
  useEffect(()=>{
    const host=wrapper.current,row=host?.querySelector<HTMLElement>("tr[data-advice-highlight]");if(!host||!row)return;
    const rect=row.getBoundingClientRect(),bounds=host.getBoundingClientRect(),header=host.querySelector("thead")?.getBoundingClientRect().height??0;
    if(rect.top<bounds.top+header||rect.bottom>bounds.bottom)host.scrollTop+=rect.top-bounds.top-header;
  },[highlightKey,scrollKey]);
  return (
    <div className="cpt-table-wrap" ref={wrapper}>
      <table className="oa-table cpt-table" aria-label={label}>
        <thead><tr>{columns.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${row[1]}-${rowIndex}`} className={highlighted.includes(rowIndex)?"is-selected-advice":undefined} data-advice-highlight={highlighted.includes(rowIndex)?"true":undefined} aria-current={highlighted.includes(rowIndex)?"true":undefined} title={highlighted.includes(rowIndex)?highlightLabel:undefined}>
              {row.map((value, index) => <td key={index}>{index===0&&highlighted.includes(rowIndex)&&<span className="cpt-advice-row-marker" aria-hidden="true">▶ </span>}{value}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CptFrame({ title, children }: { title: string; children: ReactNode }) {
  return <OpenAECProvider sprite={spriteUrl}><div className="cpt-inspection-shell" onKeyDown={event => {
    if ((event.key === " " || event.key === "Enter") && event.target instanceof Element
      && event.target.closest("button, summary")) event.stopPropagation();
  }}><Panel title={title} className="oa-app cpt-panel cpt-blueprint">{children}</Panel></div></OpenAECProvider>;
}

