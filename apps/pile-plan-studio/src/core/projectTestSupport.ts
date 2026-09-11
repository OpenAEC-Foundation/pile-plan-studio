import type { IfcppProject } from "./projectFile.ts";
import type { ProjectTipLevelKeys } from "./pileTipLevelContract.ts";

export function projectTipLevelKeysForTest(
  input: string | IfcppProject,
): ProjectTipLevelKeys {
  const project = typeof input === "string" ? JSON.parse(input) as IfcppProject : input;
  const plans = project.schema_version >= 2 && (project.user_state.pile_plans?.length ?? 0) > 0
    ? project.user_state.pile_plans!
    : [{
        id: "pile-plan-1",
        active_pile_tip_levels: project.settings.active_pile_tip_levels ?? [],
      }];
  return {
    bearingCapacities: project.inputs.bearing_capacities.map(
      ({ pile_tip_level_m }) => pile_tip_level_m * 1_000,
    ),
    pilePlans: plans.map((plan) => ({
      id: plan.id,
      active: (plan.active_pile_tip_levels ?? project.settings.active_pile_tip_levels ?? [])
        .map((value) => value * 1_000),
    })),
    legend: (project.settings.pile_legend?.pile_tip_levels ?? [])
      .map(({ value }) => value * 1_000),
  };
}
