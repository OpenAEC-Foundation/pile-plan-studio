import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/projectState.ts";
import type { PileConfigurationKey } from "../../../core/projectTypes.ts";
import type { LoadPointGroup } from "../../../core/loadPointGroupContract.ts";
import { openCpt, selectLoadPoint } from "../../../domain/selectionState.ts";
import { filterActivePileOptions } from "../../../domain/activePileConfigurations.ts";
import { getActivePilePlan, getPilePlanActivation } from "../../../domain/pilePlanActivation.ts";
import { getNextPileOptionSortState, getPileOptionColumns, getPileOptionFilterValues, getPileOptionTableRows, type PileOptionTableColumn, type SortablePileOptionTableColumn } from "../../../domain/pileOptionTable.ts";
import { getChosenPileOptionConfigurationForSelection, getChosenPileOptionKeyForSelection, getPileOptionsByLoadPointIdForPanel, getRenderableAggregatedPileOptionRows, getRenderablePileOptionRows, getSelectedLoadPoints, optionKey } from "./rightPanelModel.ts";
import { useAggregatedPileOptions } from "./useAggregatedPileOptions.ts";
import type { TechnicalAssignmentSnapshot } from "../../../app/derived-state/technicalAssignmentController.ts";
import TechnicalAssignmentNotice from "./TechnicalAssignmentNotice.tsx";
import MissingCptPopover from "./MissingCptPopover.tsx";
import { CoordinateReadout } from "../shared/CoordinateReadout.ts";
import { getLoadPointGroupNotice, getLoadPointGroupSelection } from "../../../viewer/loadPointGroupSelection.ts";
import { InactiveLabel, ResistanceLabel, localizeCptName, localizeLoadPointName } from "./PanelControls.tsx";

