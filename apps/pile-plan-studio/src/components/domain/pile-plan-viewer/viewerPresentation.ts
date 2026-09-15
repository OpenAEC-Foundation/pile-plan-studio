import type { ProjectState } from "../../../domain/projectState.ts";
export function getSelectedPileOption(
  state: ProjectState,
  loadPointId: number,
  pileOptionsByLoadPointId: ProjectState["pileOptionsByLoadPointId"],
) {
  const configuration = state.selectedPileConfigurationsByLoadPoint.get(loadPointId);
  if (!configuration) {
    return null;
  }

  return pileOptionsByLoadPointId.get(loadPointId)?.find((option) => (
    option.configuration.pile_size_mm === configuration.pile_size_mm
      && option.configuration.pile_tip_level_mm === configuration.pile_tip_level_mm
  )) ?? {
    configuration: { ...configuration },
    pile_size_mm: configuration.pile_size_mm,
    pile_tip_level_m: configuration.pile_tip_level_mm / 1000,
    isOption: false,
    governing_cpt_id: null,
    governing_frd_kn: null,
    utilization: null,
    missing_cpt_ids: [0],
    technicalStatus: "missing_capacity_data" as const,
  };
}
