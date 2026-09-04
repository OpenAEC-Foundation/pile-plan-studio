import type { deriveLoadPointGroupsCore } from "../../core/coreClient.ts";
import type { LoadPointGroup } from "../../core/loadPointGroupContract.ts";
import type { LoadPoint } from "../../core/projectTypes.ts";

export type LoadPointGroupSnapshot = {
  groups: LoadPointGroup[];
  pending: boolean;
  error: Error | null;
};

export type LoadPointGroupController = {
  update(loadPoints: LoadPoint[]): Promise<void>;
  subscribe(listener: (snapshot: LoadPointGroupSnapshot) => void): () => void;
  dispose(): void;
};

export function createLoadPointGroupController(
  deriveGroups: typeof deriveLoadPointGroupsCore,
): LoadPointGroupController {
  let generation = 0;
  let disposed = false;
  let completedGeometrySignature: string | null = null;
  let completedGroups: LoadPointGroup[] = [];
  let activeGeometrySignature: string | null = null;
  let activeUpdate: Promise<void> | null = null;
  let snapshot: LoadPointGroupSnapshot = {
    groups: [],
    pending: false,
    error: null,
  };
  const listeners = new Set<(snapshot: LoadPointGroupSnapshot) => void>();

  return {
    update(loadPoints) {
      if (disposed) return Promise.resolve();
      const geometrySignature = buildLoadPointGeometrySignature(loadPoints);
      if (geometrySignature === completedGeometrySignature) {
        if (activeGeometrySignature && activeGeometrySignature !== geometrySignature) {
          generation += 1;
          activeGeometrySignature = null;
          activeUpdate = null;
          setSnapshot({ groups: cloneGroups(completedGroups), pending: false, error: null });
        }
        return Promise.resolve();
      }
      if (geometrySignature === activeGeometrySignature && activeUpdate) return activeUpdate;

      const requestGeneration = ++generation;
      activeGeometrySignature = geometrySignature;
      setSnapshot({ groups: [], pending: true, error: null });
      const update = deriveGroups(loadPoints)
        .then((groups) => {
          if (disposed || requestGeneration !== generation) return;
          completedGeometrySignature = geometrySignature;
          completedGroups = cloneGroups(groups);
          setSnapshot({
            groups: cloneGroups(completedGroups),
            pending: false,
            error: null,
          });
        })
        .catch((error: unknown) => {
          if (disposed || requestGeneration !== generation) return;
          setSnapshot({
            groups: [],
            pending: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        })
        .finally(() => {
          if (requestGeneration !== generation) return;
          activeGeometrySignature = null;
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
      activeGeometrySignature = null;
      activeUpdate = null;
      listeners.clear();
    },
  };

  function setSnapshot(nextSnapshot: LoadPointGroupSnapshot): void {
    snapshot = nextSnapshot;
    for (const listener of listeners) listener(cloneSnapshot(snapshot));
  }
}

export function buildLoadPointGeometrySignature(loadPoints: LoadPoint[]): string {
  return JSON.stringify(
    loadPoints
      .map(({ id, x_mm, y_mm }) => [id, x_mm, y_mm])
      .sort(([firstId], [secondId]) => firstId - secondId),
  );
}

function cloneSnapshot(snapshot: LoadPointGroupSnapshot): LoadPointGroupSnapshot {
  return {
    groups: cloneGroups(snapshot.groups),
    pending: snapshot.pending,
    error: snapshot.error,
  };
}

function cloneGroups(groups: LoadPointGroup[]): LoadPointGroup[] {
  return groups.map((group) => ({ load_point_ids: [...group.load_point_ids] }));
}
