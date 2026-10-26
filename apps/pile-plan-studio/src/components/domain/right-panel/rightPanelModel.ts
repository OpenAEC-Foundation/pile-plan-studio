import type { ProjectState } from "../../../domain/project/projectState";
import type { AggregatedPileConfiguration } from "../../../core/pileOptionAggregationContract.ts";
import { getCptDisplayName } from "../../../domain/source-data/cptDisplayName.ts";
import { getSelectedCptTableModel } from "../../../domain/cpt-selection/cptSelectionTable.ts";
import {
  formatNumber,
  formatOptionalNumber,
  formatPileTipLevelMetres,
  formatPileTipLevelMillimetres,
} from "../../../domain/formatting.ts";
import {
  getConfigurationActivationPresentation,
} from "../../../domain/legend/legendActivationPresentation.ts";
import type { ActivePileConfigurations } from "../../../domain/pile-options/activePileConfigurations.ts";
import { getPileOptionStatus } from "../../../domain/pile-options/pileOptionStatus.ts";
import type { PileOptionTableRow } from "../../../domain/pile-options/pileOptionTable.ts";
import { renderPileSymbol } from "../../../viewer/pileSymbols.ts";
import {
  pileConfigurationToken,
  samePileConfiguration,
} from "../../../core/pileConfigurationKey.ts";
import type {
  Cpt,
  LegendItems,
  LoadPoint,
  PileConfigurationKey,
  PileConfigurationOption,
  PileCostSettings,
  SelectedCpt,
} from "../../../core/projectTypes.ts";
import { getDraftCptIds, getManualCptEditTargetIds, getEffectivePileOptionsByLoadPointId } from "../../../domain/cpt-selection/cptSettingsModel.ts";

export type RenderablePileOptionTableRow = PileOptionTableRow & {
  criticalLoadPointId: number | null;
  governingCptId: number | null;
  statusClassName: string;
  symbolHtml: string;
  tipRegionColor: string | null;
  sizeActive: boolean;
  tipActive: boolean;
  smallDot: boolean;
};

export type SelectedCptOverviewModel = {
  columns: string[];
  rows: Array<{
    cpt: Cpt;
    governingLoadPointCount: number;
    usageDetails?: string | null;
    usingLoadPointIds: number[];
    values: string[];
  }>;
};

export type CptFrdPanelModel = {
  cpt: Cpt;
  rows: Array<{
    sizeLabel: string;
    tipLabel: string;
    frdLabel: string;
  }>;
};

export function getSelectedLoadPoints(state: ProjectState): LoadPoint[] {
  const selectedIds = new Set(state.selectedLoadPointIds);
  return state.loadPoints.filter((loadPoint) => selectedIds.has(loadPoint.id));
}

export function getPileOptionsByLoadPointIdForPanel(
  state: ProjectState,
): Map<number, PileConfigurationOption[]> {
  return getEffectivePileOptionsByLoadPointId(state);
}

export function getChosenPileOptionKeyForSelection(
  state: ProjectState,
  selectedLoadPoints: LoadPoint[],
): string {
  const configuration = getChosenPileOptionConfigurationForSelection(state, selectedLoadPoints);
  return configuration ? pileConfigurationToken(configuration) : "";
}

export function getChosenPileOptionConfigurationForSelection(
  state: ProjectState,
  selectedLoadPoints: LoadPoint[],
): PileConfigurationKey | undefined {
  const selectedKeys = selectedLoadPoints.map((loadPoint) =>
    state.selectedPileConfigurationsByLoadPoint.get(loadPoint.id),
  );
  const firstKey = selectedKeys[0];
  return firstKey && selectedKeys.every((key) => samePileConfiguration(key, firstKey))
    ? firstKey
    : undefined;
}

