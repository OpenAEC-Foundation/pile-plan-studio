import type { ProjectState } from "../../domain/projectState";
import type { AggregatedPileConfiguration } from "../../core/pileOptionAggregationContract.ts";
import { getCptDisplayName } from "../../domain/cptDisplayName.ts";
import { getSelectedCptTableModel } from "../../domain/cptSelectionTable.ts";
import { formatNumber, formatOptionalNumber } from "../../domain/formatting.ts";
import { getConfigurationStyle } from "../../viewer/legend.ts";
import { getPileOptionStatus } from "../../domain/pileOptionStatus.ts";
import type { PileOptionTableRow } from "../../domain/pileOptionTable.ts";
import { renderPileSymbol } from "../../viewer/pileSymbols.ts";
import {
  pileConfigurationToken,
  samePileConfiguration,
} from "../../core/pileConfigurationKey.ts";
import type {
  Cpt,
  LegendItems,
  LoadPoint,
  PileConfigurationKey,
  PileConfigurationOption,
  SelectedCpt,
} from "../.././core/projectTypes.ts";
import { getEffectivePileOptionsByLoadPointId } from "./cptSettingsModel.ts";

export type RenderablePileOptionTableRow = PileOptionTableRow & {
  criticalLoadPointId: number | null;
  governingCptId: number | null;
  statusClassName: string;
  symbolHtml: string;
};

export type SelectedCptOverviewModel = {
  columns: string[];
  rows: Array<{
    cpt: Cpt;
    governingLoadPointCount: number;
    usageDetails?: string | null;
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

export function formatLoadPointPanelTitle(name: string): string {
  return /^load point\b/i.test(name.trim()) ? name.trim() : `Load point ${name.trim()}`;
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
  const selectedKeys = selectedLoadPoints.map((loadPoint) =>
    state.selectedPileConfigurationsByLoadPoint.get(loadPoint.id),
  );
  const firstKey = selectedKeys[0];

  return firstKey && selectedKeys.every((key) => samePileConfiguration(key, firstKey))
    ? pileConfigurationToken(firstKey)
    : "";
}

export function getSelectedCptOverviewModel(
  state: ProjectState,
  selectedLoadPoints: LoadPoint[],
): SelectedCptOverviewModel {
  const draft = state.cptSelectionEditDraft ?? null;
  const loadPoints = draft
    ? state.loadPoints.filter((loadPoint) => draft.loadPointIds.includes(loadPoint.id))
    : selectedLoadPoints;
  const table = getSelectedCptTableModel(
    loadPoints.map((loadPoint) => ({
      loadPoint,
      isManualSelection: draft !== null,
      selectedCpts: draft
        ? buildDraftSelectedCpts(state, loadPoint, draft.cptIdsByLoadPoint.get(loadPoint.id) ?? new Set())
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
        ? state.cptFrdRowsByCptId.get(row.cpt.id)?.find((capacity) => (
            capacity.pile_size_mm === chosenConfiguration.pile_size_mm
            && capacity.pile_tip_level_m === chosenConfiguration.pile_tip_level_mm / 1000
          ))?.frd_kn ?? null
        : null;
      return {
        cpt: row.cpt,
        governingLoadPointCount,
        usageDetails: row.usageDetails,
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

export function getCptFrdPanelModel(state: ProjectState): CptFrdPanelModel | null {
  const cpt = state.cpts.find((item) => item.id === state.selectedCptId) ?? null;
  if (!cpt) {
    return null;
  }

  return {
    cpt,
    rows: (state.cptFrdRowsByCptId.get(cpt.id) ?? []).map((row) => ({
      sizeLabel: `${formatNumber(row.pile_size_mm)} mm`,
      tipLabel: `${formatNumber(row.pile_tip_level_m)} m`,
      frdLabel: `${formatNumber(row.frd_kn)} kN`,
    })),
  };
}

export function getRenderablePileOptionRows(input: {
  cpts: Cpt[];
  costsByOptionKey: Map<string, number | null>;
  currencyCode?: string;
  options: PileConfigurationOption[];
  selectedLoadPointCount: number;
  legend: LegendItems;
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
    const style = getConfigurationStyle(option, input.legend);
    const sizeLabel = `${formatNumber(option.pile_size_mm)} mm`;
    const tipLabel = `${formatNumber(option.pile_tip_level_m)} m`;

    return {
      costLabel: cost === null ? "-" : formatCurrency(cost, input.currencyCode),
      costValue: cost,
      totalCostLabel: cost === null ? "-" : formatCurrency(cost, input.currencyCode),
      totalCostValue: cost,
      frdLabel: isMissing ? "-" : formatOptionalNumber(option.governing_frd_kn, " kN"),
      frdValue: isMissing ? null : option.governing_frd_kn,
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
  aggregates: AggregatedPileConfiguration[];
  costsByOptionKey: Map<string, number | null>;
  currencyCode?: string;
  legend: LegendItems;
  loadPoints: LoadPoint[];
  selectedLoadPointCount: number;
}): RenderablePileOptionTableRow[] {
  return input.aggregates.map((aggregate) => {
    const key = pileConfigurationToken(aggregate.configuration);
    const unitCost = input.costsByOptionKey.get(key) ?? null;
    const totalCost = unitCost === null ? null : unitCost * input.selectedLoadPointCount;
    const criticalLoadPoint = aggregate.critical_load_point_id === null
      ? null
      : input.loadPoints.find(({ id }) => id === aggregate.critical_load_point_id) ?? null;
    const pileSizeMm = aggregate.configuration.pile_size_mm;
    const style = getConfigurationStyle({
      pile_size_mm: pileSizeMm,
      pile_tip_level_m: aggregate.pile_tip_level_m,
    }, input.legend);
    const status = aggregate.status === "valid"
      ? { className: "is-ok", label: "OK" }
      : aggregate.status === "missing"
        ? { className: "is-missing", label: "Missing" }
        : { className: "is-not-ok", label: "Insufficient capacity" };
    const isMissing = aggregate.status === "missing";
    const sizeLabel = `${formatNumber(pileSizeMm)} mm`;
    const tipLabel = `${formatNumber(aggregate.pile_tip_level_m)} m`;

    return {
      costLabel: unitCost === null ? "-" : formatCurrency(unitCost, input.currencyCode),
      costValue: unitCost,
      totalCostLabel: totalCost === null ? "-" : formatCurrency(totalCost, input.currencyCode),
      totalCostValue: totalCost,
      useLabel: isMissing ? "-" : formatOptionalNumber(aggregate.maximum_utilization, "%", 100),
      useValue: isMissing ? null : aggregate.maximum_utilization,
      maxUseLabel: isMissing ? "-" : formatOptionalNumber(aggregate.maximum_utilization, "%", 100),
      maxUseValue: isMissing ? null : aggregate.maximum_utilization,
      governingCptId: isMissing ? null : aggregate.critical_governing_cpt_id,
      governingLabel: "-",
      frdLabel: isMissing ? "-" : formatOptionalNumber(aggregate.critical_governing_frd_kn, " kN"),
      frdValue: isMissing ? null : aggregate.critical_governing_frd_kn,
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
