import { useEffect, useRef, useState } from "react";

import { assessTechnicalAssignmentCore } from "../../core/coreClient.ts";
import type { TechnicalAssignmentContractInput } from "../../core/technicalAssignmentContract.ts";
import {
  createTechnicalAssignmentController,
  type TechnicalAssignmentController,
  type TechnicalAssignmentSnapshot,
} from "./technicalAssignmentController.ts";

const INITIAL_SNAPSHOT: TechnicalAssignmentSnapshot = {
  status: "idle",
  assessment: null,
  issuesByLoadPointId: new Map(),
  error: null,
};

export function useTechnicalAssignment(input: TechnicalAssignmentContractInput | null): TechnicalAssignmentSnapshot {
  const controllerRef = useRef<TechnicalAssignmentController | null>(null);
  const [snapshot, setSnapshot] = useState<TechnicalAssignmentSnapshot>(INITIAL_SNAPSHOT);

  useEffect(() => {
    const controller = createTechnicalAssignmentController(assessTechnicalAssignmentCore);
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setSnapshot);
    void controller.update(input);
    return () => {
      unsubscribe();
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    void controllerRef.current?.update(input);
  }, [input]);

  return snapshot;
}