export function getSelectedCptOverviewModel(
  state: ProjectState,
  selectedLoadPoints: LoadPoint[],
): SelectedCptOverviewModel {
  const draft = state.cptSelectionEditDraft ?? null;
  const loadPoints = draft
    ? state.loadPoints.filter((loadPoint) => getManualCptEditTargetIds(state).includes(loadPoint.id))
    : selectedLoadPoints;
  const table = getSelectedCptTableModel(
    loadPoints.map((loadPoint) => ({
      loadPoint,
      isManualSelection: draft !== null,
      selectedCpts: draft
        ? draft.automaticLoadPointIds?.has(loadPoint.id)
          ? (state.cptSelectionPreview?.draft === draft && state.cptSelectionPreview.status === "ready"
            ? state.cptSelectionPreview.selectedCptsByLoadPointId?.get(loadPoint.id) ?? [] : [])
          : buildDraftSelectedCpts(state, loadPoint, new Set(getDraftCptIds(state, loadPoint.id)))
        : state.selectedCptsByLoadPointId.get(loadPoint.id) ?? [],
    })),
  );
  const pileOptionsByLoadPointId = getEffectivePileOptionsByLoadPointId(state);
  const chosenConfigurations = loadPoints.map((loadPoint) =>
    state.selectedPileConfigurationsByLoadPoint.get(loadPoint.id));
  const firstChosenConfiguration = chosenConfigurations[0];
  const chosenConfiguration = firstChosenConfiguration
    && chosenConfigurations.every((configuration) =>
      samePileConfiguration(configuration, firstChosenConfiguration))
    ? firstChosenConfiguration
    : null;
  const showChosenPileCapacity = loadPoints.length === 1 || chosenConfiguration !== null;

  return {
    columns: [...table.columns, showChosenPileCapacity ? "Chosen pile FRD" : "Governing for"],
    rows: table.rows.map((row) => {
      const governingLoadPointCount = loadPoints.filter((loadPoint) => {
        const configuration = state.selectedPileConfigurationsByLoadPoint.get(loadPoint.id);
        return findOptionByConfiguration(pileOptionsByLoadPointId.get(loadPoint.id) ?? [], configuration)
          ?.governing_cpt_id === row.cpt.id;
      }).length;
      const chosenPileCapacity = chosenConfiguration
        ? state.bearingCapacities.find((capacity) => (
            capacity.cpt_id === row.cpt.id
            && capacity.pile_size_mm === chosenConfiguration.pile_size_mm
            && capacity.pile_tip_level_mm === chosenConfiguration.pile_tip_level_mm
          ))?.frd_kn ?? null
        : null;
      return {
        cpt: row.cpt,
        governingLoadPointCount,
        usageDetails: row.usageDetails,
        usingLoadPointIds: loadPoints.filter(point => draft
          ? getDraftCptIds(state, point.id).has(row.cpt.id)
          : state.selectedCptsByLoadPointId.get(point.id)?.some(item => item.cpt.id === row.cpt.id)).map(point => point.id),
        values: [
          ...row.values,
          showChosenPileCapacity
            ? formatOptionalNumber(chosenPileCapacity, " kN")
            : `${governingLoadPointCount} / ${loadPoints.length} load points`,
        ],
      };
    }),
  };
}

function findOptionByConfiguration(
  options: PileConfigurationOption[],
  configuration: PileConfigurationKey | undefined,
): PileConfigurationOption | null {
  return configuration
    ? options.find((option) => samePileConfiguration(option.configuration, configuration)) ?? null
    : null;
}

function buildDraftSelectedCpts(state: ProjectState, loadPoint: LoadPoint, cptIds: Set<number>): SelectedCpt[] {
  const existingSelections = state.selectedCptsByLoadPointId.get(loadPoint.id) ?? [];
  const algorithmicOrder = new Map(
    existingSelections
      .filter((selection) => !isManualSelectionLabel(selection.label))
      .map((selection, index) => [selection.cpt.id, index]),
  );
  const selections = [...cptIds]
    .map((cptId) => state.cpts.find((cpt) => cpt.id === cptId))
    .filter((cpt): cpt is Cpt => cpt !== undefined)
    .map((cpt) => {
      const existing = existingSelections.find((selection) => selection.cpt.id === cpt.id);
      return existing
        ? { ...existing, cpt }
        : {
            cpt,
            distance_mm: Math.hypot(cpt.x_mm - loadPoint.x_mm, cpt.y_mm - loadPoint.y_mm),
            label: "manual",
          };
    });

  selections.sort((left, right) => {
    const leftOrder = algorithmicOrder.get(left.cpt.id);
    const rightOrder = algorithmicOrder.get(right.cpt.id);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      if (leftOrder === undefined) return 1;
      if (rightOrder === undefined) return -1;
      return leftOrder - rightOrder;
    }
    return left.distance_mm - right.distance_mm || left.cpt.id - right.cpt.id;
  });

  let manualIndex = 0;
  return selections.map((selection) => isManualSelectionLabel(selection.label)
    ? { ...selection, label: `manual ${++manualIndex}` }
    : selection);
}

