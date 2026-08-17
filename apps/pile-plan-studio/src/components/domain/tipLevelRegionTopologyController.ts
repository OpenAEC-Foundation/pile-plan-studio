import type {
  buildSpatialNeighborhoodCore,
  buildTipLevelRegionTopologyCore,
} from "../../core/coreClient.ts";
import type { LoadPoint, PileConfigurationOption } from "../../core/projectTypes.ts";
import {
  parseSpatialPileAssignments,
  type SpatialNeighborhood,
  type TipLevelRegionTopology,
} from "../../core/spatialTopologyContract.ts";

export type SpatialTopologyDependencies = {
  buildNeighborhood: typeof buildSpatialNeighborhoodCore;
  buildTopology: typeof buildTipLevelRegionTopologyCore;
};

export type TipLevelRegionTopologyControllerInput = {
  loadPoints: LoadPoint[];
  selectedPileOptionKeysByLoadPoint: Map<number, string>;
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
};

export type TipLevelRegionTopologyController = {
  update: (input: TipLevelRegionTopologyControllerInput) => Promise<void>;
  disable: () => void;
  subscribe: (listener: (topology: TipLevelRegionTopology | null) => void) => () => void;
};

export function createTipLevelRegionTopologyController(
  dependencies: SpatialTopologyDependencies,
): TipLevelRegionTopologyController {
  let generation = 0;
  let completedNeighborhoodKey: string | null = null;
  let completedNeighborhood: SpatialNeighborhood | null = null;
  let completedTopologyKey: string | null = null;
  let currentTopology: TipLevelRegionTopology | null = null;
  const listeners = new Set<(topology: TipLevelRegionTopology | null) => void>();

  return {
    async update(input) {
      const requestGeneration = ++generation;
      const neighborhoodKey = buildNeighborhoodKey(input.loadPoints);
      let neighborhood = completedNeighborhoodKey === neighborhoodKey
        ? completedNeighborhood
        : null;

      if (!neighborhood) {
        neighborhood = await dependencies.buildNeighborhood(input.loadPoints);
        if (requestGeneration !== generation) return;
        completedNeighborhoodKey = neighborhoodKey;
        completedNeighborhood = neighborhood;
      }

      const selectedAssignments = parseSpatialPileAssignments(
        input.selectedPileOptionKeysByLoadPoint,
      );
      const topologyKey = buildTopologyKey(
        neighborhoodKey,
        input.selectedPileOptionKeysByLoadPoint,
        input.pileOptionsByLoadPointId,
      );
      if (completedTopologyKey === topologyKey && currentTopology) return;

      const topology = await dependencies.buildTopology({
        neighborhood,
        selectedAssignments,
        optionsByLoadPoint: input.pileOptionsByLoadPointId,
      });
      if (requestGeneration !== generation) return;

      completedTopologyKey = topologyKey;
      currentTopology = topology;
      emit(topology);
    },

    disable() {
      generation += 1;
      completedTopologyKey = null;
      currentTopology = null;
      emit(null);
    },

    subscribe(listener) {
      listeners.add(listener);
      if (currentTopology) listener(currentTopology);
      return () => listeners.delete(listener);
    },
  };

  function emit(topology: TipLevelRegionTopology | null) {
    for (const listener of listeners) listener(topology);
  }
}

function buildNeighborhoodKey(loadPoints: LoadPoint[]): string {
  return JSON.stringify(
    loadPoints
      .map(({ id, x_mm, y_mm }) => [id, x_mm, y_mm])
      .sort(([firstId], [secondId]) => firstId - secondId),
  );
}

function buildTopologyKey(
  neighborhoodKey: string,
  selectedPileOptionKeysByLoadPoint: Map<number, string>,
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>,
): string {
  const selected = [...selectedPileOptionKeysByLoadPoint]
    .sort(([firstId], [secondId]) => firstId - secondId);
  const options = [...pileOptionsByLoadPointId]
    .sort(([firstId], [secondId]) => firstId - secondId)
    .map(([loadPointId, loadPointOptions]) => [
      loadPointId,
      loadPointOptions.map(({ pile_size_mm, pile_tip_level_m, isOption }) => [
        pile_size_mm,
        pile_tip_level_m,
        isOption,
      ]),
    ]);
  return JSON.stringify([neighborhoodKey, selected, options]);
}
