import { useEffect, useState } from "react";
import type { ProjectState } from "../../domain/projectState";
import type { PileCostSettings, PileCostSettingsItem } from "../../../src/projectTypes.ts";
import { getLegendItems } from "../../../src/legend.ts";
import { getUseColumnLabel } from "../../../src/pileOptionColumns.ts";
import {
  FILTERABLE_PILE_OPTION_COLUMNS,
  getNextPileOptionSortState,
  getPileOptionFilterValues,
  getPileOptionTableRows,
  PILE_OPTION_COLUMNS,
  type PileOptionTableColumn,
  type SortablePileOptionTableColumn,
} from "../../../src/pileOptionTable.ts";
import {
  getCptFrdPanelModel,
  getChosenPileOptionKeyForSelection,
  formatLoadPointPanelTitle,
  getPileOptionsForSelectedLoadPoints,
  getRenderablePileOptionRows,
  getSelectedCptOverviewModel,
  getSelectedLoadPoints,
} from "./rightPanelModel.ts";
import { formatNumber } from "../../../src/formatting.ts";
import { openCpt, switchRightPanelMode, type RightPanelMode } from "../../../src/selectionState.ts";
import {
  applyCptSelectionSettings,
  beginManualCptSelection,
  cancelManualCptSelection,
  clearManualCptSelection,
  getActiveCptSelectionSettings,
  saveManualCptSelection,
} from "./cptSettingsModel.ts";
import { commitCostInput, updatePileCostItem, updatePileHeadLevel } from "./costSettingsModel.ts";
import { setSetting } from "../../store.ts";
import OptimizationPanel from "./OptimizationPanel.tsx";
import "./rightPanel.css";

const PILE_COST_DEFAULTS_KEY = "pile-cost-defaults";

type Props = {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  onRunOptimization?: () => void;
};

