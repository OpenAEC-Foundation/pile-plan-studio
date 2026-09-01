import type { ProjectState } from "../../domain/projectState";
import { filterActivePileOptions } from "../../domain/activePileConfigurations.ts";
import { getCptDisplayName } from "../../domain/cptDisplayName.ts";
import { getSelectedCptTableModel } from "../../domain/cptSelectionTable.ts";
import { formatNumber, formatOptionalNumber } from "../../domain/formatting.ts";
import { getConfigurationStyle } from "../../viewer/legend.ts";
import { aggregatePileOptionsForLoadPoints } from "../../domain/pileOptionAggregation.ts";
import { getPileOptionStatus } from "../../domain/pileOptionStatus.ts";
import type { PileOptionTableRow } from "../../domain/pileOptionTable.ts";
import { renderPileSymbol } from "../../viewer/pileSymbols.ts";
import {
  pileConfigurationToken,
  samePileConfiguration,
} from "../../core/pileConfigurationKey.ts";
import type { Cpt, LegendItems, LoadPoint, PileConfigurationOption, SelectedCpt } from "../.././core/projectTypes.ts";
import { getEffectivePileOptionsByLoadPointId } from "./cptSettingsModel.ts";

export type RenderablePileOptionTableRow = PileOptionTableRow & {
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

export function getPileOptionsForSelectedLoadPoints(
  state: ProjectState,
  selectedLoadPoints: LoadPoint[],
): PileConfigurationOption[] {
  const pileOptionsByLoadPointId = getEffectivePileOptionsByLoadPointId(state);
  const options = selectedLoadPoints.length <= 1
    ? selectedLoadPoints[0]
      ? pileOptionsByLoadPointId.get(selectedLoadPoints[0].id) ?? []
      : []
    : aggregatePileOptionsForLoadPoints(
      selectedLoadPoints.map((loadPoint) => pileOptionsByLoadPointId.get(loadPoint.id) ?? []),
    );

  return filterActivePileOptions(options, {
    pileSizes: state.activePileSizes,
    pileTipLevels: state.activePileTipLevels,
  });
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
  const chosenKeys = loadPoints.map((loadPoint) => state.selectedPileOptionKeysByLoadPoint.get(loadPoint.id) ?? "");
  const commonChosenKey = chosenKeys[0] && chosenKeys.every((key) => key === chosenKeys[0])
    ? chosenKeys[0]
    : "";
  const showChosenPileCapacity = loadPoints.length === 1 || commonChosenKey !== "";
  const chosenConfiguration = parseOptionKey(commonChosenKey);

  return {
    columns: [...table.columns, showChosenPileCapacity ? "Chosen pile FRD" : "Governing for"],
    rows: table.rows.map((row) => {
      const governingLoadPointCount = loadPoints.filter((loadPoint) => {
        const chosenKey = state.selectedPileOptionKeysByLoadPoint.get(loadPoint.id) ?? "";
        return findOptionByKey(pileOptionsByLoadPointId.get(loadPoint.id) ?? [], chosenKey)
          ?.governing_cpt_id === row.cpt.id;
      }).length;
      const chosenPileCapacity = chosenConfiguration
        ? state.cptFrdRowsByCptId.get(row.cpt.id)?.find((capacity) => (
            capacity.pile_size_mm === chosenConfiguration.pileSizeMm
            && capacity.pile_tip_level_m === chosenConfiguration.pileTipLevelM
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

function findOptionByKey(options: PileConfigurationOption[], key: string): PileConfigurationOption | null {
  const configuration = parseOptionKey(key);
  return configuration
    ? options.find((option) => option.pile_size_mm === configuration.pileSizeMm
      && option.pile_tip_level_m === configuration.pileTipLevelM) ?? null
    : null;
}

function parseOptionKey(key: string): { pileSizeMm: number; pileTipLevelM: number } | null {
  const [pileSizeMm, pileTipLevelM] = key.split("|").map(Number);
  return Number.isFinite(pileSizeMm) && Number.isFinite(pileTipLevelM)
    ? { pileSizeMm, pileTipLevelM }
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
    const governingCpt = option.governing_cpt_id
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
      frdLabel: formatOptionalNumber(option.governing_frd_kn, " kN"),
      frdValue: option.governing_frd_kn,
      governingCptId: governingCpt?.id ?? null,
      governingLabel,
      key,
      sizeLabel,
      sizeValue: option.pile_size_mm,
      statusClassName: status.className,
      statusLabel: status.label,
      symbolHtml: renderPileSymbol(style.symbol, style.color),
      symbolLabel: `${sizeLabel} ${tipLabel}`,
      tipLabel,
      tipValue: option.pile_tip_level_m,
      useLabel: formatOptionalNumber(option.utilization, "%", 100),
      useValue: option.utilization,
    };
  });
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
