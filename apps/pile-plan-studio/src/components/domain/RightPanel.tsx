import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../domain/projectState";
import type { PileCostSettings, PileCostSettingsItem } from "../.././core/projectTypes.ts";
import { getLegendItems } from "../../viewer/legend.ts";
import {
  FILTERABLE_PILE_OPTION_COLUMNS,
  getNextPileOptionSortState,
  getPileOptionFilterValues,
  getPileOptionTableRows,
  PILE_OPTION_COLUMNS,
  type PileOptionTableColumn,
  type SortablePileOptionTableColumn,
} from "../../domain/pileOptionTable.ts";
import {
  getCptFrdPanelModel,
  getChosenPileOptionKeyForSelection,
  formatLoadPointPanelTitle,
  getPileOptionsForSelectedLoadPoints,
  getRenderablePileOptionRows,
  getSelectedCptOverviewModel,
  getSelectedLoadPoints,
} from "./rightPanelModel.ts";
import { formatNumber } from "../../domain/formatting.ts";
import { openCpt, switchRightPanelMode, type RightPanelMode } from "../.././domain/selectionState.ts";
import {
  applyCptSelectionSettingsPatch,
  cancelManualCptSelection,
  clearManualCptSelection,
  getCptSelectionSettingsAggregate,
  removeManualCpt,
  saveManualCptSelection,
  selectOnlyNearestCpts,
  startManualCptSelectionEdit,
} from "./cptSettingsModel.ts";
import { commitCostInput, updatePileCostItem, updatePileHeadLevel } from "./costSettingsModel.ts";
import { setSetting } from "../../store.ts";
import { removeIcon } from "../template/ribbon/icons.ts";
import OptimizationPanel from "./OptimizationPanel.tsx";
import "./rightPanel.css";

const PILE_COST_DEFAULTS_KEY = "pile-cost-defaults";

type Props = {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  onRunOptimization?: () => void;
  taskPanel?: "optimization" | null;
  onCloseTaskPanel?: () => void;
};

export default function RightPanel({
  state,
  onStateChange,
  onRunOptimization = () => undefined,
  taskPanel = null,
  onCloseTaskPanel = () => undefined,
}: Props) {
  const { t } = useTranslation("rightPanel");
  const selectedLoadPoints = getSelectedLoadPoints(state);
  const selectedLabel = selectedLoadPoints.length === 1
    ? localizeLoadPointName(formatLoadPointPanelTitle(selectedLoadPoints[0].name), t)
    : t("loadPoints.count", { count: selectedLoadPoints.length });

  return (
    <aside className="properties-panel" aria-label={t("aria.properties")}>
      <div className="right-panel-tabs" aria-label={t("aria.views")}>
        <PanelTab active={taskPanel === null} label={t("tabs.loadPoint")} mode="load-point" state={state} onStateChange={onStateChange} />
        <PanelTab active={taskPanel === null} label={t("tabs.cpts")} mode="cpts" state={state} onStateChange={onStateChange} />
        <PanelTab active={taskPanel === null} label={t("tabs.cptSettings")} mode="cpt-settings" state={state} onStateChange={onStateChange} />
        <PanelTab active={taskPanel === null} label={t("tabs.costSettings")} mode="cost-settings" state={state} onStateChange={onStateChange} />
      </div>
      {taskPanel === "optimization" ? (
        <OptimizationPanel state={state} onStateChange={onStateChange} onRunOptimization={onRunOptimization} onClose={onCloseTaskPanel} />
      ) : state.rightPanelMode === "cost-settings" ? (
        <CostSettingsPanel state={state} onStateChange={onStateChange} />
      ) : state.rightPanelMode === "cpt-settings" ? (
        <CptSettingsPanel state={state} onStateChange={onStateChange} />
      ) : state.rightPanelMode === "cpts" ? (
        <CptPanel state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} />
      ) : selectedLoadPoints.length === 0 ? (
        <div className="right-panel-empty">
          <strong>{t("empty.noLoadPoint")}</strong>
          <span>{t("empty.selectLoadPoints")}</span>
        </div>
      ) : (
        <LoadPointPanel
          state={state}
          onStateChange={onStateChange}
          selectedLabel={selectedLabel}
          selectedLoadPoints={selectedLoadPoints}
        />
      )}
    </aside>
  );
}

