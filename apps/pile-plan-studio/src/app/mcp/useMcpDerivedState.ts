import { useMemo, useRef } from "react";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { buildLoadPointGroupSignature, type LoadPointGroupSnapshot } from "../derived-state/loadPointGroupController.ts";
import { buildTechnicalAssignmentSignature, type TechnicalAssignmentSnapshot } from "../derived-state/technicalAssignmentController.ts";
import { buildGroupAssignmentAssessmentSignature, type GroupAssignmentAssessmentSnapshot } from "../derived-state/groupAssignmentAssessmentController.ts";
import { createDerivedSnapshotGate, type DerivedSnapshotGate } from "./derivedSnapshotGate.ts";

function useSnapshotPending<T>(signature: string, snapshot: T): boolean {
  const gate = useRef<DerivedSnapshotGate<T> | null>(null);
  gate.current ??= createDerivedSnapshotGate(signature, snapshot);
  return gate.current.observe(signature, snapshot);
}

/** MCP must report pending until derived snapshots match the current project inputs. */
export function useMcpDerivedState(
  state: ProjectState,
  groups: LoadPointGroupSnapshot,
  technical: TechnicalAssignmentSnapshot,
  conflicts: GroupAssignmentAssessmentSnapshot,
  technicalInput: Parameters<typeof buildTechnicalAssignmentSignature>[0] | null,
  conflictInput: Parameters<typeof buildGroupAssignmentAssessmentSignature>[0] | null,
) {
  const groupsSignature = useMemo(() => buildLoadPointGroupSignature(
    state.loadPoints, state.loadPointGroupingSettings), [state.loadPoints, state.loadPointGroupingSettings]);
  const technicalSignature = useMemo(() => technicalInput
    ? buildTechnicalAssignmentSignature(technicalInput) : "unavailable", [technicalInput]);
  const conflictsSignature = useMemo(() => conflictInput
    ? buildGroupAssignmentAssessmentSignature(conflictInput) : "unavailable", [conflictInput]);
  const groupsPending = useSnapshotPending(groupsSignature, groups);
  const technicalPending = useSnapshotPending(technicalSignature, technical);
  const conflictsPending = useSnapshotPending(conflictsSignature, conflicts);
  return {
    groups: groupsPending ? { ...groups, pending: true } : groups,
    technicalAssignment: technicalPending ? { ...technical, status: "loading" as const } : technical,
    groupAssignmentAssessment: conflictsPending ? { ...conflicts, pending: true } : conflicts,
  };
}
