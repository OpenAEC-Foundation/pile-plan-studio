import { useEffect, useRef, useState } from "react";

import { assessTechnicalAssignmentCore } from "../../core/coreClient.ts";
import type { TechnicalAssignmentContractInput } from "../../core/technicalAssignmentContract.ts";
import {
  buildTechnicalAssignmentSignature,
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

const LOADING_SNAPSHOT: TechnicalAssignmentSnapshot = {
  status: "loading",
  assessment: null,
  issuesByLoadPointId: new Map(),
  error: null,
};

export function useTechnicalAssignment(input: TechnicalAssignmentContractInput | null): TechnicalAssignmentSnapshot {
  const controllerRef = useRef<TechnicalAssignmentController | null>(null);
  const requestedSignatureRef = useRef<string | null | undefined>(undefined);
  const inputSignature = input === null ? null : buildTechnicalAssignmentSignature(input);
  const [rendered, setRendered] = useState<{
    inputSignature: string | null | undefined;
    snapshot: TechnicalAssignmentSnapshot;
  }>({ inputSignature: undefined, snapshot: INITIAL_SNAPSHOT });

  useEffect(() => {
    const controller = createTechnicalAssignmentController(assessTechnicalAssignmentCore);
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe((snapshot) => {
      setRendered({ inputSignature: requestedSignatureRef.current, snapshot });
    });
    return () => {
      unsubscribe();
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    requestedSignatureRef.current = inputSignature;
    const update = controller.update(input);
    setRendered({ inputSignature, snapshot: controller.getState() });
    void update;
  }, [input, inputSignature]);

  if (rendered.inputSignature !== inputSignature) {
    return inputSignature === null ? INITIAL_SNAPSHOT : LOADING_SNAPSHOT;
  }
  return rendered.snapshot;
}