function CostSettingsPanel({ state, onStateChange }: Props) {
  const { t } = useTranslation("rightPanel");
  function applySettings(nextSettings: ProjectState["pileCostSettings"]) {
    onStateChange({ ...state, pileCostSettings: nextSettings });
    void setSetting(PILE_COST_DEFAULTS_KEY, nextSettings);
  }

  return (
    <div className="cost-settings-panel">
      <header className="right-panel-header">
        <div><h2>{t("cost.title")}</h2><span>{t("cost.subtitle")}</span></div>
      </header>

      <div className="settings-scroll">
        <SettingsGroup title={t("cost.pileHeadLevel")}>
          <label className="number-field">
            <input
              aria-label={t("cost.pileHeadLevel")}
              step="0.1"
              type="number"
              value={state.pileCostSettings.pile_head_level_m}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                applySettings(updatePileHeadLevel(state.pileCostSettings, value));
              }}
            />
            <span>m</span>
          </label>
        </SettingsGroup>

        <section className="settings-group cost-size-settings">
          <h3>{t("cost.pileSizeCosts")}</h3>
          <div className="cost-settings-table-wrap">
            <table className="cost-settings-table">
              <thead><tr><th>{t("cost.size")}</th><th>{t("cost.shape")}</th><th>{t("cost.costPerM3")}</th></tr></thead>
              <tbody>
                {state.pileCostSettings.items.map((item) => (
                  <CostSettingsRow
                    item={item}
                    key={item.pile_size_mm}
                    settings={state.pileCostSettings}
                    onSettingsChange={applySettings}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function CostSettingsRow({ item, settings, onSettingsChange }: {
  item: PileCostSettingsItem;
  settings: PileCostSettings;
  onSettingsChange: (settings: PileCostSettings) => void;
}) {
  const { t } = useTranslation("rightPanel");
  const [costDraft, setCostDraft] = useState(String(item.cost_per_m3_eur));

  useEffect(() => {
    setCostDraft(String(item.cost_per_m3_eur));
  }, [item.cost_per_m3_eur]);

  return (
    <tr>
      <td>{formatNumber(item.pile_size_mm)} mm</td>
      <td>
        <select
          aria-label={`${t("cost.shape")} ${item.pile_size_mm} mm`}
          value={item.shape}
          onChange={(event) => onSettingsChange(updatePileCostItem(
            settings,
            item.pile_size_mm,
            { shape: event.currentTarget.value === "round" ? "round" : "square" },
          ))}
        >
          <option value="round">{t("cost.round")}</option>
          <option value="square">{t("cost.square")}</option>
        </select>
      </td>
      <td>
        <label className="table-number-field">
          <span>€</span>
          <input
            aria-label={`${t("cost.costPerM3")} ${item.pile_size_mm} mm`}
            min="0"
            step="1"
            type="number"
            value={costDraft}
            onBlur={() => {
              const cost = commitCostInput(costDraft);
              if (cost === null) {
                setCostDraft(String(item.cost_per_m3_eur));
                return;
              }
              setCostDraft(String(cost));
              onSettingsChange(updatePileCostItem(settings, item.pile_size_mm, { cost_per_m3_eur: cost }));
            }}
            onChange={(event) => {
              setCostDraft(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
      </td>
    </tr>
  );
}

function CptSettingsPanel({ state, onStateChange }: Props) {
  const { t } = useTranslation("rightPanel");
  const [overwriteManualSelections, setOverwriteManualSelections] = useState(false);
  const selectedLoadPoints = getSelectedLoadPoints(state);
  const settingsScope = selectedLoadPoints.length === 0 ? "all" : state.cptSettingsScope;
  const settings = getCptSelectionSettingsAggregate(state);
  const settingsLoadPoints = selectedLoadPoints;
  const manualCptCount = settingsLoadPoints.reduce(
    (count, loadPoint) => count + (state.manualCptIdsByLoadPoint.get(loadPoint.id)?.length ?? 0),
    0,
  );
  const settingsSubtitle = selectedLoadPoints.length === 0
    ? t("cptSettings.allLoadPoints")
    : t("cptSettings.selectedCount", { count: selectedLoadPoints.length });
  const scopeDescription = selectedLoadPoints.length === 0
    ? t("cptSettings.noSelection")
    : settingsScope === "all"
      ? t("cptSettings.global")
      : t("cptSettings.selected");

  return (
    <div className="cpt-settings-panel">
      <header className="right-panel-header">
        <div><h2>{t("cptSettings.title")}</h2><span>{settingsSubtitle}</span></div>
      </header>

      <div className="settings-scroll">
        <SettingsGroup title={t("cptSettings.applyTo")}>
          <div className="segmented-control" role="group" aria-label={t("cptSettings.applyTo")}>
            <button
              className={settingsScope === "all" ? "is-selected" : ""}
              type="button"
              onClick={() => onStateChange({ ...state, cptSettingsScope: "all" })}
            >{t("cptSettings.allLoadPoints")}</button>
            <button
              className={settingsScope === "selected" ? "is-selected" : ""}
              disabled={selectedLoadPoints.length === 0}
              type="button"
              onClick={() => onStateChange({ ...state, cptSettingsScope: "selected" })}
            >{t("cptSettings.selectedLoadPoints")}</button>
          </div>
          <label className="settings-checkbox">
            <input
              checked={overwriteManualSelections}
              type="checkbox"
              onChange={(event) => setOverwriteManualSelections(event.currentTarget.checked)}
            />
            <span>{t("cptSettings.overwriteManualSelections")}</span>
          </label>
          <p className="supporting-text">
            {scopeDescription}
          </p>
        </SettingsGroup>

        <SettingsGroup title={t("cptSettings.maxDistance")}>
          <label className="number-field">
            <input
              aria-label={t("cptSettings.maxDistance")}
              min="0"
              placeholder={settings.maxDistanceM === null ? t("cptSettings.mixed") : undefined}
              step="1"
              type="number"
              value={settings.maxDistanceM ?? ""}
              onChange={(event) => {
                if (event.currentTarget.value === "") return;
                const value = Number(event.currentTarget.value);
                if (Number.isFinite(value)) {
                  onStateChange(applyCptSelectionSettingsPatch(state, { maxDistanceM: Math.max(0, value) }, overwriteManualSelections));
                }
              }}
            />
            <span>m</span>
          </label>
        </SettingsGroup>

        <SettingsGroup title={t("cptSettings.monopolyDistance")}>
          <label className="number-field">
            <input
              aria-label={t("cptSettings.monopolyDistance")}
              min="0"
              placeholder={settings.monopolyDistanceM === null ? t("cptSettings.mixed") : undefined}
              step="1"
              type="number"
              value={settings.monopolyDistanceM ?? ""}
              onChange={(event) => {
                if (event.currentTarget.value === "") return;
                const value = Number(event.currentTarget.value);
                if (Number.isFinite(value)) {
                  onStateChange(applyCptSelectionSettingsPatch(state, { monopolyDistanceM: Math.max(0, value) }, overwriteManualSelections));
                }
              }}
            />
            <span>m</span>
          </label>
        </SettingsGroup>

        <SettingsGroup title={t("cptSettings.algorithm")}>
          <div className="algorithm-grid" role="radiogroup" aria-label={t("cptSettings.algorithm")}>
            <AlgorithmOption
              active={settings.algorithm === "quadrants"}
              label={t("cptSettings.quadrants")}
              sketch="quadrants"
              onClick={() => onStateChange(applyCptSelectionSettingsPatch(state, { algorithm: "quadrants" }, overwriteManualSelections))}
            />
            <AlgorithmOption
              active={settings.algorithm === "maximum-angle"}
              label={t("cptSettings.maximumAngle")}
              sketch="maximum-angle"
              onClick={() => onStateChange(applyCptSelectionSettingsPatch(state, { algorithm: "maximum-angle" }, overwriteManualSelections))}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("cptSettings.maximumAngle")} muted={settings.algorithm !== null && settings.algorithm !== "maximum-angle"}>
          <label className="number-field">
            <input
              aria-label={t("cptSettings.maximumAngle")}
              disabled={settings.algorithm !== null && settings.algorithm !== "maximum-angle"}
              min="1"
              max="360"
              placeholder={settings.maxAngleDegrees === null ? t("cptSettings.mixed") : undefined}
              step="1"
              type="number"
              value={settings.maxAngleDegrees ?? ""}
              onChange={(event) => {
                if (event.currentTarget.value === "") return;
                const value = Number(event.currentTarget.value);
                if (Number.isFinite(value)) {
                  onStateChange(applyCptSelectionSettingsPatch(state, {
                    maxAngleDegrees: Math.min(360, Math.max(1, value)),
                  }, overwriteManualSelections));
                }
              }}
            />
            <span>deg</span>
          </label>
        </SettingsGroup>

        <SettingsGroup title={t("cptSettings.manual")}>
          <p className="supporting-text">
            {manualCptCount > 0
                ? t("cptSettings.manualCount", { count: manualCptCount })
                : t("cptSettings.algorithmic")}
          </p>
          <div className="selection-actions">
            <button
              className="settings-modify-button"
              disabled={selectedLoadPoints.length === 0}
              type="button"
              onClick={() => onStateChange(startCptSelectionEdit(state))}
            >{t("actions.modifySelection")}</button>
            {manualCptCount > 0 && state.selectedLoadPointId !== null ? (
              <button type="button" onClick={() => onStateChange(clearManualCptSelection(state))}>{t("actions.useAlgorithm")}</button>
            ) : null}
          </div>
        </SettingsGroup>
      </div>
    </div>
  );
}

function SettingsGroup({ title, muted = false, children }: {
  title: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`settings-group${muted ? " is-muted" : ""}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function AlgorithmOption({ active, label, sketch, onClick }: {
  active: boolean;
  label: string;
  sketch: "quadrants" | "maximum-angle";
  onClick: () => void;
}) {
  return (
    <button className={`algorithm-option${active ? " is-selected" : ""}`} type="button" aria-pressed={active} onClick={onClick}>
      {sketch === "quadrants" ? <QuadrantSketch /> : <MaximumAngleSketch />}
      <span>{label}</span>
    </button>
  );
}

function QuadrantSketch() {
  return (
    <svg className="algorithm-sketch" viewBox="0 0 120 80" aria-hidden="true">
      <line x1="60" y1="8" x2="60" y2="72" /><line x1="18" y1="40" x2="102" y2="40" />
      <circle className="sketch-load" cx="60" cy="40" r="4" />
      <circle cx="84" cy="18" r="5" /><circle cx="88" cy="62" r="5" />
      <circle cx="34" cy="20" r="5" /><circle cx="30" cy="60" r="5" />
    </svg>
  );
}

function MaximumAngleSketch() {
  return (
    <svg className="algorithm-sketch" viewBox="0 0 120 80" aria-hidden="true">
      <path className="sketch-arc" d="M 76 24 A 24 24 0 0 1 76 56" />
      <line x1="60" y1="40" x2="96" y2="40" /><line x1="60" y1="40" x2="78" y2="15" />
      <line x1="60" y1="40" x2="78" y2="65" /><circle className="sketch-load" cx="60" cy="40" r="4" />
      <circle cx="96" cy="40" r="5" /><circle cx="78" cy="15" r="5" /><circle cx="78" cy="65" r="5" />
    </svg>
  );
}

function PanelTab({ active, label, mode, state, onStateChange }: {
  active: boolean;
  label: string;
  mode: RightPanelMode;
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
}) {
  return (
    <button
      className={`right-panel-tab${active && state.rightPanelMode === mode ? " is-active" : ""}`}
      type="button"
      onClick={() => onStateChange({ ...state, ...switchRightPanelMode(state, mode) })}
    >
      {label}
    </button>
  );
}

function CptPanel({ state, onStateChange, selectedLoadPoints }: {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>;
}) {
  const { t } = useTranslation("rightPanel");
  const selectedCpt = getCptFrdPanelModel(state);
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
        <dl className="cpt-detail-grid">
          <div><dt>X</dt><dd>{formatNumber(selectedCpt.cpt.x_mm)} mm</dd></div>
          <div><dt>Y</dt><dd>{formatNumber(selectedCpt.cpt.y_mm)} mm</dd></div>
        </dl>
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
  const heading = selectedLoadPoints.length > 1
    ? t("cpts.selectedHeading")
    : `${localizeLoadPointName(selectedLoadPoints[0].name, t)} - ${t("tabs.cpts")}`;
  const columnLabels: Record<string, ReactNode> = {
    CPT: t("cpts.name"),
    Selection: t("cpts.selection"),
    Distance: t("cpts.distance"),
    "Used by": t("cpts.usedBy"),
    "Load points": t("cpts.loadPoints"),
    "FRD range": <span aria-label={t("cpts.frdRange")}><ResistanceLabel qualifier={t("cpts.rangeQualifier")} /></span>,
  };

  return (
    <div className="cpt-panel">
      <header className="right-panel-header">
        <div><h2>{heading}</h2></div>
        {!editing ? <CptModifyButton state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} /> : null}
      </header>
      {editing ? (
        <div className="cpt-edit-actions">
          <button type="button" onClick={() => onStateChange(selectOnlyNearestCpts(state))}>{t("actions.onlyNearest")}</button>
          <button type="button" onClick={() => onStateChange(saveManualCptSelection(state))}>{t("actions.save")}</button>
          <button type="button" onClick={() => onStateChange(cancelManualCptSelection(state))}>{t("actions.cancel")}</button>
        </div>
      ) : null}
      <div className="cpt-table-wrap">
        <table className="cpt-table">
          <thead>
            <tr>
              {overview.columns.map((column) => <th key={column}>{columnLabels[column] ?? column}</th>)}
              {editing ? <th><span className="sr-only">{t("actions.remove")}</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {overview.rows.length === 0 ? (
              <tr><td className="empty-table-cell" colSpan={overview.columns.length + (editing ? 1 : 0)}>{t("empty.noCptsAvailable")}</td></tr>
            ) : overview.rows.map((row) => (
              <tr key={row.cpt.id}>
                {row.values.map((value, index) => (
                  <td key={`${row.cpt.id}-${overview.columns[index]}`}>
                    {overview.columns[index] === "CPT" && !editing ? (
                      <button
                        className="cpt-link"
                        type="button"
                        onClick={() => onStateChange({ ...state, ...openCpt(state, row.cpt.id) })}
                      >
                        {localizeCptName(value, t)}
                      </button>
                    ) : localizeCptTableValue(overview.columns[index], value, t)}
                  </td>
                ))}
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

function startCptSelectionEdit(state: ProjectState): ProjectState {
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

function LoadPointPanel({ state, onStateChange, selectedLabel, selectedLoadPoints }: {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  selectedLabel: string;
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>;
}) {
  const { t, i18n } = useTranslation("rightPanel");
  const options = getPileOptionsForSelectedLoadPoints(state, selectedLoadPoints);
  const rows = getRenderablePileOptionRows({
    cpts: state.cpts,
    costsByOptionKey: state.pileCostByOptionKey,
    legend: getLegendItems(state.bearingCapacities),
    options,
    selectedLoadPointCount: selectedLoadPoints.length,
  }).map((row) => ({
    ...row,
    statusLabel: row.statusLabel === "Missing"
      ? t("status.missing")
      : row.statusLabel === "Not OK" ? t("status.notOk") : t("status.ok"),
  }));
  const tableRows = getPileOptionTableRows(rows, state.pileOptionFilters, state.pileOptionSort);
  const chosenKey = getChosenPileOptionKeyForSelection(state, selectedLoadPoints);
  const isLoading = state.pileOptionsByLoadPointId.size === 0;
  const fedLabel = selectedLoadPoints.length === 1
    ? `${selectedLoadPoints[0].design_load_kn.toLocaleString(i18n.language, { maximumFractionDigits: 1 })} kN`
    : t("loadPoints.selectedCount", { count: selectedLoadPoints.length });

  return (
    <div className="load-point-panel">
      <header className="right-panel-header">
        <div>
          <h2>{selectedLabel}</h2>
          <span>{selectedLoadPoints.length === 1 ? "FED" : t("loadPoints.selection")}</span>
        </div>
        <strong>{fedLabel}</strong>
      </header>

      <section className="pile-options-section">
        <div className="section-heading">
          <h3>{t("pileOptions.title")}</h3>
          <span>{isLoading ? t("pileOptions.loading") : t("pileOptions.shown", { count: tableRows.length })}</span>
        </div>
        {!isLoading && state.analysisError ? (
          <div className="right-panel-empty is-inline" role="alert">
            {t("pileOptions.failed", { error: state.analysisError })}
          </div>
        ) : null}
        {isLoading ? (
          <div className="right-panel-empty is-inline" role={state.analysisError ? "alert" : undefined}>
            {state.analysisError
              ? t("pileOptions.failed", { error: state.analysisError })
              : t("pileOptions.calculating")}
          </div>
        ) : (
          <div className="pile-options-table-wrap">
            <table className="pile-options-table">
              <thead>
                <tr>
                  {PILE_OPTION_COLUMNS.map((column) => (
                    <th className={`pile-option-column-${column.key}`} key={column.key}>
                      {column.key === "symbol" ? (
                        <span className="sr-only">{t("columns.symbol", "Symbol")}</span>
                      ) : (
                        <ColumnHeader
                          column={column.key}
                          label={column.key === "frd"
                            ? <ResistanceLabel qualifier={t("columns.minimumQualifier")} />
                            : t(`columns.${column.key === "use" && selectedLoadPoints.length > 1 ? "useAvg" : column.key}`)}
                          labelText={t(`columns.${column.key === "use" && selectedLoadPoints.length > 1 ? "useAvg" : column.key}`)}
                          rows={rows}
                          state={state}
                          onStateChange={onStateChange}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td className="empty-table-cell" colSpan={PILE_OPTION_COLUMNS.length}>
                      {t("pileOptions.noMatch")}
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row) => (
                    <tr
                      className={`pile-option-row${row.key === chosenKey ? " is-chosen" : ""}`}
                      key={row.key}
                      onClick={() => applyPileOption(state, onStateChange, selectedLoadPoints, row.key)}
                    >
                      <td className="pile-option-symbol-cell">
                        <span dangerouslySetInnerHTML={{ __html: row.symbolHtml }} />
                      </td>
                      <td>{row.sizeLabel}</td>
                      <td>{row.tipLabel}</td>
                      <td><span className={`status-pill ${row.statusClassName}`}>{row.statusLabel}</span></td>
                      <td>{row.costLabel}</td>
                      <td>{row.useLabel}</td>
                      <td>
                        {row.governingCptId === null ? row.governingLabel : (
                          <button
                            className="cpt-link"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onStateChange({ ...state, ...openCpt(state, row.governingCptId as number) });
                            }}
                          >
                            {localizeCptName(row.governingLabel, t)}
                          </button>
                        )}
                      </td>
                      <td>{row.frdLabel}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ColumnHeader({ column, label, labelText, rows, state, onStateChange }: {
  column: PileOptionTableColumn;
  label: ReactNode;
  labelText: string;
  rows: ReturnType<typeof getRenderablePileOptionRows>;
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
}) {
  const { t } = useTranslation("rightPanel");
  const sortColumn = column as SortablePileOptionTableColumn;
  const filterValues = FILTERABLE_PILE_OPTION_COLUMNS.some((item) => item.key === sortColumn)
    ? getPileOptionFilterValues(rows, sortColumn)
    : [];
  const selectedValues = new Set(state.pileOptionFilters[column]);
  const sortMark = state.pileOptionSort?.column === column
    ? state.pileOptionSort.direction === "asc" ? "↑" : "↓"
    : "";

  return (
    <div className="column-header">
      <button
        className="column-sort-button"
        type="button"
        onClick={() => onStateChange({
          ...state,
          pileOptionSort: getNextPileOptionSortState(state.pileOptionSort, sortColumn),
        })}
      >
        {label} {sortMark}
      </button>
      {filterValues.length > 0 ? (
        <details className="column-filter-menu">
          <summary aria-label={t("filter.label", { label: labelText })}>▾</summary>
          <div className="filter-menu-content">
            <div className="filter-menu-actions">
              <button
                type="button"
                onClick={() => onStateChange({
                  ...state,
                  pileOptionFilters: { ...state.pileOptionFilters, [column]: [] },
                })}
              >
                {t("actions.clear")}
              </button>
              <button
                type="button"
                onClick={() => onStateChange({
                  ...state,
                  pileOptionFilters: { ...state.pileOptionFilters, [column]: filterValues },
                })}
              >
                {t("actions.all")}
              </button>
            </div>
            {filterValues.map((value) => (
              <label className="filter-value" key={value}>
                <input
                  checked={selectedValues.has(value)}
                  type="checkbox"
                  onChange={(event) => {
                    const nextValues = new Set(selectedValues);
                    if (event.currentTarget.checked) {
                      nextValues.add(value);
                    } else {
                      nextValues.delete(value);
                    }
                    onStateChange({
                      ...state,
                      pileOptionFilters: { ...state.pileOptionFilters, [column]: [...nextValues] },
                    });
                  }}
                />
                <span>{value}</span>
              </label>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function applyPileOption(
  state: ProjectState,
  onStateChange: (nextState: ProjectState) => void,
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>,
  optionKey: string,
) {
  const nextSelections = new Map(state.selectedPileOptionKeysByLoadPoint);
  selectedLoadPoints.forEach((loadPoint) => nextSelections.set(loadPoint.id, optionKey));
  onStateChange({ ...state, selectedPileOptionKeysByLoadPoint: nextSelections });
}

function ResistanceLabel({ qualifier }: { qualifier?: string }) {
  return (
    <span className="resistance-label">
      <i>R</i><sub>c;net;d</sub>{qualifier ? ` ${qualifier}` : ""}
    </span>
  );
}

function localizeLoadPointName(name: string, t: ReturnType<typeof useTranslation>["t"]): string {
  const match = name.match(/^Load point\s+(.+)$/i);
  return match ? t("loadPoints.name", { id: match[1] }) : name;
}

function localizeCptName(name: string, t: ReturnType<typeof useTranslation>["t"]): string {
  const match = name.match(/^CPT\s+(.+)$/i);
  return match ? `${t("cpts.name")} ${match[1]}` : name;
}

function localizeCptTableValue(column: string, value: string, t: ReturnType<typeof useTranslation>["t"]): string {
  if (column === "Selection") {
    const selectionKeys: Record<string, string> = {
      "upper right": "selection.upperRight",
      "lower right": "selection.lowerRight",
      "upper left": "selection.upperLeft",
      "lower left": "selection.lowerLeft",
    };
    const key = selectionKeys[value.toLowerCase()];
    if (key) return t(key);
    const angle = value.match(/^angle(.*)$/i);
    if (angle) return t("selection.angle", { suffix: angle[1] });
  }

  if (column === "Used by") {
    const usage = value.match(/^(\d+)\s*\/\s*(\d+)\s+load points$/i);
    if (usage) return t("cpts.usedByValue", { used: usage[1], total: usage[2] });
  }

  return value;
}
