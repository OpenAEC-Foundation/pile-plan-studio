import { useEffect, useRef, useState } from "react";

import { deriveLoadPointGroupsCore } from "../../core/coreClient.ts";
import type { LoadPoint, LoadPointGroupingSettings } from "../../core/projectTypes.ts";
import {
  createLoadPointGroupController,
  type LoadPointGroupController,
  type LoadPointGroupSnapshot,
} from "./loadPointGroupController.ts";

const INITIAL_SNAPSHOT: LoadPointGroupSnapshot = {
  groups: [],
  pending: false,
  error: null,
};

export function useLoadPointGroups(
  loadPoints: LoadPoint[],
  settings: LoadPointGroupingSettings,
): LoadPointGroupSnapshot {
  const controllerRef = useRef<LoadPointGroupController | null>(null);
  const [snapshot, setSnapshot] = useState<LoadPointGroupSnapshot>(INITIAL_SNAPSHOT);

  useEffect(() => {
    const controller = createLoadPointGroupController(deriveLoadPointGroupsCore);
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setSnapshot);
    void controller.update(loadPoints, settings);

    return () => {
      unsubscribe();
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    void controllerRef.current?.update(loadPoints, settings);
  }, [loadPoints, settings]);

  return snapshot;
}
