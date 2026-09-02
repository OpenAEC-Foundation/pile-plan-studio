import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import { loadPointGroupsFromCore, type LoadPointGroup } from "./loadPointGroupContract.ts";
import {
  toCorePileOptionsByLoadPoint,
  type CorePileConfigurationOption,
} from "./pileOptionAggregationContract.ts";
import type { PileConfigurationOption, PileCostSettings } from "./projectTypes.ts";

export type DefaultPileSelectionContractInput = {
  groups: LoadPointGroup[];
  optionsByLoadPointId: Map<number, PileConfigurationOption[]>;
  pileHeadLevelM: number;
  costSettings: PileCostSettings;
};

type CoreDefaultPileSelectionRequest<TOptions> = {
  groups: LoadPointGroup[];
  options_by_load_point: TOptions;
  pile_head_level_m: number;
  cost_settings: PileCostSettings;
};

export type BrowserDefaultPileSelectionRequest = CoreDefaultPileSelectionRequest<
  Map<number, CorePileConfigurationOption[]>
>;

export type DesktopDefaultPileSelectionRequest = CoreDefaultPileSelectionRequest<
  Record<string, CorePileConfigurationOption[]>
>;

export function toBrowserDefaultPileSelectionRequest(
  input: DefaultPileSelectionContractInput,
): BrowserDefaultPileSelectionRequest {
  return toCoreRequest(
    input,
    toWasmNumberKeyedMap(toCorePileOptionsByLoadPoint(input.optionsByLoadPointId)),
  );
}

export function toDesktopDefaultPileSelectionRequest(
  input: DefaultPileSelectionContractInput,
): DesktopDefaultPileSelectionRequest {
  return toCoreRequest(
    input,
    toStringKeyedRecord(toCorePileOptionsByLoadPoint(input.optionsByLoadPointId)),
  );
}

function toCoreRequest<TOptions>(
  input: DefaultPileSelectionContractInput,
  optionsByLoadPoint: TOptions,
): CoreDefaultPileSelectionRequest<TOptions> {
  return {
    groups: loadPointGroupsFromCore(input.groups),
    options_by_load_point: optionsByLoadPoint,
    pile_head_level_m: input.pileHeadLevelM,
    cost_settings: {
      ...input.costSettings,
      items: input.costSettings.items.map((item) => ({ ...item })),
    },
  };
}
