import type { ProjectDocumentDraft } from "./projectDocumentContract.ts";
import type { IlpOptimizationSettings } from "./ilpOptimizationTypes.ts";

type RowAction<T> = { action: "add" | "update"; item: T } | { action: "remove"; id: number };
export type LoadPointAction = RowAction<ProjectDocumentDraft["inputs"]["load_points"][number]>;
export type CptAction = RowAction<ProjectDocumentDraft["inputs"]["cpts"][number]>;
export type BearingCapacityAction =
  | { action: "add" | "update"; item: ProjectDocumentDraft["inputs"]["bearing_capacities"][number] }
  | { action: "remove"; cpt_id: number; pile_size_mm: number; pile_tip_level_mm: number };

export type ProjectDocumentEdit =
  | { kind: "optimization_settings"; settings: IlpOptimizationSettings }
  | { kind: "active_configurations"; plan_id: string; pile_sizes_mm: number[]; pile_tip_levels_mm: number[] }
  | { kind: "legend_settings"; legend: NonNullable<ProjectDocumentDraft["settings"]["pile_legend"]>;
      show_tip_level_regions?: boolean | null }
  | { kind: "project_properties"; name: string; pile_head_level_m: number; currency_code: string }
  | { kind: "load_points"; actions: LoadPointAction[] }
  | { kind: "cpts"; actions: CptAction[] }
  | { kind: "bearing_capacities"; actions: BearingCapacityAction[] };
