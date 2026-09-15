import type {
  buildLoadPointTopologyCore,
  buildTipLevelRegionTopologyCore,
} from "../../core/coreClient.ts";
import type {
  LoadPoint,
  PileConfigurationKey,
  PileConfigurationOption,
} from "../../core/projectTypes.ts";
import { pileConfigurationToken } from "../../core/pileConfigurationKey.ts";
import {
  toTipLevelRegionAssignments,
  type LoadPointTopology,
  type TipLevelRegionTopology,
} from "../../core/tipLevelRegionContract.ts";

export type TipLevelRegionTopologyDependencies = {
  buildLoadPointTopology: typeof buildLoadPointTopologyCore;
  buildTopology: typeof buildTipLevelRegionTopologyCore;
};

export type TipLevelRegionTopologyControllerInput = {
  loadPoints: LoadPoint[];
  selectedPileConfigurationsByLoadPoint: Map<number, PileConfigurationKey>;
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
};

export type TipLevelRegionTopologyController = {
  update: (input: TipLevelRegionTopologyControllerInput) => Promise<void>;
  disable: () => void;
  subscribe: (listener: (topology: TipLevelRegionTopology | null) => void) => () => void;
};

export function createTipLevelRegionTopologyController(
  dependencies: TipLevelRegionTopologyDependencies,
): TipLevelRegionTopologyController {
  let generation = 0;
  let completedLoadPointTopologyKey: string | null = null;
  let completedLoadPointTopology: LoadPointTopology | null = null;
  let completedTopologyKey: string | null = null;
  let currentTopology: TipLevelRegionTopology | null = null;
  const listeners = new Set<(topology: TipLevelRegionTopology | null) => void>();

  return {
    async update(input) {
      const requestGeneration = ++generation;
      const loadPointTopologyKey = buildLoadPointTopologyKey(input.loadPoints);
      let loadPointTopology = completedLoadPointTopologyKey === loadPointTopologyKey
        ? completedLoadPointTopology
        : null;

      if (!loadPointTopology) {
        loadPointTopology = await dependencies.buildLoadPointTopology(input.loadPoints);
        if (requestGeneration !== generation) return;
        completedLoadPointTopologyKey = loadPointTopologyKey;
        completedLoadPointTopology = loadPointTopology;
      }

      const selectedAssignments = toTipLevelRegionAssignments(
        input.selectedPileConfigurationsByLoadPoint,
      );
      const topologyKey = buildTopologyKey(
        loadPointTopologyKey,
        input.selectedPileConfigurationsByLoadPoint,
        input.pileOptionsByLoadPointId,
      );
      if (completedTopologyKey === topologyKey && currentTopology) return;

      const topology = await dependencies.buildTopology({
        loadPointTopology,
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

function buildLoadPointTopologyKey(loadPoints: LoadPoint[]): string {
  return JSON.stringify(
    loadPoints
      .map(({ id, x_mm, y_mm }) => [id, x_mm, y_mm])
      .sort(([firstId], [secondId]) => firstId - secondId),
  );
}

function buildTopologyKey(
  loadPointTopologyKey: string,
  selectedPileConfigurationsByLoadPoint: Map<number, PileConfigurationKey>,
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>,
): string {
  const selected = [...selectedPileConfigurationsByLoadPoint]
    .sort(([firstId], [secondId]) => firstId - secondId)
    .map(([loadPointId, configuration]) => [
      loadPointId,
      pileConfigurationToken(configuration),
    ]);
  const options = [...pileOptionsByLoadPointId]
    .sort(([firstId], [secondId]) => firstId - secondId)
    .map(([loadPointId, loadPointOptions]) => [
      loadPointId,
      loadPointOptions.map(({ configuration, isOption }) => [
        pileConfigurationToken(configuration),
        isOption,
      ]),
    ]);
  return JSON.stringify([loadPointTopologyKey, selected, options]);
}
