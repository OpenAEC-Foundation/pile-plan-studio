import type {
  CptBearingCapacityRow,
  PileConfigurationOption,
  ProjectAnalysisResult,
  SelectedCpt,
} from "./projectTypes.ts";

export type CorePileConfigurationOption = Omit<PileConfigurationOption, "isOption"> & {
  is_option: boolean;
};

export type CoreProjectAnalysisResult = {
  pile_options_by_load_point:
    | Map<number, CorePileConfigurationOption[]>
    | Record<string, CorePileConfigurationOption[]>;
  selected_cpts_by_load_point: Map<number, SelectedCpt[]> | Record<string, SelectedCpt[]>;
  cpt_frd_rows_by_cpt_id:
    | Map<number, CptBearingCapacityRow[]>
    | Record<string, CptBearingCapacityRow[]>
    | null
    | undefined;
};

export function projectAnalysisResultFromCore(
  result: CoreProjectAnalysisResult,
): ProjectAnalysisResult {
  return {
    pileOptionsByLoadPointId: corePileOptionsMapToFrontend(result.pile_options_by_load_point),
    selectedCptsByLoadPointId: numericMap(result.selected_cpts_by_load_point),
    cptFrdRowsByCptId: result.cpt_frd_rows_by_cpt_id == null
      ? null
      : numericMap(result.cpt_frd_rows_by_cpt_id),
  };
}

export function corePileOptionsMapToFrontend(value: unknown): Map<number, PileConfigurationOption[]> {
  const entries = value instanceof Map
    ? [...value.entries()]
    : Object.entries(value as Record<string, CorePileConfigurationOption[]>);

  return new Map(
    entries.map(([loadPointId, options]) => [
      Number(loadPointId),
      (options as CorePileConfigurationOption[]).map(fromCorePileOption),
    ]),
  );
}

export function numericMap<T>(value: Map<number, T> | Record<string, T>): Map<number, T> {
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
  return new Map(entries.map(([key, item]) => [Number(key), item]));
}

export function fromCorePileOption(option: CorePileConfigurationOption): PileConfigurationOption {
  return {
    pile_size_mm: option.pile_size_mm,
    pile_tip_level_m: option.pile_tip_level_m,
    isOption: option.is_option,
    governing_cpt_id: normalizeOptionalNumber(option.governing_cpt_id),
    governing_frd_kn: normalizeOptionalNumber(option.governing_frd_kn),
    utilization: normalizeOptionalNumber(option.utilization),
    missing_cpt_ids: option.missing_cpt_ids,
  };
}

function normalizeOptionalNumber(value: number | null | undefined): number | null {
  return value === undefined || value === null || !Number.isFinite(value) ? null : value;
}
