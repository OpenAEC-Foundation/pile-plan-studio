import type { ProjectState } from "../../domain/projectState";
import { filterActivePileOptions } from "../../domain/activePileConfigurations.ts";
import { getSelectedCptTableModel } from "../../domain/cptSelectionTable.ts";
import { formatNumber, formatOptionalNumber } from "../../domain/formatting.ts";
import { getConfigurationStyle, type getLegendItems } from "../../viewer/legend.ts";
import { aggregatePileOptionsForLoadPoints } from "../../domain/pileOptionAggregation.ts";
import { getPileOptionStatus } from "../../domain/pileOptionStatus.ts";
import type { PileOptionTableRow } from "../../domain/pileOptionTable.ts";
import { renderPileSymbol } from "../../viewer/pileSymbols.ts";
import type { Cpt, LoadPoint, PileConfigurationOption } from "../.././core/projectTypes.ts";

export type RenderablePileOptionTableRow = PileOptionTableRow & {
  governingCptId: number | null;
  statusClassName: string;
  symbolHtml: string;
};

export type SelectedCptOverviewModel = {
  columns: string[];
  rows: Array<{
    cpt: Cpt;
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
  const options = selectedLoadPoints.length <= 1
    ? selectedLoadPoints[0]
      ? state.pileOptionsByLoadPointId.get(selectedLoadPoints[0].id) ?? []
      : []
    : aggregatePileOptionsForLoadPoints(
      selectedLoadPoints.map((loadPoint) => state.pileOptionsByLoadPointId.get(loadPoint.id) ?? []),
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
    state.selectedPileOptionKeysByLoadPoint.get(loadPoint.id) ?? "",
  );
  const firstKey = selectedKeys[0] ?? "";

  return selectedKeys.every((key) => key === firstKey) ? firstKey : "";
}

export function getSelectedCptOverviewModel(
  state: ProjectState,
  selectedLoadPoints: LoadPoint[],
): SelectedCptOverviewModel {
  const table = getSelectedCptTableModel(
    selectedLoadPoints.map((loadPoint) => ({
      loadPoint,
      selectedCpts: state.selectedCptsByLoadPointId.get(loadPoint.id) ?? [],
    })),
  );

  return {
    columns: [...table.columns, "FRD range"],
    rows: table.rows.map((row) => ({
      cpt: row.cpt,
      values: [...row.values, formatFrdRange(state.cptFrdRowsByCptId.get(row.cpt.id) ?? [])],
    })),
  };
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
  options: PileConfigurationOption[];
  selectedLoadPointCount: number;
  legend: ReturnType<typeof getLegendItems>;
}): RenderablePileOptionTableRow[] {
  return input.options.map((option) => {
    const status = getPileOptionStatus(option);
    const governingCpt = option.governing_cpt_id
      ? input.cpts.find((cpt) => cpt.id === option.governing_cpt_id) ?? null
      : null;
    const governingLabel = governingCpt?.name ?? "-";
    const key = optionKey(option);
    const cost = input.costsByOptionKey.get(key) ?? null;
    const style = getConfigurationStyle(option, input.legend);
    const sizeLabel = `${formatNumber(option.pile_size_mm)} mm`;
    const tipLabel = `${formatNumber(option.pile_tip_level_m)} m`;

    return {
      costLabel: cost === null ? "-" : formatCurrency(cost),
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
      symbolHtml: renderPileSymbol(style.shape, style.color),
      symbolLabel: `${sizeLabel} ${tipLabel}`,
      tipLabel,
      tipValue: option.pile_tip_level_m,
      useLabel: formatOptionalNumber(option.utilization, "%", 100),
      useValue: option.utilization,
    };
  });
}

export function optionKey(option: Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m">): string {
  return `${option.pile_size_mm}|${option.pile_tip_level_m}`;
}

function formatFrdRange(rows: Array<{ frd_kn: number }>): string {
  if (rows.length === 0) {
    return "-";
  }

  const values = rows.map((row) => row.frd_kn);
  return `${formatNumber(Math.min(...values))}-${formatNumber(Math.max(...values))} kN`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "EUR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}