function isManualSelectionLabel(label: string): boolean {
  return /^manual(?:\s*\d+)?$/i.test(label);
}

export function getCptFrdPanelModel(state: ProjectState, locale = "en-US"): CptFrdPanelModel | null {
  const cpt = state.cpts.find((item) => item.id === state.selectedCptId) ?? null;
  if (!cpt) {
    return null;
  }

  return {
    cpt,
    rows: (state.cptFrdRowsByCptId.get(cpt.id) ?? []).map((row) => ({
      sizeLabel: `${formatNumber(row.pile_size_mm)} mm`,
      tipLabel: formatPileTipLevelMetres(row.pile_tip_level_m, locale),
      frdLabel: `${formatNumber(row.frd_kn)} kN`,
    })),
  };
}

function formatDesignLoad(value: number | null | undefined, locale = "en-US"): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "-"
    : `${value.toLocaleString(locale, { maximumFractionDigits: 1 })} kN`;
}

export function getRenderablePileOptionRows(input: {
  activeConfigurations: ActivePileConfigurations;
  cpts: Cpt[];
  costsByOptionKey: Map<string, number | null>;
  currencyCode?: string;
  options: PileConfigurationOption[];
  loadPoint: LoadPoint | null;
  selectedLoadPointCount: number;
  legend: LegendItems;
  pileCostSettings?: PileCostSettings;
  locale?: string;
}): RenderablePileOptionTableRow[] {
  return input.options.map((option) => {
    const status = getPileOptionStatus(option);
    const isMissing = option.technicalStatus === "missing_capacity_data";
    const governingCpt = !isMissing && option.governing_cpt_id
      ? input.cpts.find((cpt) => cpt.id === option.governing_cpt_id) ?? null
      : null;
    const governingLabel = governingCpt ? getCptDisplayName(governingCpt) : "-";
    const key = optionKey(option);
    const cost = input.costsByOptionKey.get(key) ?? null;
    const style = getConfigurationActivationPresentation(
      option, input.legend, input.activeConfigurations, input.pileCostSettings,
    );
    const sizeLabel = `${formatNumber(option.pile_size_mm)} mm`;
    const tipLabel = formatPileTipLevelMillimetres(
      option.configuration.pile_tip_level_mm,
      input.locale ?? "en-US",
    );

    return {
      costLabel: cost === null ? "-" : formatCurrency(cost, input.currencyCode),
      costValue: cost,
      totalCostLabel: cost === null ? "-" : formatCurrency(cost, input.currencyCode),
      totalCostValue: cost,
      frdLabel: isMissing ? "-" : formatOptionalNumber(option.governing_frd_kn, " kN"),
      frdValue: isMissing ? null : option.governing_frd_kn,
      fedValue: input.loadPoint?.design_load_kn ?? null,
      fedLabel: formatDesignLoad(input.loadPoint?.design_load_kn, input.locale),
      governingCptId: governingCpt?.id ?? null,
      governingLabel,
      missingCptIds: sortedUniqueIds(option.missing_cpt_ids),
      criticalLoadPointId: null,
      criticalLoadPointLabel: "-",
      key,
      sizeLabel,
      sizeValue: option.pile_size_mm,
      statusClassName: status.className,
      statusLabel: status.label,
      symbolHtml: renderPileSymbol(style.symbol, style.color),
      tipRegionColor: style.tipRegionColor,
      sizeActive: style.sizeActive,
      tipActive: style.tipActive,
      smallDot: style.smallDot,
      symbolLabel: `${sizeLabel} ${tipLabel}`,
      tipLabel,
      tipValue: option.pile_tip_level_m,
      useLabel: isMissing ? "-" : formatOptionalNumber(option.utilization, "%", 100),
      useValue: isMissing ? null : option.utilization,
      maxUseLabel: isMissing ? "-" : formatOptionalNumber(option.utilization, "%", 100),
      maxUseValue: isMissing ? null : option.utilization,
    };
  });
}

