import type { assessTechnicalAssignmentCore } from "../../core/coreClient.ts";
import type {
  TechnicalAssignmentAssessment,
  TechnicalAssignmentContractInput,
  TechnicalAssignmentIssue,
} from "../../core/technicalAssignmentContract.ts";

export type TechnicalAssignmentSnapshot = {
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  assessment: TechnicalAssignmentAssessment | null;
  issuesByLoadPointId: Map<number, TechnicalAssignmentIssue>;
  error: Error | null;
};

export type TechnicalAssignmentController = {
  getState(): TechnicalAssignmentSnapshot;
  update(input: TechnicalAssignmentContractInput | null): Promise<void>;
  subscribe(listener: (snapshot: TechnicalAssignmentSnapshot) => void): () => void;
  dispose(): void;
};

const IDLE_SNAPSHOT: TechnicalAssignmentSnapshot = {
  status: "idle",
  assessment: null,
  issuesByLoadPointId: new Map(),
  error: null,
};

export function createTechnicalAssignmentController(
  assess: typeof assessTechnicalAssignmentCore,
): TechnicalAssignmentController {
  let generation = 0;
  let disposed = false;
  let completedSignature: string | null = null;
  let completedSnapshot: TechnicalAssignmentSnapshot | null = null;
  let activeSignature: string | null = null;
  let activeUpdate: Promise<void> | null = null;
  let snapshot = cloneSnapshot(IDLE_SNAPSHOT);
  const listeners = new Set<(snapshot: TechnicalAssignmentSnapshot) => void>();

  return {
    getState: () => cloneSnapshot(snapshot),

    update(input) {
      if (disposed) return Promise.resolve();
      if (input === null) {
        generation += 1;
        activeSignature = null;
        activeUpdate = null;
        publish(IDLE_SNAPSHOT);
        return Promise.resolve();
      }
      const signature = buildTechnicalAssignmentSignature(input);
      if (signature === completedSignature && completedSnapshot) {
        if (activeSignature && activeSignature !== signature) {
          generation += 1;
          activeSignature = null;
          activeUpdate = null;
          publish(completedSnapshot);
        }
        return Promise.resolve();
      }
      if (signature === activeSignature && activeUpdate) return activeUpdate;

      const requestGeneration = ++generation;
      activeSignature = signature;
      publish({ status: "loading", assessment: null, issuesByLoadPointId: new Map(), error: null });
      const update = assess(input)
        .then((assessment) => {
          if (disposed || requestGeneration !== generation) return;
          const nextSnapshot = snapshotFromAssessment(assessment);
          completedSignature = signature;
          completedSnapshot = nextSnapshot;
          publish(nextSnapshot);
        })
        .catch((error: unknown) => {
          if (disposed || requestGeneration !== generation) return;
          publish({
            status: "error",
            assessment: null,
            issuesByLoadPointId: new Map(),
            error: error instanceof Error ? error : new Error(String(error)),
          });
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
      activeSignature = null;
      activeUpdate = null;
      listeners.clear();
    },
  };

  function publish(nextSnapshot: TechnicalAssignmentSnapshot): void {
    snapshot = cloneSnapshot(nextSnapshot);
    for (const listener of listeners) listener(cloneSnapshot(snapshot));
  }
}

export function buildTechnicalAssignmentSignature(input: TechnicalAssignmentContractInput): string {
  const groups = input.groups
    .map(({ load_point_ids }) => [...new Set(load_point_ids)].sort((left, right) => left - right))
    .sort(compareNumberArrays);
  const options = [...input.optionsByLoadPoint]
    .sort(([left], [right]) => left - right)
    .map(([loadPointId, pileOptions]) => [
      loadPointId,
      pileOptions
        .map((pileOption) => ({
          pileSizeMm: pileOption.configuration.pile_size_mm,
          pileTipLevelMm: pileOption.configuration.pile_tip_level_mm,
          status: pileOption.technicalStatus,
          isOption: pileOption.isOption,
          utilization: pileOption.utilization,
          missingCptIds: [...new Set(pileOption.missing_cpt_ids)].sort((left, right) => left - right),
        }))
        .sort((left, right) => left.pileSizeMm - right.pileSizeMm
          || left.pileTipLevelMm - right.pileTipLevelMm),
    ]);
  return JSON.stringify({ groups, options });
}

function snapshotFromAssessment(assessment: TechnicalAssignmentAssessment): TechnicalAssignmentSnapshot {
  return {
    status: assessment.availability === "available" ? "ready" : "unavailable",
    assessment,
    issuesByLoadPointId: new Map(assessment.issues.map((issue) => [issue.load_point_id, issue])),
    error: null,
  };
}

function cloneSnapshot(snapshot: TechnicalAssignmentSnapshot): TechnicalAssignmentSnapshot {
  const assessment = snapshot.assessment ? {
    availability: snapshot.assessment.availability,
    issues: snapshot.assessment.issues.map(cloneIssue),
  } : null;
  return {
    status: snapshot.status,
    assessment,
    issuesByLoadPointId: new Map(
      [...snapshot.issuesByLoadPointId].map(([id, issue]) => [id, cloneIssue(issue)]),
    ),
    error: snapshot.error,
  };
}

function cloneIssue(issue: TechnicalAssignmentIssue): TechnicalAssignmentIssue {
  return {
    ...issue,
    group_load_point_ids: [...issue.group_load_point_ids],
    blocking_load_point_ids: [...issue.blocking_load_point_ids],
    missing_cpt_ids: [...issue.missing_cpt_ids],
  };
}

function compareNumberArrays(left: number[], right: number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}
