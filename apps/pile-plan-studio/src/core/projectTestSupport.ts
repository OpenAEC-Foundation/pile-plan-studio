import type { IfcppProject } from "./projectFile.ts";
import type { ProjectTipLevelKeys } from "./projectDocumentContract.ts";

export function canonicalProjectForTest(input: string | IfcppProject): IfcppProject {
  const project = structuredClone(
    typeof input === "string" ? JSON.parse(input) as IfcppProject : input,
  );
  project.settings.global_cpt_selection.monopoly_distance_m ??= 1;
  for (const settings of Object.values(project.settings.cpt_selection_by_load_point)) {
    settings.monopoly_distance_m ??= 1;
  }
  project.settings.load_point_grouping ??= {
    automatic: true,
    max_edge_distance_mm: 1_200,
  };
  project.settings.viewer_utilization ??= { minimum: 0, maximum: 1 };
  project.settings.viewer ??= {
    symbol_scale_percent: 100,
    foreground_layer: "load-points",
    show_grid: true,
    show_tip_level_regions: true,
  };
  project.settings.viewer.show_tip_level_regions ??= true;
  project.import_log ??= [];
  project.user_state.pile_plans ??= [];
  for (const plan of project.user_state.pile_plans) {
    plan.active_pile_sizes ??= [...(project.settings.active_pile_sizes ?? [])];
    plan.active_pile_tip_levels ??= [...(project.settings.active_pile_tip_levels ?? [])];
    plan.optimization_unassigned ??= {};
  }
  project.user_state.active_pile_plan_id ??= project.user_state.pile_plans[0]?.id ?? "pile-plan-1";
  project.schema_version = 4;
  return project;
}

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