export default function RightPanel({ state, onStateChange, onRunOptimization = () => undefined }: Props) {
  const selectedLoadPoints = getSelectedLoadPoints(state);
  const selectedLabel = selectedLoadPoints.length === 1
    ? formatLoadPointPanelTitle(selectedLoadPoints[0].name)
    : `${selectedLoadPoints.length} load points`;

  return (
    <aside className="properties-panel" aria-label="Properties">
      <div className="right-panel-tabs" aria-label="Right panel views">
        <PanelTab label="Load point" mode="load-point" state={state} onStateChange={onStateChange} />
        <PanelTab label="CPTs" mode="cpts" state={state} onStateChange={onStateChange} />
        <PanelTab label="CPT settings" mode="cpt-settings" state={state} onStateChange={onStateChange} />
        <PanelTab label="Cost settings" mode="cost-settings" state={state} onStateChange={onStateChange} />
        <PanelTab label="Optimization" mode="optimization-settings" state={state} onStateChange={onStateChange} />
      </div>
      {state.rightPanelMode === "optimization-settings" ? (
        <OptimizationPanel state={state} onStateChange={onStateChange} onRunOptimization={onRunOptimization} />
      ) : state.rightPanelMode === "cost-settings" ? (
        <CostSettingsPanel state={state} onStateChange={onStateChange} />
      ) : state.rightPanelMode === "cpt-settings" ? (
        <CptSettingsPanel state={state} onStateChange={onStateChange} />
      ) : state.rightPanelMode === "cpts" ? (
        <CptPanel state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} />
      ) : selectedLoadPoints.length === 0 ? (
        <div className="right-panel-empty">
          <strong>No load point selected</strong>
          <span>Select one or more load points in the viewer.</span>
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
  function applySettings(nextSettings: ProjectState["pileCostSettings"]) {
    onStateChange({ ...state, pileCostSettings: nextSettings });
    void setSetting(PILE_COST_DEFAULTS_KEY, nextSettings);
  }

  return (
    <div className="cost-settings-panel">
      <header className="right-panel-header">
        <div><h2>Cost Settings</h2><span>Project and user defaults</span></div>
      </header>

      <div className="settings-scroll">
        <SettingsGroup title="Pile head level">
          <label className="number-field">
            <input
              aria-label="Pile head level"
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
          <h3>Pile size costs</h3>
          <div className="cost-settings-table-wrap">
            <table className="cost-settings-table">
              <thead><tr><th>Size</th><th>Shape</th><th>Cost per m³</th></tr></thead>
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
  const [costDraft, setCostDraft] = useState(String(item.cost_per_m3_eur));

  useEffect(() => {
    setCostDraft(String(item.cost_per_m3_eur));
  }, [item.cost_per_m3_eur]);

  return (
    <tr>
      <td>{formatNumber(item.pile_size_mm)} mm</td>
      <td>
        <select
          aria-label={`Shape for ${item.pile_size_mm} mm`}
          value={item.shape}
          onChange={(event) => onSettingsChange(updatePileCostItem(
            settings,
            item.pile_size_mm,
            { shape: event.currentTarget.value === "round" ? "round" : "square" },
          ))}
        >
          <option value="round">Round</option>
          <option value="square">Square</option>
        </select>
      </td>
      <td>
        <label className="table-number-field">
          <span>€</span>
          <input
            aria-label={`Cost per cubic metre for ${item.pile_size_mm} mm`}
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
  const loadPoint = state.loadPoints.find((item) => item.id === state.selectedLoadPointId) ?? null;
  if (!loadPoint) {
    return (
      <div className="right-panel-empty">
        <strong>No load point selected</strong>
        <span>Select a load point to edit its CPT settings or manual selection.</span>
      </div>
    );
  }

  const settings = getActiveCptSelectionSettings(state);
  const hasLocalSettings = state.cptSelectionSettingsByLoadPoint.has(loadPoint.id);
  const manualCptIds = state.manualCptIdsByLoadPoint.get(loadPoint.id);
  const draft = state.cptSelectionEditDraft?.loadPointId === loadPoint.id
    ? state.cptSelectionEditDraft
    : null;
  const selectedCptIds = manualCptIds
    ?? (state.selectedCptsByLoadPointId.get(loadPoint.id) ?? []).map((selection) => selection.cpt.id);

  return (
    <div className="cpt-settings-panel">
      <header className="right-panel-header">
        <div><h2>CPT Settings</h2><span>{formatLoadPointPanelTitle(loadPoint.name)}</span></div>
      </header>

      <div className="settings-scroll">
        <SettingsGroup title="Apply settings to">
          <div className="segmented-control" role="group" aria-label="CPT settings scope">
            <button
              className={state.cptSettingsScope === "all" ? "is-selected" : ""}
              type="button"
              onClick={() => onStateChange({ ...state, cptSettingsScope: "all" })}
            >All load points</button>
            <button
              className={state.cptSettingsScope === "current" ? "is-selected" : ""}
              type="button"
              onClick={() => onStateChange({ ...state, cptSettingsScope: "current" })}
            >This load point</button>
          </div>
          <p className="supporting-text">
            {hasLocalSettings ? "This load point has its own algorithm settings." : "This load point uses the global algorithm settings."}
          </p>
        </SettingsGroup>

        <SettingsGroup title="Maximum CPT distance">
          <label className="number-field">
            <input
              aria-label="Maximum CPT distance"
              min="0"
              step="1"
              type="number"
              value={settings.maxDistanceM}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (Number.isFinite(value)) {
                  onStateChange(applyCptSelectionSettings(state, { ...settings, maxDistanceM: Math.max(0, value) }));
                }
              }}
            />
            <span>m</span>
          </label>
        </SettingsGroup>

        <SettingsGroup title="Algorithm">
          <div className="algorithm-grid" role="radiogroup" aria-label="CPT selection algorithm">
            <AlgorithmOption
              active={settings.algorithm === "quadrants"}
              label="Four Quadrants"
              sketch="quadrants"
              onClick={() => onStateChange(applyCptSelectionSettings(state, { ...settings, algorithm: "quadrants" }))}
            />
            <AlgorithmOption
              active={settings.algorithm === "maximum-angle"}
              label="Maximum Angle"
              sketch="maximum-angle"
              onClick={() => onStateChange(applyCptSelectionSettings(state, { ...settings, algorithm: "maximum-angle" }))}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup title="Maximum angle" muted={settings.algorithm !== "maximum-angle"}>
          <label className="number-field">
            <input
              aria-label="Maximum angle"
              disabled={settings.algorithm !== "maximum-angle"}
              min="1"
              max="360"
              step="1"
              type="number"
              value={settings.maxAngleDegrees}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (Number.isFinite(value)) {
                  onStateChange(applyCptSelectionSettings(state, {
                    ...settings,
                    maxAngleDegrees: Math.min(360, Math.max(1, value)),
                  }));
                }
              }}
            />
            <span>deg</span>
          </label>
        </SettingsGroup>

        <SettingsGroup title="Manual selection">
          <p className="supporting-text">
            {draft
              ? `${draft.cptIds.size} CPTs selected. Click CPTs in the viewer to add or remove them.`
              : manualCptIds
                ? `${manualCptIds.length} CPTs are manually selected for this load point.`
                : "This load point currently uses the algorithmic CPT selection."}
          </p>
          <div className="selection-actions">
            {draft ? (
              <>
                <button type="button" onClick={() => onStateChange(saveManualCptSelection(state))}>Save</button>
                <button type="button" onClick={() => onStateChange(cancelManualCptSelection(state))}>Cancel</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onStateChange(beginManualCptSelection(state, selectedCptIds))}>Edit selection</button>
                {manualCptIds ? (
                  <button type="button" onClick={() => onStateChange(clearManualCptSelection(state))}>Use algorithm</button>
                ) : null}
              </>
            )}
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

function PanelTab({ label, mode, state, onStateChange }: {
  label: string;
  mode: RightPanelMode;
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
}) {
  return (
    <button
      className={`right-panel-tab${state.rightPanelMode === mode ? " is-active" : ""}`}
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
  const selectedCpt = getCptFrdPanelModel(state);
  if (selectedCpt) {
    return (
      <div className="cpt-panel">
        <header className="right-panel-header">
          <div>
            <h2>{selectedCpt.cpt.name}</h2>
            <span>Selected CPT</span>
          </div>
        </header>
        <dl className="cpt-detail-grid">
          <div><dt>X</dt><dd>{formatNumber(selectedCpt.cpt.x_mm)} mm</dd></div>
          <div><dt>Y</dt><dd>{formatNumber(selectedCpt.cpt.y_mm)} mm</dd></div>
        </dl>
        <CptTable
          columns={["Size", "Tip", "FRD"]}
          rows={selectedCpt.rows.map((row) => [row.sizeLabel, row.tipLabel, row.frdLabel])}
        />
      </div>
    );
  }

  if (selectedLoadPoints.length === 0) {
    return (
      <div className="right-panel-empty">
        <strong>No CPTs selected</strong>
        <span>Select a load point to see its CPTs, or click a CPT in the viewer.</span>
      </div>
    );
  }

  const overview = getSelectedCptOverviewModel(state, selectedLoadPoints);
  if (overview.rows.length === 0) {
    return (
      <div className="right-panel-empty">
        <strong>No CPTs available</strong>
        <span>No selected CPTs are available for the current load point selection.</span>
      </div>
    );
  }

  const heading = selectedLoadPoints.length > 1
    ? "Selected - CPTs"
    : `${selectedLoadPoints[0].name} - CPTs`;

  return (
    <div className="cpt-panel">
      <header className="right-panel-header"><div><h2>{heading}</h2></div></header>
      <div className="cpt-table-wrap">
        <table className="cpt-table">
          <thead><tr>{overview.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {overview.rows.map((row) => (
              <tr key={row.cpt.id}>
                {row.values.map((value, index) => (
                  <td key={`${row.cpt.id}-${overview.columns[index]}`}>
                    {overview.columns[index] === "CPT" ? (
                      <button
                        className="cpt-link"
                        type="button"
                        onClick={() => onStateChange({ ...state, ...openCpt(state, row.cpt.id) })}
                      >
                        {value}
                      </button>
                    ) : value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CptTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="cpt-table-wrap">
      <table className="cpt-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${row[1]}-${rowIndex}`}>
              {row.map((value, index) => <td key={`${columns[index]}-${index}`}>{value}</td>)}
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
  const options = getPileOptionsForSelectedLoadPoints(state, selectedLoadPoints);
  const rows = getRenderablePileOptionRows({
    cpts: state.cpts,
    costsByOptionKey: state.pileCostByOptionKey,
    legend: getLegendItems(state.bearingCapacities),
    options,
    selectedLoadPointCount: selectedLoadPoints.length,
  });
  const tableRows = getPileOptionTableRows(rows, state.pileOptionFilters, state.pileOptionSort);
  const chosenKey = getChosenPileOptionKeyForSelection(state, selectedLoadPoints);
  const isLoading = state.pileOptionsByLoadPointId.size === 0;
  const fedLabel = selectedLoadPoints.length === 1
    ? `${selectedLoadPoints[0].design_load_kn.toLocaleString("en-US", { maximumFractionDigits: 1 })} kN`
    : `${selectedLoadPoints.length} selected`;

  return (
    <div className="load-point-panel">
      <header className="right-panel-header">
        <div>
          <h2>{selectedLabel}</h2>
          <span>{selectedLoadPoints.length === 1 ? "FED" : "Selection"}</span>
        </div>
        <strong>{fedLabel}</strong>
      </header>

      <section className="pile-options-section">
        <div className="section-heading">
          <h3>Pile Options</h3>
          <span>{isLoading ? "Loading..." : `${tableRows.length} shown`}</span>
        </div>
        {!isLoading && state.analysisError ? (
          <div className="right-panel-empty is-inline" role="alert">
            {`Pile option analysis failed: ${state.analysisError}`}
          </div>
        ) : null}
        {isLoading ? (
          <div className="right-panel-empty is-inline" role={state.analysisError ? "alert" : undefined}>
            {state.analysisError
              ? `Pile option analysis failed: ${state.analysisError}`
              : "Calculating pile options..."}
          </div>
        ) : (
          <div className="pile-options-table-wrap">
            <table className="pile-options-table">
              <thead>
                <tr>
                  {PILE_OPTION_COLUMNS.map((column) => (
                    <th className={`pile-option-column-${column.key}`} key={column.key}>
                      {column.key === "symbol" ? (
                        <span className="sr-only">Symbol</span>
                      ) : (
                        <ColumnHeader
                          column={column.key}
                          label={column.key === "use" ? getUseColumnLabel(selectedLoadPoints.length) : column.label}
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
                      No pile options match the filters.
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
                            {row.governingLabel}
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

function ColumnHeader({ column, label, rows, state, onStateChange }: {
  column: PileOptionTableColumn;
  label: string;
  rows: ReturnType<typeof getRenderablePileOptionRows>;
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
}) {
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
          <summary aria-label={`Filter ${label}`}>▾</summary>
          <div className="filter-menu-content">
            <div className="filter-menu-actions">
              <button
                type="button"
                onClick={() => onStateChange({
                  ...state,
                  pileOptionFilters: { ...state.pileOptionFilters, [column]: [] },
                })}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => onStateChange({
                  ...state,
                  pileOptionFilters: { ...state.pileOptionFilters, [column]: filterValues },
                })}
              >
                All
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
