import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import type { PileConfigurationKey, PileConfigurationOption } from "./projectTypes.ts";

export type AggregatedPileConfigurationStatus = "valid" | "invalid" | "missing";

export type AggregatedPileConfiguration = {
  configuration: PileConfigurationKey;
  pile_tip_level_m: number;
  status: AggregatedPileConfigurationStatus;
  missing_load_point_ids: number[];
  invalid_load_point_ids: number[];
  maximum_utilization: number | null;
  critical_load_point_id: number | null;
  critical_governing_cpt_id: number | null;
  critical_governing_frd_kn: number | null;
};

export type CoreAggregatedPileConfiguration = AggregatedPileConfiguration;

export type CorePileConfigurationOption = Omit<PileConfigurationOption, "isOption"> & {
  is_option: boolean;
};

export type BrowserAggregatePileOptionsRequest = {
  options_by_load_point: Map<number, CorePileConfigurationOption[]>;
};

export type DesktopAggregatePileOptionsRequest = {
  options_by_load_point: Record<string, CorePileConfigurationOption[]>;
};

export function aggregatedPileConfigurationsFromCore(
  value: CoreAggregatedPileConfiguration[],
): AggregatedPileConfiguration[] {
  return value.map((item) => ({
    ...item,
    configuration: { ...item.configuration },
    missing_load_point_ids: [...item.missing_load_point_ids],
    invalid_load_point_ids: [...item.invalid_load_point_ids],
  }));
}

export function toBrowserAggregatePileOptionsRequest(
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>,
): BrowserAggregatePileOptionsRequest {
  return {
    options_by_load_point: toWasmNumberKeyedMap(toCoreOptionsByLoadPoint(optionsByLoadPoint)),
  };
}

export function toDesktopAggregatePileOptionsRequest(
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>,
): DesktopAggregatePileOptionsRequest {
  return {
    options_by_load_point: toStringKeyedRecord(toCoreOptionsByLoadPoint(optionsByLoadPoint)),
  };
}

function toCoreOptionsByLoadPoint(
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>,
): Map<number, CorePileConfigurationOption[]> {
  return new Map(
    [...optionsByLoadPoint].map(([loadPointId, options]) => [
      loadPointId,
      options.map(({ isOption, ...option }) => ({ ...option, is_option: isOption })),
    ]),
  );
}