export function getRenderableAggregatedPileOptionRows(input: {
  activeConfigurations: ActivePileConfigurations;
  aggregates: AggregatedPileConfiguration[];
  cpts: Cpt[];
  costsByOptionKey: Map<string, number | null>;
  currencyCode?: string;
  legend: LegendItems;
  loadPoints: LoadPoint[];
  selectedLoadPointCount: number;
  pileCostSettings?: PileCostSettings;
  locale?: string;
}): RenderablePileOptionTableRow[] {
  return input.aggregates.map((aggregate) => {
    const key = pileConfigurationToken(aggregate.configuration);
    const unitCost = input.costsByOptionKey.get(key) ?? null;
    const totalCost = unitCost === null ? null : unitCost * input.selectedLoadPointCount;
    const criticalLoadPoint = aggregate.critical_load_point_id === null
      ? null
      : input.loadPoints.find(({ id }) => id === aggregate.critical_load_point_id) ?? null;
    const pileSizeMm = aggregate.configuration.pile_size_mm;
    const style = getConfigurationActivationPresentation({
      configuration: aggregate.configuration,
      pile_size_mm: pileSizeMm,
      pile_tip_level_m: aggregate.pile_tip_level_m,
    }, input.legend, input.activeConfigurations, input.pileCostSettings);
    const status = aggregate.status === "valid"
      ? { className: "is-ok", label: "OK" }
      : aggregate.status === "missing"
        ? { className: "is-missing", label: "Missing" }
        : { className: "is-not-ok", label: "Insufficient capacity" };
    const isMissing = aggregate.status === "missing";
    const governingCpt = isMissing ? null
      : input.cpts.find(({ id }) => id === aggregate.critical_governing_cpt_id) ?? null;
    const fedValue = isMissing ? null : criticalLoadPoint?.design_load_kn ?? null;
    const sizeLabel = `${formatNumber(pileSizeMm)} mm`;
    const tipLabel = formatPileTipLevelMillimetres(
      aggregate.configuration.pile_tip_level_mm,
      input.locale ?? "en-US",
    );

    return {
      costLabel: unitCost === null ? "-" : formatCurrency(unitCost, input.currencyCode),
      costValue: unitCost,
      totalCostLabel: totalCost === null ? "-" : formatCurrency(totalCost, input.currencyCode),
      totalCostValue: totalCost,
      useLabel: isMissing ? "-" : formatOptionalNumber(aggregate.maximum_utilization, "%", 100),
      useValue: isMissing ? null : aggregate.maximum_utilization,
      maxUseLabel: isMissing ? "-" : formatOptionalNumber(aggregate.maximum_utilization, "%", 100),
      maxUseValue: isMissing ? null : aggregate.maximum_utilization,
      governingCptId: governingCpt?.id ?? null,
      governingLabel: governingCpt ? getCptDisplayName(governingCpt) : "-",
      frdLabel: isMissing ? "-" : formatOptionalNumber(aggregate.critical_governing_frd_kn, " kN"),
      frdValue: isMissing ? null : aggregate.critical_governing_frd_kn,
      fedValue,
      fedLabel: formatDesignLoad(fedValue, input.locale),
      criticalLoadPointId: isMissing ? null : criticalLoadPoint?.id ?? null,
      criticalLoadPointLabel: isMissing ? "-" : criticalLoadPoint?.name || (
        aggregate.critical_load_point_id === null ? "-" : `Load point ${aggregate.critical_load_point_id}`
      ),
      missingCptIds: sortedUniqueIds(aggregate.missing_cpt_ids),
      key,
      sizeLabel,
      sizeValue: pileSizeMm,
      statusClassName: status.className,
      statusLabel: status.label,
      symbolHtml: renderPileSymbol(style.symbol, style.color),
      tipRegionColor: style.tipRegionColor,
      sizeActive: style.sizeActive,
      tipActive: style.tipActive,
      smallDot: style.smallDot,
      symbolLabel: `${sizeLabel} ${tipLabel}`,
      tipLabel,
      tipValue: aggregate.pile_tip_level_m,
    };
  });
}

function sortedUniqueIds(ids: number[]): number[] {
  return [...new Set(ids.filter(Number.isFinite))].sort((left, right) => left - right);
}

export function optionKey(option: Pick<PileConfigurationOption, "configuration">): string {
  return pileConfigurationToken(option.configuration);
}

export function formatCurrency(value: number, currencyCode = "EUR"): string {
  return new Intl.NumberFormat("en-US", {
    currency: currencyCode,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}
