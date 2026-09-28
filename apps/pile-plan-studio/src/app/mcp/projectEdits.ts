import type { McpProjectEdit } from "../../core/mcpProjectEditCoreClient.ts";
import { type ProjectState } from "../../domain/project/projectState.ts";
import type { IlpOptimizationSettings } from "../../core/ilpOptimizationTypes.ts";
import { prepareProjectDocumentEdit } from "../project/projectEditOperations.ts";
import { McpReadError } from "./readModel.ts";
import type { McpSnapshot, PileMcpWriteToolName } from "./protocol.ts";
import type { PreparedMcpWrite } from "./writeModel.ts";

const sourceNames = new Set<PileMcpWriteToolName>([
  "pile_edit_load_points_bulk", "pile_edit_cpts_bulk", "pile_edit_foundation_advice_bulk",
]);

function editFromArgs(state: ProjectState, name: PileMcpWriteToolName,
  args: Record<string, unknown>): McpProjectEdit {
  if (name === "pile_set_optimization_settings") {
    const patch = args.settings as Record<string, unknown>;
    const settings: IlpOptimizationSettings = {
      ...state.ilpOptimizationSettings, ...patch,
      transition_weights: {
        ...state.ilpOptimizationSettings.transition_weights,
        ...((patch.transition_weights ?? {}) as object),
      },
    } as IlpOptimizationSettings;
    return { kind: "optimization_settings", settings };
  }
  if (name === "pile_set_active_configurations") return {
    kind: "active_configurations", plan_id: args.plan_id,
    pile_sizes_mm: args.pile_sizes_mm, pile_tip_levels_mm: args.pile_tip_levels_mm,
  };
  if (name === "pile_set_legend_settings") return { kind: "legend_settings", legend: args.legend,
    show_tip_level_regions: args.show_tip_level_regions ?? null };
  if (name === "pile_set_project_properties") return { kind: "project_properties",
    name: args.name, pile_head_level_m: args.pile_head_level_m, currency_code: args.currency_code };
  if (name === "pile_edit_load_points_bulk") return { kind: "load_points", actions: args.actions };
  if (name === "pile_edit_cpts_bulk") return { kind: "cpts", actions: args.actions };
  if (name === "pile_edit_foundation_advice_bulk") return { kind: "bearing_capacities", actions: args.actions };
  throw new McpReadError("unknown_tool");
}

export async function prepareProjectEditWrite(snapshot: McpSnapshot, name: PileMcpWriteToolName,
  args: Record<string, unknown>): Promise<PreparedMcpWrite> {
  const { state } = snapshot;
  let prepared;
  try {
    prepared = await prepareProjectDocumentEdit(state, editFromArgs(state, name, args));
  } catch (error) {
    if (error instanceof Error) {
      const index = (error as Error & { actionIndex?: number | null }).actionIndex;
      throw new McpReadError(error.message, index == null ? undefined : [index]);
    }
    throw error;
  }
  const { next, changed } = prepared;
  const source = sourceNames.has(name);
  const pricedSizes = new Set(next.pileCostSettings.items.map((item) => item.pile_size_mm));
  const sizesWithoutCosts = [...new Set(next.bearingCapacities.map((row) => row.pile_size_mm))]
    .filter((size) => !pricedSizes.has(size)).sort((a, b) => a - b);
  return { mode: "history", changed,
    data: { changed, operation: name, ...(source ? { submitted_count: (args.actions as unknown[]).length,
      load_point_count: next.loadPoints.length, cpt_count: next.cpts.length,
      advice_row_count: next.bearingCapacities.length, sizes_without_cost_rows_mm: sizesWithoutCosts,
      analysis_requested: changed } : {}) },
    update: prepared.update };
}
