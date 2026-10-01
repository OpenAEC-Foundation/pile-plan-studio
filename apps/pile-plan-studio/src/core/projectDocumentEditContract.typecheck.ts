import type { ProjectDocumentEdit } from "./mcpProjectEditCoreClient.ts";
import type { ProjectDocumentDraft } from "./projectDocumentContract.ts";
import type { IlpOptimizationSettings } from "./ilpOptimizationTypes.ts";

// This function is checked by TypeScript; it is never called at runtime.
export function checkProjectDocumentEdits(draft: ProjectDocumentDraft, settings: IlpOptimizationSettings): ProjectDocumentEdit[] {
  const edits: ProjectDocumentEdit[] = [
    { kind: "optimization_settings", settings },
    { kind: "active_configurations", plan_id: "p", pile_sizes_mm: [320], pile_tip_levels_mm: [-18500] },
    { kind: "legend_settings", legend: draft.settings.pile_legend!, show_tip_level_regions: null },
    { kind: "project_properties", name: "P", pile_head_level_m: 0, currency_code: "EUR" },
    { kind: "load_points", actions: [{ action: "add", item: draft.inputs.load_points[0] }, { action: "remove", id: 1 }] },
    { kind: "cpts", actions: [{ action: "update", item: draft.inputs.cpts[0] }] },
    { kind: "bearing_capacities", actions: [{ action: "add", item: draft.inputs.bearing_capacities[0] },
      { action: "remove", cpt_id: 1, pile_size_mm: 320, pile_tip_level_mm: -18500 }] },
    // @ts-expect-error unknown operation
    { kind: "unknown" },
    // @ts-expect-error plan ID is mandatory
    { kind: "active_configurations", pile_sizes_mm: [], pile_tip_levels_mm: [] },
    // @ts-expect-error sizes must be numbers
    { kind: "active_configurations", plan_id: "p", pile_sizes_mm: ["320"], pile_tip_levels_mm: [] },
    // @ts-expect-error remove takes an ID, not a row
    { kind: "load_points", actions: [{ action: "remove", item: draft.inputs.load_points[0] }] },
    // @ts-expect-error update requires a complete row
    { kind: "cpts", actions: [{ action: "update", id: 1 }] },
    // @ts-expect-error advice removal requires the millimetre key
    { kind: "bearing_capacities", actions: [{ action: "remove", cpt_id: 1, pile_size_mm: 320, pile_tip_level_m: -18.5 }] },
  ];
  return edits;
}