export default function LoadPointPanel({
  state,
  onStateChange,
  pileAssignmentPending,
  onApplyPileConfiguration,
  selectedLabel,
  selectedLoadPoints,
  loadPointGroups,
  technicalAssignment,
}: {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  pileAssignmentPending: boolean;
  onApplyPileConfiguration: (
    selectedLoadPointIds: number[],
    configuration: PileConfigurationKey | null,
  ) => void;
  selectedLabel: string;
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>;
  loadPointGroups: LoadPointGroup[];
  technicalAssignment: TechnicalAssignmentSnapshot;
}) {
  const { t, i18n } = useTranslation("rightPanel");
  const [openMissingCptKey, setOpenMissingCptKey] = useState<string | null>(null);
  const selectedLoadPointKey = selectedLoadPoints.map(({ id }) => id).join(",");
  useEffect(() => setOpenMissingCptKey(null), [selectedLoadPointKey]);
  const pileOptionsByLoadPointId = getPileOptionsByLoadPointIdForPanel(state);
  const active = getPilePlanActivation(getActivePilePlan(state));
  const aggregation = useAggregatedPileOptions({
    selectedLoadPointIds: selectedLoadPoints.map(({ id }) => id),
    pileOptionsByLoadPointId,
  });
  const selectedCount = selectedLoadPoints.length;
  const groupSelection = getLoadPointGroupSelection({
    selectedLoadPointIds: selectedLoadPoints.map(({ id }) => id),
    groups: loadPointGroups,
  });
  const groupNotice = getLoadPointGroupNotice({
    selection: groupSelection,
    selectedLoadPointCount: selectedCount,
  });
  const columns = getPileOptionColumns(selectedCount);
  const retainedConfiguration = getChosenPileOptionConfigurationForSelection(state, selectedLoadPoints);
  const rows = (selectedCount > 1
    ? getRenderableAggregatedPileOptionRows({
        aggregates: aggregation.status === "ready"
          ? filterActivePileOptions(aggregation.result, active, retainedConfiguration)
          : [],
        activeConfigurations: active,
        costsByOptionKey: state.pileCostByOptionKey,
        currencyCode: state.currencyCode,
        legend: state.pileLegend,
        pileCostSettings: state.pileCostSettings,
        loadPoints: state.loadPoints,
        locale: i18n.language,
        selectedLoadPointCount: selectedCount,
      })
    : getRenderablePileOptionRows({
        activeConfigurations: active,
        cpts: state.cpts,
        costsByOptionKey: state.pileCostByOptionKey,
        currencyCode: state.currencyCode,
        legend: state.pileLegend,
        pileCostSettings: state.pileCostSettings,
        options: selectedLoadPoints[0]
          ? filterActivePileOptions(
              pileOptionsByLoadPointId.get(selectedLoadPoints[0].id) ?? [],
              active,
              retainedConfiguration,
            )
          : [],
        locale: i18n.language,
        selectedLoadPointCount: selectedCount,
      })).map((row) => ({
    ...row,
    statusLabel: row.statusLabel === "Missing"
      ? t("status.missing")
      : row.statusLabel === "Insufficient capacity" ? t("status.insufficientCapacity") : t("status.ok"),
  }));
  const visibleFilters = Object.fromEntries(
    columns.map(({ key }) => [key, state.pileOptionFilters[key] ?? []]),
  );
  const visibleSort = state.pileOptionSort && columns.some(({ key }) => key === state.pileOptionSort?.column)
    ? state.pileOptionSort
    : null;
  const tableRows = getPileOptionTableRows(rows, visibleFilters, visibleSort);
  const chosenKey = getChosenPileOptionKeyForSelection(state, selectedLoadPoints);
  const selectedLoadPointIds = new Set(selectedLoadPoints.map(({ id }) => id));
  const involvedLoadPointIds = new Set(selectedLoadPointIds);
  for (const group of loadPointGroups) {
    if (group.load_point_ids.some((loadPointId) => selectedLoadPointIds.has(loadPointId))) {
      group.load_point_ids.forEach((loadPointId) => involvedLoadPointIds.add(loadPointId));
    }
  }
  const hasAssignedSelection = [...involvedLoadPointIds].some((loadPointId) =>
    state.selectedPileConfigurationsByLoadPoint.has(loadPointId));
  const isUnavailable = technicalAssignment.status === "unavailable";
  const isLoading = state.pileOptionsByLoadPointId.size === 0
    || (selectedCount > 1 && aggregation.status === "loading");
  const tableError = selectedCount > 1 && aggregation.status === "error"
    ? aggregation.error
    : state.analysisError;
  const fedLabel = selectedLoadPoints.length === 1
    ? `${selectedLoadPoints[0].design_load_kn.toLocaleString(i18n.language, { maximumFractionDigits: 1 })} kN`
    : t("loadPoints.selectedCount", { count: selectedLoadPoints.length });
  return (
    <div className="load-point-panel">
      <header className="right-panel-header">
        <div>
          <h2>{selectedLabel}</h2>
          {selectedLoadPoints.length > 1 ? <span>{t("loadPoints.selection")}</span> : null}
        </div>
        <strong className={selectedLoadPoints.length === 1 ? "load-point-force" : undefined}>
          {selectedLoadPoints.length === 1 ? (
            <span className="load-point-force-label">F<sub>Ed</sub></span>
          ) : null}
          {fedLabel}
        </strong>
      </header>

      <CoordinateReadout points={selectedLoadPoints} locale={i18n.language} />

      <TechnicalAssignmentNotice
        state={state}
        assessment={technicalAssignment}
        onStateChange={onStateChange}
      />

      {technicalAssignment.status !== "error" ? (
      <section className="pile-options-section">
        <div className="pile-options-heading-stack">
          <div className="section-heading">
            <h3>{t("pileOptions.title")}</h3>
            <div className="section-heading-actions">
              <span>{isLoading ? t("pileOptions.loading") : t("pileOptions.shown", { count: tableRows.length })}</span>
              {hasAssignedSelection ? (
                <button
                  className="clear-pile-assignment"
                  disabled={pileAssignmentPending}
                  type="button"
                  onClick={() => onApplyPileConfiguration(selectedLoadPoints.map(({ id }) => id), null)}
                >
                  {t("pileOptions.clearAssignment")}
                </button>
              ) : null}
            </div>
          </div>
          {groupNotice ? (
            <div className="pile-options-group-notice" role="status">
              {t(groupNotice.translationKey, groupNotice.values)}
            </div>
          ) : null}
        </div>
        {!isLoading && tableError ? (
          <div className="right-panel-empty is-inline" role="alert">
            {t("pileOptions.failed", { error: tableError })}
          </div>
        ) : null}
        {isLoading ? (
          <div className="right-panel-empty is-inline" role={tableError ? "alert" : undefined}>
            {tableError
              ? t("pileOptions.failed", { error: tableError })
              : t("pileOptions.calculating")}
          </div>
        ) : (
          <div className="pile-options-table-wrap">
            <table className="pile-options-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th className={`pile-option-column-${column.key}`} key={column.key}>
                      {column.key === "symbol" ? (
                        <span className="sr-only">{t("columns.symbol", "Symbol")}</span>
                      ) : (
                        <ColumnHeader
                          column={column.key}
                          label={column.key === "frd"
                            ? <ResistanceLabel qualifier={t("columns.minimumQualifier")} />
                            : t(`columns.${column.key}`)}
                          labelText={t(`columns.${column.key}`)}
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
                    <td className="empty-table-cell" colSpan={columns.length}>
                      {isUnavailable
                        ? t("technicalNotice.unavailableExplanation")
                        : t("pileOptions.noMatch")}
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row) => (
                    <tr
                      className={`pile-option-row${row.key === chosenKey ? " is-chosen" : ""}`}
                      key={row.key}
                      aria-disabled={pileAssignmentPending}
                      onClick={() => applyPileOption(
                        state,
                        onApplyPileConfiguration,
                        pileAssignmentPending,
                        selectedLoadPoints,
                        row.key,
                      )}
                    >
                      {columns.map(({ key }) => (
                        <td className={key === "symbol" ? "pile-option-symbol-cell" : undefined} key={key}>
                          {key === "symbol" ? <span className={row.smallDot ? "is-small-dot" : undefined} dangerouslySetInnerHTML={{ __html: row.symbolHtml }} />
                            : key === "size" ? <>{row.sizeLabel}{!row.sizeActive ? <InactiveLabel /> : null}</>
                            : key === "tip" ? <>{row.tipLabel}{!row.tipActive ? <InactiveLabel /> : null}</>
                            : key === "status" ? (
                              row.statusClassName === "is-missing" && row.missingCptIds.length > 0
                                ? <MissingCptPopover
                                    cptIds={row.missingCptIds}
                                    label={row.statusLabel}
                                    open={openMissingCptKey === row.key}
                                    state={state}
                                    onOpenChange={(nextOpen) => setOpenMissingCptKey((current) => nextOpen
                                      ? toggleMissingCptPopover(current, row.key)
                                      : current === row.key ? null : current)}
                                    onStateChange={onStateChange}
                                  />
                                : <span
                                    className={`status-pill ${row.statusClassName}`}
                                    title={row.statusClassName === "is-missing" ? t("pileOptions.missingNoCptIdsTitle") : undefined}
                                  >{row.statusLabel}</span>
                            )
                            : key === "cost" ? row.costLabel
                            : key === "totalCost" ? row.totalCostLabel
                            : key === "use" ? row.useLabel
                            : key === "maxUse" ? row.maxUseLabel
                            : key === "governing" ? (row.governingCptId === null ? row.governingLabel : (
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
                            ))
                            : key === "frd" ? row.frdLabel
                            : row.criticalLoadPointId === null ? row.criticalLoadPointLabel : (
                              <button
                                className="cpt-link"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onStateChange({ ...state, ...selectLoadPoint(state, row.criticalLoadPointId as number) });
                                }}
                              >
                                {localizeLoadPointName(row.criticalLoadPointLabel, t)}
                              </button>
                            )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}
    </div>
  );
}

function toggleMissingCptPopover(current: string | null, requested: string): string | null {
  return current === requested ? null : requested;
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
  const filterValues = getPileOptionFilterValues(rows, sortColumn);
  const selectedValues = new Set(state.pileOptionFilters[column] ?? []);
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
  onApplyPileConfiguration: (
    selectedLoadPointIds: number[],
    configuration: PileConfigurationKey | null,
  ) => void,
  pileAssignmentPending: boolean,
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>,
  configurationToken: string,
) {
  if (pileAssignmentPending) return;
  const configuration = selectedLoadPoints
    .flatMap((loadPoint) => state.pileOptionsByLoadPointId.get(loadPoint.id) ?? [])
    .find((option) => optionKey(option) === configurationToken)?.configuration;
  if (!configuration) return;
  onApplyPileConfiguration(
    selectedLoadPoints.map(({ id }) => id),
    { ...configuration },
  );
}

