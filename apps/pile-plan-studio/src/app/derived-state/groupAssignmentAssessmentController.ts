import type { assessLoadPointGroupAssignmentsCore } from "../../core/coreClient.ts";
import type {
  GroupAssignmentAssessmentInput,
  GroupAssignmentConflict,
} from "../../core/loadPointGroupContract.ts";

export type GroupAssignmentAssessmentSnapshot = {
  conflicts: GroupAssignmentConflict[];
  conflictsByLoadPointId: Map<number, GroupAssignmentConflict>;
  pending: boolean;
  error: Error | null;
};

export type GroupAssignmentAssessmentController = {
  update(input: GroupAssignmentAssessmentInput | null): Promise<void>;
  subscribe(listener: (snapshot: GroupAssignmentAssessmentSnapshot) => void): () => void;
  dispose(): void;
};

const EMPTY_SNAPSHOT: GroupAssignmentAssessmentSnapshot = {
  conflicts: [],
  conflictsByLoadPointId: new Map(),
  pending: false,
  error: null,
};

export function createGroupAssignmentAssessmentController(
  assess: typeof assessLoadPointGroupAssignmentsCore,
): GroupAssignmentAssessmentController {
  let generation = 0;
  let disposed = false;
  let completedSignature: string | null = null;
  let completedConflicts: GroupAssignmentConflict[] = [];
  let activeSignature: string | null = null;
  let activeUpdate: Promise<void> | null = null;
  let snapshot = cloneSnapshot(EMPTY_SNAPSHOT);
  const listeners = new Set<(snapshot: GroupAssignmentAssessmentSnapshot) => void>();

  return {
    update(input) {
      if (disposed) return Promise.resolve();
      if (input === null) {
        generation += 1;
        completedSignature = null;
        completedConflicts = [];
        activeSignature = null;
        activeUpdate = null;
        publish(EMPTY_SNAPSHOT);
        return Promise.resolve();
      }

      const signature = buildGroupAssignmentAssessmentSignature(input);
      if (signature === completedSignature) return Promise.resolve();
      if (signature === activeSignature && activeUpdate) return activeUpdate;

      const requestGeneration = ++generation;
      activeSignature = signature;
      publish(snapshotFor(completedConflicts, true, null));
      const update = assess(input)
        .then((conflicts) => {
          if (disposed || requestGeneration !== generation) return;
          completedSignature = signature;
          completedConflicts = cloneConflicts(conflicts);
          publish(snapshotFor(completedConflicts, false, null));
        })
        .catch((error: unknown) => {
          if (disposed || requestGeneration !== generation) return;
          publish(snapshotFor(
            completedConflicts,
            false,
            error instanceof Error ? error : new Error(String(error)),
          ));
        })
        .finally(() => {
          if (requestGeneration !== generation) return;
          activeSignature = null;
          activeUpdate = null;
        });
      activeUpdate = update;
      return update;
    },

    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      listener(cloneSnapshot(snapshot));
      return () => listeners.delete(listener);
    },

    dispose() {
      disposed = true;
      generation += 1;
      listeners.clear();
    },
  };

  function publish(next: GroupAssignmentAssessmentSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener(cloneSnapshot(snapshot)));
  }
}

export function buildGroupAssignmentAssessmentSignature(
  input: GroupAssignmentAssessmentInput,
): string {
  return JSON.stringify({
    groups: input.groups.map((group) => ({
      ids: [...group.load_point_ids].sort((left, right) => left - right),
      origin: group.origin ?? "automatic",
    })).sort((left, right) => left.ids[0] - right.ids[0]),
    assignments: [...input.assignments].map(([id, configuration]) => [
      id,
      configuration.pile_size_mm,
      configuration.pile_tip_level_mm,
    ]).sort(([left], [right]) => left - right),
    locks: [...new Set(input.lockedLoadPointIds)].sort((left, right) => left - right),
  });
}

function snapshotFor(
  conflicts: GroupAssignmentConflict[],
  pending: boolean,
  error: Error | null,
): GroupAssignmentAssessmentSnapshot {
  const cloned = cloneConflicts(conflicts);
  const conflictsByLoadPointId = new Map<number, GroupAssignmentConflict>();
  cloned.forEach((conflict) => {
    conflict.load_point_ids.forEach((id) => conflictsByLoadPointId.set(id, conflict));
  });
  return { conflicts: cloned, conflictsByLoadPointId, pending, error };
}

function cloneConflicts(conflicts: GroupAssignmentConflict[]): GroupAssignmentConflict[] {
  return conflicts.map((conflict) => ({
    ...conflict,
    load_point_ids: [...conflict.load_point_ids],
    blocking_locked_load_point_ids: [...conflict.blocking_locked_load_point_ids],
  }));
}

function cloneSnapshot(
  snapshot: GroupAssignmentAssessmentSnapshot,
): GroupAssignmentAssessmentSnapshot {
  return snapshotFor(snapshot.conflicts, snapshot.pending, snapshot.error);
}
