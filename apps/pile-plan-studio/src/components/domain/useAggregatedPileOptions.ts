import { useEffect, useRef, useState } from "react";

import { aggregatePileOptionsCore } from "../../core/coreClient.ts";
import type { PileConfigurationOption } from "../../core/projectTypes.ts";
import {
  createPileOptionAggregationController,
  type PileOptionAggregationController,
  type PileOptionAggregationState,
} from "./pileOptionAggregationController.ts";

type UseAggregatedPileOptionsInput = {
  selectedLoadPointIds: number[];
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
};

export function useAggregatedPileOptions({
  selectedLoadPointIds,
  pileOptionsByLoadPointId,
}: UseAggregatedPileOptionsInput): PileOptionAggregationState {
  const controllerRef = useRef<PileOptionAggregationController | null>(null);
  controllerRef.current ??= createPileOptionAggregationController(aggregatePileOptionsCore);
  const controller = controllerRef.current;
  const [state, setState] = useState<PileOptionAggregationState>(() => controller.getState());
  const selectionKey = selectedLoadPointIds.join("|");

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    return () => {
      unsubscribe();
      controller.clear();
    };
  }, [controller]);

  useEffect(() => {
    void controller.update({ selectedLoadPointIds, pileOptionsByLoadPointId });
  }, [controller, selectionKey, pileOptionsByLoadPointId]);

  return state;
}
