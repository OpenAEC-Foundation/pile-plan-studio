import { useEffect, useMemo, useRef, useState } from "react";

import { assessLoadPointGroupAssignmentsCore } from "../../core/coreClient.ts";
import type { GroupAssignmentAssessmentInput } from "../../core/loadPointGroupContract.ts";
import {
  createGroupAssignmentAssessmentController,
  buildGroupAssignmentAssessmentSignature,
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
  const signature=useMemo(()=>input===null?null:buildGroupAssignmentAssessmentSignature(input),[input]);
  const requestedSignature=useRef<string|null|undefined>(undefined);
  const [rendered,setRendered]=useState<{signature:string|null|undefined;snapshot:GroupAssignmentAssessmentSnapshot}>({signature:undefined,snapshot:INITIAL_SNAPSHOT});

  useEffect(() => {
    const controller = createGroupAssignmentAssessmentController(
      assessLoadPointGroupAssignmentsCore,
    );
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(snapshot=>setRendered({signature:requestedSignature.current,snapshot}));
    return () => {
      unsubscribe();
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    requestedSignature.current=signature;
    void controllerRef.current?.update(input);
  }, [input,signature]);

  if(signature===null)return INITIAL_SNAPSHOT;
  if(rendered.signature!==signature||rendered.snapshot.pending)return {...INITIAL_SNAPSHOT,pending:true};
  if(rendered.snapshot.error)return {...INITIAL_SNAPSHOT,error:rendered.snapshot.error};
  return rendered.snapshot;
}
