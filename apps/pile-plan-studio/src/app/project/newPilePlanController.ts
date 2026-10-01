import type { chooseDefaultPileOptionsCore } from "../../core/coreClient.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { activationFromConfigurations } from "../../domain/pile-plans/pilePlanActivation.ts";
import { createPilePlan, type PilePlanLanguage } from "../../domain/pile-plans/pilePlanManagement.ts";
import { getAvailablePileConfigurationCatalog } from "../../domain/pile-plans/optimization/optimizationCandidates.ts";

export type NewPilePlanSnapshot = {
  state: ProjectState;
  groups: Parameters<typeof chooseDefaultPileOptionsCore>[0]["groups"];
  options: ProjectState["pileOptionsByLoadPointId"];
  ready: boolean;
};
export type NewPilePlanDependencies = {
  snapshot: () => NewPilePlanSnapshot;
  language: () => PilePlanLanguage;
  choose: typeof chooseDefaultPileOptionsCore;
  commit: (update: (state: ProjectState) => ProjectState) => void;
  setPending: (pending: boolean) => void;
  failed: (error: unknown) => void;
};

export function createNewPilePlanController(dependencies: NewPilePlanDependencies) {
  let pending = false, generation = 0;
  return {
    invalidate() {
      generation++;
      pending = false;
      dependencies.setPending(false);
    },
    async create(): Promise<void> {
      if (pending) return;
      const { state: captured, groups, options, ready } = dependencies.snapshot();
      if (!ready || captured.analysisError !== null || options.size !== captured.loadPoints.length) return;
      const request = ++generation;
      const catalog = getAvailablePileConfigurationCatalog(captured.pileOptionsByLoadPointId);
      function isCurrent(current: ProjectState) {
        return request === generation
          && current.analysisRequest === captured.analysisRequest
          && current.pileOptionsByLoadPointId === captured.pileOptionsByLoadPointId
          && current.cptSelectionEditDraft === captured.cptSelectionEditDraft
          && current.cptSelectionPreview === captured.cptSelectionPreview
          && dependencies.snapshot().groups === groups
          && current.pileCostSettings === captured.pileCostSettings
          && current.pileHeadLevelM === captured.pileHeadLevelM
          && current.activePilePlanId === captured.activePilePlanId;
      }
      pending = true;
      dependencies.setPending(true);
      try {
        const choices = options.size === 0 ? new Map() : await dependencies.choose({
          groups, optionsByLoadPointId: options,
          pileHeadLevelM: captured.pileHeadLevelM ?? 0, costSettings: captured.pileCostSettings,
        });
        if (!isCurrent(dependencies.snapshot().state)) return;
        dependencies.commit(current => !isCurrent(current) ? current : ({
          ...current,
          ...createPilePlan({ ...current, choices, activation: activationFromConfigurations(catalog),
            kind: "variant", language: dependencies.language() }),
        }));
      } catch (error) {
        if (request === generation) dependencies.failed(error);
      } finally {
        if (request === generation) {
          pending = false;
          dependencies.setPending(false);
        }
      }
    },
  };
}
