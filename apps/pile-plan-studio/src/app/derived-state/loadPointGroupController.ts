import type { deriveLoadPointGroupsCore } from "../../core/coreClient.ts";
import type {
  DerivedLoadPointGroups,
  LoadPointGroup,
} from "../../core/loadPointGroupContract.ts";
import type { LoadPointTopology } from "../../core/tipLevelRegionContract.ts";
import type { LoadPoint, LoadPointGroupingSettings } from "../../core/projectTypes.ts";

export type LoadPointGroupSnapshot = {
  groups: LoadPointGroup[];
  topology: LoadPointTopology | null;
  pending: boolean;
  error: Error | null;
};

export type LoadPointGroupController = {
  update(loadPoints: LoadPoint[], settings: LoadPointGroupingSettings): Promise<void>;
  subscribe(listener: (snapshot: LoadPointGroupSnapshot) => void): () => void;
  dispose(): void;
};

export function createLoadPointGroupController(
  deriveGroups: typeof deriveLoadPointGroupsCore,
): LoadPointGroupController {
  let generation = 0;
  let disposed = false;
  let completedGeometrySignature: string | null = null;
  let completedLoadPointIdSignature: string | null = null;
  let completedGrouping: DerivedLoadPointGroups | null = null;
  let activeGeometrySignature: string | null = null;
  let activeUpdate: Promise<void> | null = null;
  let snapshot: LoadPointGroupSnapshot = {
    groups: [],
    topology: null,
    pending: false,
    error: null,
  };
  const listeners = new Set<(snapshot: LoadPointGroupSnapshot) => void>();

  return {
    update(loadPoints, settings) {
      if (disposed) return Promise.resolve();
      const geometrySignature = buildLoadPointGroupSignature(loadPoints, settings);
      if (geometrySignature === completedGeometrySignature) {
        if (activeGeometrySignature && activeGeometrySignature !== geometrySignature) {
          generation += 1;
          activeGeometrySignature = null;
          activeUpdate = null;
          setSnapshot(snapshotFromGrouping(completedGrouping, false, null));
        }
        return Promise.resolve();
      }
      if (geometrySignature === activeGeometrySignature && activeUpdate) return activeUpdate;

      const requestGeneration = ++generation;
      const loadPointIdSignature = buildLoadPointIdSignature(loadPoints);
      const retainedGrouping = loadPointIdSignature === completedLoadPointIdSignature
        ? completedGrouping
        : null;
      activeGeometrySignature = geometrySignature;
      setSnapshot(snapshotFromGrouping(retainedGrouping, true, null));
      const update = deriveGroups(loadPoints, settings)
        .then((grouping) => {
          if (disposed || requestGeneration !== generation) return;
          const normalized = Array.isArray(grouping)
            ? { groups: grouping, topology: emptyTopology() }
            : grouping;
          completedGeometrySignature = geometrySignature;
          completedLoadPointIdSignature = loadPointIdSignature;
          completedGrouping = cloneGrouping(normalized);
          setSnapshot(snapshotFromGrouping(completedGrouping, false, null));
        })
        .catch((error: unknown) => {
          if (disposed || requestGeneration !== generation) return;
          setSnapshot(snapshotFromGrouping(
            retainedGrouping,
            false,
            error instanceof Error ? error : new Error(String(error)),
          ));
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

function buildLoadPointIdSignature(loadPoints: LoadPoint[]): string {
  return JSON.stringify(loadPoints.map(({ id }) => id).sort((left, right) => left - right));
}

export function buildLoadPointGroupSignature(
  loadPoints: LoadPoint[],
  settings: LoadPointGroupingSettings,
): string {
  return JSON.stringify({
    loadPoints: loadPoints
      .map(({ id, x_mm, y_mm }) => [id, x_mm, y_mm])
      .sort(([firstId], [secondId]) => firstId - secondId),
    settings,
  });
}

function cloneSnapshot(snapshot: LoadPointGroupSnapshot): LoadPointGroupSnapshot {
  return {
    groups: cloneGroups(snapshot.groups),
    topology: snapshot.topology ? cloneTopology(snapshot.topology) : null,
    pending: snapshot.pending,
    error: snapshot.error,
  };
}

function cloneGroups(groups: LoadPointGroup[]): LoadPointGroup[] {
  return groups.map((group) => ({
    load_point_ids: [...group.load_point_ids],
    ...(group.origin ? { origin: group.origin } : {}),
  }));
}

function cloneGrouping(grouping: DerivedLoadPointGroups): DerivedLoadPointGroups {
  return {
    groups: cloneGroups(grouping.groups),
    topology: cloneTopology(grouping.topology),
  };
}

function cloneTopology(topology: LoadPointTopology): LoadPointTopology {
  return {
    load_point_ids: [...topology.load_point_ids],
    edges: topology.edges.map((edge) => ({ ...edge })),
    faces: topology.faces.map((face) => ({
      boundary_load_point_ids: [...face.boundary_load_point_ids],
    })),
  };
}

function emptyTopology(): LoadPointTopology {
  return { load_point_ids: [], edges: [], faces: [] };
}

function snapshotFromGrouping(
  grouping: DerivedLoadPointGroups | null,
  pending: boolean,
  error: Error | null,
): LoadPointGroupSnapshot {
  return {
    groups: grouping ? cloneGroups(grouping.groups) : [],
    topology: grouping ? cloneTopology(grouping.topology) : null,
    pending,
    error,
  };
}
