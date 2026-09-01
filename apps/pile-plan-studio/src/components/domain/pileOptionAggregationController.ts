import type {
  AggregatedPileConfiguration,
} from "../../core/pileOptionAggregationContract.ts";
import type { PileConfigurationOption } from "../../core/projectTypes.ts";
import { pileConfigurationToken } from "../../core/pileConfigurationKey.ts";

export type PileOptionAggregationControllerInput = {
  selectedLoadPointIds: number[];
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
};

export type PileOptionAggregationState =
  | { status: "idle"; result: null; error: null }
  | { status: "loading"; result: null; error: null }
  | { status: "ready"; result: AggregatedPileConfiguration[]; error: null }
  | { status: "error"; result: null; error: string };

export type AggregatePileOptions = (
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>,
) => Promise<AggregatedPileConfiguration[]>;

export type PileOptionAggregationController = {
  update: (input: PileOptionAggregationControllerInput) => Promise<void>;
  clear: () => void;
  getState: () => PileOptionAggregationState;
  subscribe: (listener: (state: PileOptionAggregationState) => void) => () => void;
};

const IDLE_STATE: PileOptionAggregationState = {
  status: "idle",
  result: null,
  error: null,
};

export function createPileOptionAggregationController(
  aggregatePileOptions: AggregatePileOptions,
): PileOptionAggregationController {
  let generation = 0;
  let currentKey: string | null = null;
  let currentState = IDLE_STATE;
  const completedResults = new Map<string, AggregatedPileConfiguration[]>();
  const listeners = new Set<(state: PileOptionAggregationState) => void>();

  return {
    async update(input) {
      const selectedLoadPointIds = [...new Set(input.selectedLoadPointIds)].sort((a, b) => a - b);
      if (selectedLoadPointIds.length < 2) {
        clear();
        return;
      }

      const requestGeneration = ++generation;
      const key = buildAggregationKey(selectedLoadPointIds, input.pileOptionsByLoadPointId);
      currentKey = key;
      const completed = completedResults.get(key);
      if (completed) {
        setState({ status: "ready", result: completed, error: null });
        return;
      }

      setState({ status: "loading", result: null, error: null });
      const selectedOptions = new Map(
        selectedLoadPointIds.map((loadPointId) => [
          loadPointId,
          input.pileOptionsByLoadPointId.get(loadPointId) ?? [],
        ]),
      );

      try {
        const result = await aggregatePileOptions(selectedOptions);
        if (requestGeneration !== generation || currentKey !== key) return;
        completedResults.set(key, result);
        setState({ status: "ready", result, error: null });
      } catch (error: unknown) {
        if (requestGeneration !== generation || currentKey !== key) return;
        setState({
          status: "error",
          result: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    clear,

    getState() {
      return currentState;
    },

    subscribe(listener) {
      listeners.add(listener);
      listener(currentState);
      return () => listeners.delete(listener);
    },
  };

  function clear() {
    generation += 1;
    currentKey = null;
    if (currentState.status !== "idle") setState(IDLE_STATE);
  }

  function setState(state: PileOptionAggregationState) {
    currentState = state;
    for (const listener of listeners) listener(state);
  }
}

function buildAggregationKey(
  selectedLoadPointIds: number[],
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>,
): string {
  return JSON.stringify(selectedLoadPointIds.map((loadPointId) => [
    loadPointId,
    [...(pileOptionsByLoadPointId.get(loadPointId) ?? [])]
      .map((option) => [
        pileConfigurationToken(option.configuration),
        option.pile_size_mm,
        option.pile_tip_level_m,
        option.isOption,
        option.governing_cpt_id,
        option.governing_frd_kn,
        option.utilization,
        [...option.missing_cpt_ids].sort((a, b) => a - b),
      ])
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  ]));
}
