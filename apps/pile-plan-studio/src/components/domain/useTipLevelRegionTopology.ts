import { useEffect, useRef, useState } from "react";

import {
  buildSpatialNeighborhoodCore,
  buildTipLevelRegionTopologyCore,
} from "../../core/coreClient.ts";
import type { LoadPoint, PileConfigurationOption } from "../../core/projectTypes.ts";
import type { TipLevelRegionTopology } from "../../core/spatialTopologyContract.ts";
import {
  createTipLevelRegionTopologyController,
  type TipLevelRegionTopologyController,
} from "./tipLevelRegionTopologyController.ts";

type UseTipLevelRegionTopologyInput = {
  enabled: boolean;
  loadPoints: LoadPoint[];
  selectedPileOptionKeysByLoadPoint: Map<number, string>;
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
};

export function useTipLevelRegionTopology({
  enabled,
  loadPoints,
  selectedPileOptionKeysByLoadPoint,
  pileOptionsByLoadPointId,
}: UseTipLevelRegionTopologyInput): TipLevelRegionTopology | null {
  const controllerRef = useRef<TipLevelRegionTopologyController | null>(null);
  const [topology, setTopology] = useState<TipLevelRegionTopology | null>(null);

  controllerRef.current ??= createTipLevelRegionTopologyController({
    buildNeighborhood: buildSpatialNeighborhoodCore,
    buildTopology: buildTipLevelRegionTopologyCore,
  });
  const controller = controllerRef.current;

  useEffect(() => {
    const unsubscribe = controller.subscribe(setTopology);
    return () => {
      unsubscribe();
      controller.disable();
    };
  }, [controller]);

  useEffect(() => {
    if (!enabled) {
      controller.disable();
      return;
    }

    void controller.update({
      loadPoints,
      selectedPileOptionKeysByLoadPoint,
      pileOptionsByLoadPointId,
    }).catch((error: unknown) => {
      console.error("Failed to build tip-level region topology", error);
    });
  }, [
    controller,
    enabled,
    loadPoints,
    selectedPileOptionKeysByLoadPoint,
    pileOptionsByLoadPointId,
  ]);

  return topology;
}
