import { useEffect, useRef, useState } from "react";

import { assessLoadPointGroupAssignmentsCore } from "../../core/coreClient.ts";
import type { GroupAssignmentAssessmentInput } from "../../core/loadPointGroupContract.ts";
import {
  createGroupAssignmentAssessmentController,
  type GroupAssignmentAssessmentController,
  type GroupAssignmentAssessmentSnapshot,
} from "./groupAssignmentAssessmentController.ts";

const INITIAL_SNAPSHOT: GroupAssignmentAssessmentSnapshot = {
  conflicts: [],
  conflictsByLoadPointId: new Map(),
  pending: false,
  error: null,
};

export function useGroupAssignmentAssessment(
  input: GroupAssignmentAssessmentInput | null,
): GroupAssignmentAssessmentSnapshot {
  const controllerRef = useRef<GroupAssignmentAssessmentController | null>(null);
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);

  useEffect(() => {
    const controller = createGroupAssignmentAssessmentController(
      assessLoadPointGroupAssignmentsCore,
    );
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
