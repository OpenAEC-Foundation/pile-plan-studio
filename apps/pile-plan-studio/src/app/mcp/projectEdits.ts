import type { McpProjectEdit } from "../../core/mcpProjectEditCoreClient.ts";
import { type ProjectState } from "../../domain/project/projectState.ts";
import type { IlpOptimizationSettings } from "../../core/ilpOptimizationTypes.ts";
import { prepareProjectDocumentEdit } from "../project/projectEditOperations.ts";
import { McpReadError } from "./readModel.ts";
import type { WriteOperation, McpSnapshot, PileMcpWriteToolName } from "./protocol.ts";
import type { PreparedMcpWrite } from "./writeModel.ts";

const sourceNames = new Set<PileMcpWriteToolName>([
  "pile_edit_load_points_bulk", "pile_edit_cpts_bulk", "pile_edit_foundation_advice_bulk",
]);

function editFromArgs(state: ProjectState, operation: WriteOperation): McpProjectEdit {
  const { name, args } = operation;
  if (name === "pile_set_optimization_settings") {
    const { settings: patch } = args;
    const settings: IlpOptimizationSettings = {
      ...state.ilpOptimizationSettings, ...patch,
      transition_weights: { ...state.ilpOptimizationSettings.transition_weights, ...patch.transition_weights },
    };
    return { kind: "optimization_settings", settings };
  }
  if (name === "pile_set_active_configurations") {
    const { plan_id, pile_sizes_mm, pile_tip_levels_mm } = args;
    return { kind: "active_configurations", plan_id, pile_sizes_mm, pile_tip_levels_mm };
  }
  if (name === "pile_set_legend_settings") {
    const values = args;
    return { kind: "legend_settings", legend: values.legend,
      show_tip_level_regions: values.show_tip_level_regions ?? null };
  }
  if (name === "pile_set_project_properties") {
    const { name: projectName, pile_head_level_m, currency_code } = args;
    return { kind: "project_properties", name: projectName, pile_head_level_m, currency_code };
  }
  if (name === "pile_edit_load_points_bulk") return { kind: "load_points", actions: args.actions };
  if (name === "pile_edit_cpts_bulk") return { kind: "cpts", actions: args.actions };
  if (name === "pile_edit_foundation_advice_bulk") return { kind: "bearing_capacities", actions: args.actions };
  throw new McpReadError("unknown_tool");
}

export async function prepareProjectEditWrite(snapshot: McpSnapshot, operation: WriteOperation): Promise<PreparedMcpWrite> {
  const { state } = snapshot;
  const { name } = operation;
  let prepared;
  let submittedCount = 0;
  try {
    const edit = editFromArgs(state, operation);
    submittedCount = "actions" in edit ? edit.actions.length : 0;
    prepared = await prepareProjectDocumentEdit(state, edit);
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
    data: { changed, operation: name, ...(source ? { submitted_count: submittedCount,
      load_point_count: next.loadPoints.length, cpt_count: next.cpts.length,
      advice_row_count: next.bearingCapacities.length, sizes_without_cost_rows_mm: sizesWithoutCosts,
      analysis_requested: changed } : {}) },
    update: prepared.update };
}
