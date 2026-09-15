import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/projectState.ts";
import { openCpt } from "../../../domain/selectionState.ts";
import { getCptFrdPanelModel, getSelectedCptOverviewModel, getSelectedLoadPoints } from "./rightPanelModel.ts";
import { cancelManualCptSelection, clearManualCptSelection, removeManualCpt, saveManualCptSelection, selectOnlyNearestCpts, startManualCptSelectionEdit } from "../cptSettingsModel.ts";
import { removeIcon } from "../../template/ribbon/icons.ts";
import { CoordinateReadout } from "../CoordinateReadout.ts";
import { ResistanceLabel, localizeCptName, localizeCptTableValue, localizeLoadPointName } from "./PanelControls.tsx";

export default function CptPanel({ state, onStateChange, selectedLoadPoints }: {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>;
}) {
  const { t, i18n } = useTranslation("rightPanel");
  const selectedCpt = getCptFrdPanelModel(state, i18n.language);
  const draft = state.cptSelectionEditDraft;
  const isEditing = draft !== null;
  const cptPanelLoadPoints = draft
    ? state.loadPoints.filter((loadPoint) => draft.loadPointIds.includes(loadPoint.id))
    : selectedLoadPoints;

  if (isEditing) {
    return <CptSelectionOverview state={state} onStateChange={onStateChange} selectedLoadPoints={cptPanelLoadPoints} editing />;
  }

  if (selectedCpt) {
    return (
      <div className="cpt-panel">
        <header className="right-panel-header">
          <div>
            <h2>{localizeCptName(selectedCpt.cpt.name, t)}</h2>
            <span>{t("cpts.selected")}</span>
          </div>
          <CptModifyButton state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} />
        </header>
        <CoordinateReadout points={[selectedCpt.cpt]} locale={i18n.language} />
        <CptTable
          columns={[t("columns.size"), t("columns.tip"), <ResistanceLabel key="resistance" />]}
          rows={selectedCpt.rows.map((row) => [row.sizeLabel, row.tipLabel, row.frdLabel])}
        />
      </div>
    );
  }

  if (selectedLoadPoints.length === 0) {
    return (
      <div className="cpt-panel">
        <header className="right-panel-header">
          <div><h2>{t("tabs.cpts")}</h2></div>
          <CptModifyButton state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} />
        </header>
        <div className="right-panel-empty">
          <strong>{t("empty.noCpts")}</strong>
          <span>{t("empty.selectCpt")}</span>
        </div>
      </div>
    );
  }

  return <CptSelectionOverview state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} editing={false} />;
}

function CptSelectionOverview({ state, onStateChange, selectedLoadPoints, editing }: {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>;
  editing: boolean;
}) {
  const { t } = useTranslation("rightPanel");
  const overview = getSelectedCptOverviewModel(state, selectedLoadPoints);
  const preview = state.cptSelectionPreview?.draft === state.cptSelectionEditDraft
    ? state.cptSelectionPreview
    : editing ? { status: "analyzing" as const } : null;
  const heading = selectedLoadPoints.length > 1
    ? t("cpts.selectedHeading")
    : `${localizeLoadPointName(selectedLoadPoints[0].name, t)} - ${t("tabs.cpts")}`;
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
    <div className="cpt-panel">
      <header className="right-panel-header">
        <div><h2>{heading}</h2></div>
        {!editing ? <CptModifyButton state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} /> : null}
      </header>
      {editing ? (
        <div className="cpt-edit-actions">
          <div className="cpt-edit-methods">
            <button type="button" onClick={() => onStateChange(clearManualCptSelection(state))}>{t("actions.useAlgorithm")}</button>
            <button type="button" onClick={() => onStateChange(saveManualCptSelection(selectOnlyNearestCpts(state)))}>{t("actions.onlyNearest")}</button>
          </div>
          <div className="cpt-edit-commit-actions">
            <button type="button" onClick={() => onStateChange(saveManualCptSelection(state))}>{t("actions.save")}</button>
            <button type="button" onClick={() => onStateChange(cancelManualCptSelection(state))}>{t("actions.cancel")}</button>
          </div>
        </div>
      ) : null}
      {editing && preview?.status === "analyzing" ? (
        <div className="cpt-preview-status" role="status">{t("cpts.previewCalculating")}</div>
      ) : null}
      {editing && preview?.status === "failed" ? (
        <div className="cpt-preview-status is-error" role="alert">
          {t("cpts.previewFailed", { error: preview.error })}
        </div>
      ) : null}
      <div className="cpt-table-wrap">
        <table className="cpt-table">
          <thead>
            <tr>
              {overview.columns.map((column) => <th key={column}>{columnLabels[column] ?? column}</th>)}
              {editing ? <th className="cpt-remove-cell"><span className="sr-only">{t("actions.remove")}</span></th> : null}
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
                    ? t("cpts.usedByDetails", { loadPoints: row.usageDetails })
                    : undefined;

                  return (
                    <td key={`${row.cpt.id}-${column}`} title={usageTitle}>
                      {overview.columns[index] === "CPT" && !editing ? (
                        <button
                          className="cpt-link"
                          type="button"
                          onClick={() => onStateChange({ ...state, ...openCpt(state, row.cpt.id) })}
                        >
                          {localizeCptName(value, t)}
                        </button>
                      ) : overview.columns[index] === "CPT"
                        ? localizeCptName(value, t)
                        : localizeCptTableValue(overview.columns[index], value, t)}
                    </td>
                  );
                })}
                {editing ? (
                  <td className="cpt-remove-cell">
                    <button
                      aria-label={t("actions.removeCpt", { cpt: localizeCptName(row.cpt.name, t) })}
                      className="cpt-remove-button"
                      type="button"
                      onClick={() => onStateChange(removeManualCpt(state, row.cpt.id))}
                    >
                      <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: removeIcon }} />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CptModifyButton({ state, onStateChange, selectedLoadPoints }: {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>;
}) {
  const { t } = useTranslation("rightPanel");
  return (
    <button
      className="cpt-modify-button"
      disabled={selectedLoadPoints.length === 0}
      type="button"
      onClick={() => onStateChange(startCptSelectionEdit(state))}
    >{t("actions.modify")}</button>
  );
}

export function startCptSelectionEdit(state: ProjectState): ProjectState {
  return startManualCptSelectionEdit(state);
}

function CptTable({ columns, rows }: { columns: ReactNode[]; rows: string[][] }) {
  return (
    <div className="cpt-table-wrap">
      <table className="cpt-table">
        <thead><tr>{columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${row[1]}-${rowIndex}`}>
              {row.map((value, index) => <td key={index}>{value}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

