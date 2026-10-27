export const MAX_PILE_CAP_COUNT = 20;
import type {
  PileConfigurationKey,
  PileConfigurationOption,
} from "./projectTypes.ts";
export type PileCapProposal = {
  load_point_ids: number[];
  pile_count: number;
  quarter_turns: number;
  configuration: PileConfigurationKey | null;
};
export type PileCapProposalEdit = {
  plan_id: string;
  proposal: PileCapProposal;
  remove: boolean;
};
export type PileCapPoint = { x_mm: number; y_mm: number };
export type PileCapOption = PileConfigurationOption & {
  cost_per_pile: number | null;
  total_cost: number | null;
};
export type PileCapPreview = {
  proposal: PileCapProposal;
  status:
    | "active"
    | "group_changed"
    | "invalid_source_data"
    | "missing_cpt_selection";
  center: PileCapPoint;
  positions: PileCapPoint[];
  total_load_kn: number | null;
  load_per_pile_kn: number | null;
  cpt_ids: number[];
  missing_selection_load_point_ids: number[];
  options: PileCapOption[];
};
export type PileCapPlanPreview = {
  plan_id: string;
  proposals: PileCapProposal[];
  previews: PileCapPreview[];
  pile_count: number;
  total_cost: number;
  missing_cost_count: number;
};
export type PileCapProposalResult = { plans: PileCapPlanPreview[] };
