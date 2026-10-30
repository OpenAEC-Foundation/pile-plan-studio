import {useDisplayOptions,useLoadDirection} from "../../../app/derived-state/LoadDirectionContext.tsx";
import {directionalLoadPoint,directionalOption} from "../../../domain/pile-options/loadDirection.ts";
import type { PileCapProposal, PileCapPreview } from "../../../core/pileCapProposalTypes.ts";
import { pileConfigurationToken } from "../../../core/pileConfigurationKey.ts";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import type { PileConfigurationKey } from "../../../core/projectTypes.ts";
import type {
  LoadPointGroup,
} from "../../../core/loadPointGroupContract.ts";
import { openCpt, selectLoadPoint } from "../../../domain/workspace/selectionState.ts";
import { filterActivePileOptions } from "../../../domain/pile-options/activePileConfigurations.ts";
import { getActivePilePlan, getPilePlanActivation } from "../../../domain/pile-plans/pilePlanActivation.ts";
import { getNextPileOptionSortState, getPileOptionFilterValues, getPileOptionTableRows, type PileOptionTableColumn, type SortablePileOptionTableColumn } from "../../../domain/pile-options/pileOptionTable.ts";
import { getVisiblePileOptionColumns, type PileOptionColumnLayouts, type PileOptionColumnLayout } from "../../../domain/pile-options/pileOptionColumnLayout.ts";
import PileOptionColumns from "./PileOptionColumns.tsx";
import { getChosenPileOptionConfigurationForSelection, getChosenPileOptionKeyForSelection, getPileOptionsByLoadPointIdForPanel, getRenderableAggregatedPileOptionRows, getRenderablePileOptionRows, getSelectedLoadPoints, optionKey } from "./rightPanelModel.ts";
import { useAggregatedPileOptions } from "./useAggregatedPileOptions.ts";
import type { TechnicalAssignmentSnapshot } from "../../../app/derived-state/technicalAssignmentController.ts";
import type { GroupAssignmentAssessmentSnapshot } from "../../../app/derived-state/groupAssignmentAssessmentController.ts";
import TechnicalAssignmentNotice from "./TechnicalAssignmentNotice.tsx";
import MissingCptPopover from "./MissingCptPopover.tsx";
import { InactiveLabel, ResistanceLabel, localizeCptName, localizeLoadPointName } from "./PanelControls.tsx";
import {combinedOptionStatus} from "../../../domain/pile-options/combinedStatus.ts";
import CombinedStatusPill from "./CombinedStatusPill.tsx";

