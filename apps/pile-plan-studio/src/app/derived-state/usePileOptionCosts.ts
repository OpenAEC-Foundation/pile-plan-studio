import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { calculatePileOptionCosts, type PileOptionCostInput } from "./pileOptionCosts.ts";

export function usePileOptionCosts(
  input: PileOptionCostInput, setProjectState: Dispatch<SetStateAction<ProjectState>>,
): void {
  const { pileCostSettings, pileHeadLevelM, pileOptionsByLoadPointId } = input;
  useEffect(() => {
    let cancelled = false;
    calculatePileOptionCosts({ pileCostSettings, pileHeadLevelM, pileOptionsByLoadPointId })
      .then((costs) => {
        if (!cancelled) setProjectState((current) => ({ ...current, pileCostByOptionKey: costs }));
      }).catch((error: unknown) => {
        console.error("Failed to calculate pile costs", error);
      });
    return () => { cancelled = true; };
  }, [pileCostSettings, pileHeadLevelM, pileOptionsByLoadPointId, setProjectState]);
}
