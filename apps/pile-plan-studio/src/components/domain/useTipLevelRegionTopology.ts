import { useEffect, useRef, useState } from "react";

import {
  buildLoadPointTopologyCore,
  buildTipLevelRegionTopologyCore,
} from "../../core/coreClient.ts";
import type {
  LoadPoint,
  PileConfigurationKey,
  PileConfigurationOption,
} from "../../core/projectTypes.ts";
import type { TipLevelRegionTopology } from "../../core/tipLevelRegionContract.ts";
import {
  createTipLevelRegionTopologyController,
  type TipLevelRegionTopologyController,
} from "./tipLevelRegionTopologyController.ts";

type UseTipLevelRegionTopologyInput = {
  enabled: boolean;
  loadPoints: LoadPoint[];
  selectedPileConfigurationsByLoadPoint: Map<number, PileConfigurationKey>;
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
};

export type TipLevelRegionTopologyStatus = "idle" | "loading" | "ready" | "error";

export type TipLevelRegionTopologyResult = {
  topology: TipLevelRegionTopology | null;
  status: TipLevelRegionTopologyStatus;
};

export function useTipLevelRegionTopology({
  enabled,
  loadPoints,
  selectedPileConfigurationsByLoadPoint,
  pileOptionsByLoadPointId,
}: UseTipLevelRegionTopologyInput): TipLevelRegionTopologyResult {
  const controllerRef = useRef<TipLevelRegionTopologyController | null>(null);
  const [topology, setTopology] = useState<TipLevelRegionTopology | null>(null);
  const [status, setStatus] = useState<TipLevelRegionTopologyStatus>("idle");

  controllerRef.current ??= createTipLevelRegionTopologyController({
    buildLoadPointTopology: buildLoadPointTopologyCore,
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
      setStatus("idle");
      return;
    }

    let current = true;
    setStatus("loading");
    void controller.update({
      loadPoints,
      selectedPileConfigurationsByLoadPoint,
      pileOptionsByLoadPointId,
    }).then(() => {
      if (current) setStatus("ready");
    }).catch((error: unknown) => {
      console.error("Failed to build tip-level region topology", error);
      if (current) {
        controller.disable();
        setStatus("error");
      }
    });
    return () => { current = false; };
  }, [
    controller,
    enabled,
    loadPoints,
    selectedPileConfigurationsByLoadPoint,
    pileOptionsByLoadPointId,
  ]);

  return { topology, status };
}