export default function LoadPointPanel({
  pileCapProposal=null,pileCapPreview=null,pileCapPending=false,pileCapError=false,onPileCapConfigurationChange=()=>{},
  state,
  onStateChange,
  pileAssignmentPending,
  onApplyPileConfiguration,
  selectedLoadPoints,
  loadPointGroups,
  technicalAssignment,
  groupAssignmentAssessment,
  columnLayouts,
  onColumnLayoutChange,
}: {
  pileCapProposal?: PileCapProposal|null;
  pileCapPreview?: PileCapPreview|null;
  pileCapPending?: boolean;
  pileCapError?: boolean;
  onPileCapConfigurationChange?: (configuration:PileConfigurationKey|null)=>void;
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  pileAssignmentPending: boolean;
  onApplyPileConfiguration: (
    selectedLoadPointIds: number[],
    configuration: PileConfigurationKey | null,
  ) => void;
  selectedLoadPoints: ReturnType<typeof getSelectedLoadPoints>;
  loadPointGroups: LoadPointGroup[];
  technicalAssignment: TechnicalAssignmentSnapshot;
  groupAssignmentAssessment: GroupAssignmentAssessmentSnapshot;
  columnLayouts: PileOptionColumnLayouts;
  onColumnLayoutChange: (mode: keyof PileOptionColumnLayouts, layout: PileOptionColumnLayout) => void;
}) {
  const { t, i18n } = useTranslation("rightPanel");
  const {mode,setMode}=useLoadDirection();
  const {t:common}=useTranslation("common");
  const displayLoadPoints=selectedLoadPoints.map(p=>directionalLoadPoint(p,mode));
  const [openMissingCptKey, setOpenMissingCptKey] = useState<string | null>(null);
  const selectedLoadPointKey = selectedLoadPoints.map(({ id }) => id).join(",");
  useEffect(() => setOpenMissingCptKey(null), [selectedLoadPointKey]);
  const pileOptionsByLoadPointId = useDisplayOptions(getPileOptionsByLoadPointIdForPanel(state));
  const active = getPilePlanActivation(getActivePilePlan(state));
  const aggregation = useAggregatedPileOptions({
    selectedLoadPointIds: selectedLoadPoints.map(({ id }) => id),
    pileOptionsByLoadPointId,
  });
  const selectedCount = selectedLoadPoints.length;
  const selectedIds = selectedLoadPoints.map(({ id }) => id).sort((left, right) => left - right);
  const columnCount = pileCapProposal ? Math.max(2,pileCapProposal.pile_count) : selectedCount;
  const columnMode = columnCount > 1 ? "multiple" : "single";
  const columnLayout = columnLayouts[columnMode];
  const columns = getVisiblePileOptionColumns(columnCount, columnLayout);
  const retainedConfiguration = pileCapProposal?.configuration ?? getChosenPileOptionConfigurationForSelection(state, selectedLoadPoints);
  const proposalCosts = new Map((pileCapPreview?.options??[]).map(o=>[pileConfigurationToken(o.configuration),o.cost_per_pile]));
  const proposalRows = getRenderablePileOptionRows({activeConfigurations:active,cpts:state.cpts,costsByOptionKey:proposalCosts,
    currencyCode:state.currencyCode,options:(pileCapPreview?.options??[]).map(o=>directionalOption(o,mode)),loadPoint:selectedLoadPoints[0]&&pileCapPreview?.load_per_pile_kn!=null?{...selectedLoadPoints[0],design_load_kn:mode==="compression"?pileCapPreview.load_per_pile_kn:pileCapPreview.tension_per_pile?.state==="known"?pileCapPreview.tension_per_pile.value_kn:NaN}:null,
    selectedLoadPointCount:pileCapProposal?.pile_count??0,legend:state.pileLegend,pileCostSettings:state.pileCostSettings,locale:i18n.language}).map((row,index)=>{
      const total=pileCapPreview!.options[index].total_cost;
      return {...row,totalCostValue:total,totalCostLabel:total===null?"-":new Intl.NumberFormat(i18n.language,{style:"currency",currency:state.currencyCode,maximumFractionDigits:0}).format(total)};
    });
  const rows = (pileCapProposal ? proposalRows : selectedCount > 1
    ? getRenderableAggregatedPileOptionRows({
        cpts: state.cpts,
        aggregates: aggregation.status === "ready"
          ? filterActivePileOptions(aggregation.result, active, retainedConfiguration)
          : [],
        activeConfigurations: active,
        costsByOptionKey: state.pileCostByOptionKey,
        currencyCode: state.currencyCode,
        legend: state.pileLegend,
        pileCostSettings: state.pileCostSettings,
        loadPoints: state.loadPoints.map(p=>directionalLoadPoint(p,mode)),
        locale: i18n.language,
        selectedLoadPointCount: selectedCount,
      })
    : getRenderablePileOptionRows({
        loadPoint: displayLoadPoints[0] ?? null,
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
    statusClassName: directionalRowStatus(row.key)==="not_assessed"?"is-not-assessed":directionalRowStatus(row.key)==="no_load"?"is-no-load":row.statusClassName,
    statusLabel: directionalRowStatus(row.key) ? common(`loadDirection.status.${directionalRowStatus(row.key)}`)
      : row.statusLabel === "Missing"
      ? t("status.missing")
      : row.statusLabel === "Insufficient capacity" ? t("status.insufficientCapacity") : t("status.ok"),
  })).map(row=>{
    const facts=pileCapProposal?[pileCapPreview?.options.find(o=>optionKey(o)===row.key)]:selectedLoadPoints.map(p=>state.pileOptionsByLoadPointId.get(p.id)?.find(o=>optionKey(o)===row.key));
    const combined=combinedOptionStatus(facts.filter((f):f is NonNullable<typeof f>=>!!f),mode);
    return {...row,combined,statusLabel:combined?common(`loadDirection.combined.${combined.key}`):row.statusLabel,statusClassName:combined?.className??row.statusClassName};
  });
  function directionalRowStatus(key:string) {
    const assessments=pileCapProposal
      ? [pileCapPreview?.options.find(o=>optionKey(o)===key)?.[mode]]
      : selectedLoadPoints.map(p=>pileOptionsByLoadPointId.get(p.id)?.find(o=>optionKey(o)===key)?.[mode]);
    if(assessments.some(a=>a?.status==="missing_demand"))return "missing_demand";
    if(assessments.length&&assessments.every(a=>a?.status==="not_assessed"))return "not_assessed";
    if(assessments.length&&assessments.every(a=>a?.status==="no_load"))return "no_load";
    return null;
  }
  const visibleFilters = Object.fromEntries(
    columns.map(({ key }) => [key, state.pileOptionFilters[key] ?? []]),
  );
  const visibleSort = state.pileOptionSort && columns.some(({ key }) => key === state.pileOptionSort?.column)
    ? state.pileOptionSort
    : null;
  const tableRows = getPileOptionTableRows(rows, visibleFilters, visibleSort);
  const chosenKey = pileCapProposal ? (pileCapProposal.configuration?pileConfigurationToken(pileCapProposal.configuration):null) : getChosenPileOptionKeyForSelection(state, selectedLoadPoints);
  const selectedLoadPointIds = new Set(selectedLoadPoints.map(({ id }) => id));
  const involvedLoadPointIds = new Set(selectedLoadPointIds);
  for (const group of loadPointGroups) {
    if (group.load_point_ids.some((loadPointId) => selectedLoadPointIds.has(loadPointId))) {
      group.load_point_ids.forEach((loadPointId) => involvedLoadPointIds.add(loadPointId));
    }
  }
  const hasAssignedSelection = pileCapProposal ? pileCapProposal.configuration!==null : [...involvedLoadPointIds].some((loadPointId) =>
    state.selectedPileConfigurationsByLoadPoint.has(loadPointId));
  const isUnavailable = technicalAssignment.status === "unavailable";
  const isLoading = pileCapProposal ? pileCapPending : state.pileOptionsByLoadPointId.size === 0
    || (selectedCount > 1 && aggregation.status === "loading");
  const tableError = pileCapProposal ? (pileCapError?t("pileCap.failed"):null) : selectedCount > 1 && aggregation.status === "error"
    ? aggregation.error
    : state.analysisError;
  return (
    <div className="load-point-panel">
      {getSelectedGroupConflict(groupAssignmentAssessment, selectedIds) ? (
        <div className="panel-message is-error load-point-group-conflict" role="alert">
          <strong>{t("groupConflict.title")}</strong>
          <span>{getSelectedGroupConflict(groupAssignmentAssessment, selectedIds)?.assignment_repair_blocked
            ? t("groupConflict.locked")
            : t("groupConflict.repair")}</span>
        </div>
      ) : null}

      <TechnicalAssignmentNotice
        state={state}
        assessment={technicalAssignment}
        onStateChange={onStateChange}
      />

      {technicalAssignment.status !== "error" || pileCapProposal ? (
      <section className="pile-options-section">
        <div className="pile-options-heading-stack">
          <div className="section-heading">
            <h3>{t(pileCapProposal?"pileCap.optionsTitle":"pileOptions.title")}</h3>
            <div className="section-heading-actions">
              <span>{isLoading ? t("pileOptions.loading") : t("pileOptions.shown", { count: tableRows.length })}</span>
              <PileOptionColumns layout={columnLayout} selectedCount={columnCount}
                onChange={layout => onColumnLayoutChange(columnMode, layout)} />
              {hasAssignedSelection ? (
                <button
                  className="clear-pile-assignment"
                  disabled={pileAssignmentPending}
                  type="button"
                  onClick={() => pileCapProposal ? onPileCapConfigurationChange(null) : onApplyPileConfiguration(selectedLoadPoints.map(({ id }) => id), null)}
                >
                  {t("pileOptions.clearAssignment")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {pileCapPreview&&pileCapPreview.status!=="active"?<div className="panel-message" role="status">{t(pileCapPreview.status==="missing_cpt_selection"?"pileCap.missingSelection":"pileCap.invalidSource")}</div>:null}
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
                            : column.key === "fed" ? <>F<sub>{mode==="tension"?"t;Ed":"Ed"}</sub></>
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
                      onClick={() => pileCapProposal ? (!pileAssignmentPending&&!pileCapPending&&onPileCapConfigurationChange(pileCapPreview?.options.find(o=>pileConfigurationToken(o.configuration)===row.key)?.configuration??null)) : applyPileOption(
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
                            : key === "tip" ? <>{row.tipRegionColor ? (
                              <span className="pile-option-tip-label">
                                <span className="pile-option-tip-color" aria-hidden="true" style={{ backgroundColor: row.tipRegionColor }} />
                                <span>{row.tipLabel}</span>
                              </span>
                            ) : row.tipLabel}{!row.tipActive ? <InactiveLabel /> : null}</>
                            : key === "status" ? (
                              row.combined?.switchTo ? <CombinedStatusPill status={row.combined} onSwitch={setMode}/> : row.statusClassName === "is-missing" && row.missingCptIds.length > 0
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
                                    title={row.combined ? (["valid","insufficient_capacity","not_assessed"].includes(row.combined.key) ? undefined : common(`loadDirection.combinedHelp.${row.combined.key}`)) : row.statusClassName === "is-missing" ? t("pileOptions.missingNoCptIdsTitle") : undefined}
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
                            : key === "fed" ? row.fedLabel
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

function getSelectedGroupConflict(
  assessment: GroupAssignmentAssessmentSnapshot,
  selectedIds: number[],
) {
  return selectedIds.map((id) => assessment.conflictsByLoadPointId.get(id)).find(Boolean) ?? null;
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

