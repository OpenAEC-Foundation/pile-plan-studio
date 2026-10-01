import { readPileTool, McpReadError, type PileToolName, type ToolPayload } from "./readModel.ts";
import { readProjectSourceTool, requireCurrentGroups, type ProjectSourceToolName, type SourceSnapshot } from "./projectSettingsSources.ts";
import { readPlanAssessment, type PlanAssessmentSnapshot, type PlanAssessmentToolName } from "./planAssessments.ts";
import type { SourceImportToolName } from "./sourceImportSession.ts";
import type { PilePlanImportToolName } from "./pilePlanImportSession.ts";

import type { ProjectDocumentEdit } from "../../core/projectDocumentEditContract.ts";
import type { IlpOptimizationSettings } from "../../core/ilpOptimizationTypes.ts";

export type McpSnapshot = SourceSnapshot & PlanAssessmentSnapshot;
export type PileMcpWriteToolName =
  | "pile_duplicate_plan" | "pile_rename_plan" | "pile_assign_configuration" | "pile_clear_assignment"
  | "pile_activate_plan" | "pile_delete_plan" | "pile_set_load_point_lock"
  | "pile_set_manual_cpts" | "pile_use_automatic_cpts"
  | "pile_group_load_points" | "pile_ungroup_load_points"
  | "pile_set_assignments_bulk" | "pile_set_load_point_locks_bulk"
  | "pile_set_cpt_selections_bulk" | "pile_ungroup_load_points_bulk"
  | "pile_set_cpt_selection_settings" | "pile_set_cpt_selection_settings_bulk"
  | "pile_set_grouping_settings" | "pile_reset_group_overrides"
  | "pile_add_cost_item" | "pile_update_cost_item" | "pile_remove_cost_item"
  | "pile_edit_cost_catalog_bulk"
  | "pile_set_optimization_settings" | "pile_set_active_configurations"
  | "pile_set_legend_settings" | "pile_set_project_properties"
  | "pile_edit_load_points_bulk" | "pile_edit_cpts_bulk" | "pile_edit_foundation_advice_bulk";
export type PileMcpToolName = PileToolName | ProjectSourceToolName | PlanAssessmentToolName | PileMcpWriteToolName | SourceImportToolName;
export type McpWriteHandler = (snapshot: McpSnapshot, name: PileMcpWriteToolName, args: Record<string, unknown>) => Promise<ToolPayload>;
export type OptimizationControlToolName = "pile_start_optimization" | "pile_stop_optimization" | "pile_cancel_optimization";
export type OptimizationControlHandler = (snapshot: McpSnapshot, name: OptimizationControlToolName, args: Record<string, unknown>) => Promise<ToolPayload>;
export type SourceImportHandler = (snapshot: McpSnapshot, name: SourceImportToolName, args: Record<string, unknown>) => Promise<ToolPayload>;
export type FileOperationToolName = "pile_open_project" | "pile_save_project" | "pile_save_project_as" | "pile_export_plan" | "pile_get_file_operation_status";
export type FileOperationHandler = (snapshot: McpSnapshot, name: FileOperationToolName, args: Record<string, unknown>) => Promise<ToolPayload>;
export type PilePlanImportHandler = (snapshot: McpSnapshot, name: PilePlanImportToolName, args: Record<string, unknown>) => Promise<ToolPayload>;

type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
type ToolDefinition = { name: PileMcpToolName | OptimizationControlToolName | FileOperationToolName | PilePlanImportToolName; description: string; inputSchema: JsonSchema; annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: false } };

const integer = { type: "integer", minimum: 0 };
const pageFields = { limit: { type: "integer", minimum: 1, maximum: 100 }, offset: integer };
const planField = { plan_id: { type: "string" } };
const loadPointField = { load_point_id: integer };
const cptField = { cpt_id: integer };
const idList = (minimumItems: number) => ({ type: "array", items: integer,
  minItems: minimumItems, maxItems: 1000, uniqueItems: true });
const bulkIds = { type: "array", items: integer, minItems: 1, maxItems: 500, uniqueItems: true };
const configuration = { type: "object", properties: {
  pile_size_mm: { type: "integer", minimum: 1 },
  pile_tip_level_mm: { type: "integer", minimum: -1000000 },
}, required: ["pile_size_mm", "pile_tip_level_mm"], additionalProperties: false };
const bulkChanges = (property: string, value: Record<string, unknown>) => ({
  type: "array", minItems: 1, maxItems: 500,
  items: { type: "object", properties: { load_point_id: integer, [property]: value },
    required: ["load_point_id", property], additionalProperties: false },
});
const nonnegativeNumber = { type: "number", minimum: 0 };
const cptSettingsPatch = { type: "object", minProperties: 1, properties: {
  algorithm: { type: "string", enum: ["quadrants", "maximum-angle"] },
  max_distance_m: nonnegativeNumber,
  monopoly_distance_m: nonnegativeNumber,
  max_angle_degrees: { type: "number", minimum: 1, maximum: 360 },
}, additionalProperties: false };
const costShape = { type: "string", enum: ["round", "square"] };
const costItem = { type: "object", properties: {
  pile_size_mm: { type: "integer", minimum: 1 }, shape: costShape, cost_per_m3: nonnegativeNumber,
}, required: ["pile_size_mm", "shape", "cost_per_m3"], additionalProperties: false };
const costAction = { oneOf: [
  { type: "object", properties: { action: { type: "string", enum: ["add"] }, item: costItem },
    required: ["action", "item"], additionalProperties: false },
  { type: "object", properties: { action: { type: "string", enum: ["update"] },
    pile_size_mm: { type: "integer", minimum: 1 }, shape: costShape, cost_per_m3: nonnegativeNumber },
    required: ["action", "pile_size_mm"], additionalProperties: false },
  { type: "object", properties: { action: { type: "string", enum: ["remove"] },
    pile_size_mm: { type: "integer", minimum: 1 } },
    required: ["action", "pile_size_mm"], additionalProperties: false },
] };
const nullablePositiveInteger = { oneOf: [{ type: "integer", minimum: 1 }, { type: "null" }] };
const sourceLoadPoint = { type: "object", properties: {
  id: integer, name: { type: "string" }, x_mm: { type: "number" }, y_mm: { type: "number" },
  design_load_kn: { type: "number" },
}, required: ["id", "name", "x_mm", "y_mm", "design_load_kn"], additionalProperties: false };
const sourceCpt = { type: "object", properties: {
  id: integer, name: { type: "string" }, x_mm: { type: "number" }, y_mm: { type: "number" },
}, required: ["id", "name", "x_mm", "y_mm"], additionalProperties: false };
const sourceAdvice = { type: "object", properties: {
  cpt_id: integer, pile_size_mm: { type: "integer", minimum: 1 },
  pile_tip_level_m: { type: "number" }, frd_kn: { type: "number" },
}, required: ["cpt_id", "pile_size_mm", "pile_tip_level_m", "frd_kn"], additionalProperties: false };
const sourceActions = (item: Record<string, unknown>, removal: Record<string, unknown>, required: string[]) => ({
  type: "array", minItems: 1, maxItems: 500, items: { oneOf: [
    ...["add", "update"].map((action) => ({ type: "object", properties: {
      action: { type: "string", enum: [action] }, item,
    }, required: ["action", "item"], additionalProperties: false })),
    { type: "object", properties: { action: { type: "string", enum: ["remove"] }, ...removal },
      required: ["action", ...required], additionalProperties: false },
  ] },
});
const legendStyle = { type: "object", properties: {
  value: { type: "number" }, symbol: { type: "object", properties: {
    base_shape: { type: "string" }, fill_pattern: { type: "string" },
  }, required: ["base_shape", "fill_pattern"], additionalProperties: false },
  color: { type: "string" }, symbol_automatic: { type: "boolean" }, color_automatic: { type: "boolean" },
}, required: ["value", "symbol", "color", "symbol_automatic", "color_automatic"], additionalProperties: false };
const legendSettings = { type: "object", properties: {
  encoding_mode: { type: "string", enum: ["size-symbol", "tip-symbol", "size-color-tip-region"] },
  color_scheme: { type: "string" }, pile_size_color_scheme: { type: "string" },
  pile_tip_level_color_scheme: { type: "string" },
  pile_sizes: { type: "array", items: legendStyle, maxItems: 1000 },
  pile_tip_levels: { type: "array", items: legendStyle, maxItems: 1000 },
}, required: ["encoding_mode", "color_scheme", "pile_sizes", "pile_tip_levels"], additionalProperties: false };

function paged(prefix: string) {
  return { [`${prefix}_limit`]: pageFields.limit, [`${prefix}_offset`]: pageFields.offset };
}

function definition(name: PileMcpToolName | OptimizationControlToolName | FileOperationToolName | PilePlanImportToolName, description: string, properties: Record<string, unknown> = {}, required: string[] = [], readOnly = true): ToolDefinition {
  return {
    name, description,
    inputSchema: { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false },
    annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: false },
  };
}

export const PILE_TOOL_SCHEMAS: ToolDefinition[] = [
  definition("pile_project_overview", "Read the open pile project's name, counts, and analysis status."),
  definition("pile_get_project_settings", "Read project properties, CPT selection, grouping, cost, complete visual legend, and optimization settings. The optimization budget_basis_points is extra cost above the cost-only reference solution (500 means 5%), not above the current plan cost.", {
    ...paged("manual_groups"), ...paged("separated_groups"), ...paged("cost_catalog"),
    ...paged("custom_configurations"), ...paged("selected_target_ids"),
  }),
  definition("pile_list_load_points", "List load points and their assignments in a plan.", { ...planField, ...pageFields }),
  definition("pile_get_load_point", "Read one load point, its CPT selection, group, and assigned pile option.", { ...loadPointField, ...planField }, ["load_point_id"]),
  definition("pile_list_cpts", "List CPT positions and advice counts.", pageFields),
  definition("pile_get_cpt_advice", "Read foundation advice rows for one CPT.", { ...cptField, ...pageFields }, ["cpt_id"]),
  definition("pile_list_groups", "List current effective load-point groups.", pageFields),
  definition("pile_list_plans", "List pile plans and their assignment counts.", pageFields),
  definition("pile_get_plan", "Read one pile plan and its assignment summary.", { ...planField, ...pageFields }),
  definition("pile_list_pile_options", "List Rust-evaluated pile options for one load point.", { ...loadPointField, ...planField, ...pageFields }, ["load_point_id"]),
  definition("pile_get_plan_costs", "Calculate the current cost estimate for a plan via the Rust core.", planField),
  definition("pile_compare_plans", "Compare two explicit plans: assignments, locks, Rust costs, and paged load-point differences. A cost delta is omitted if either plan has missing prices.", {
    plan_a_id: { type: "string" }, plan_b_id: { type: "string" }, ...pageFields,
  }, ["plan_a_id", "plan_b_id"]),
  definition("pile_get_plan_optimization", "Read a plan's committed optimization result and diagnostics. The solution.reference.cost is from the cost-only phase without coherence optimization; solution.budget is the resulting maximum allowed cost. Check both reference and returned-plan proof fields.", { ...planField, ...pageFields }),
  definition("pile_get_current_optimization", "Read the current transient optimization run status or outcome. A solved result reports the cost-only reference and coherence budget separately, with independent optimality proofs.", { ...pageFields, ...paged("solvable") }),
  definition("pile_get_technical_assessment", "Read current Rust technical issues and group assignment conflicts.", {
    ...planField, ...paged("issues"), ...paged("group_conflicts"),
  }),
];

const expected = {
  expected_project_instance_id: { type: "string" },
  expected_project_revision: integer,
};
const expectedFields = ["expected_project_instance_id", "expected_project_revision"];
const transactionId = { transaction_id: { type: "string" } };
PILE_TOOL_SCHEMAS.push(
  definition("pile_get_pile_plan_import_requirements", "Read Rust's exact standard-table CSV columns, units, and examples for importing an existing pile plan."),
  definition("pile_begin_pile_plan_import", "Begin a temporary CSV pile-plan import. Specify whether pile assignments and project-wide manual CPT choices should be imported.", {
    file_name: { type: "string" }, plan_name: { type: "string" }, coordinate_tolerance_mm: nonnegativeNumber,
    import_pile_assignments: { type: "boolean" }, import_cpt_selections: { type: "boolean" }, ...expected,
  }, ["file_name", "coordinate_tolerance_mm", "import_pile_assignments", "import_cpt_selections", ...expectedFields], false),
  definition("pile_append_pile_plan_import", "Append an ordered UTF-8 CSV chunk up to 128 KiB for the staged pile-plan import.", {
    transaction_id: { type: "string" }, chunk_index: integer, text: { type: "string" }, final: { type: "boolean" },
  }, ["transaction_id", "chunk_index", "text", "final"], false),
  definition("pile_validate_pile_plan_import", "Validate the staged pile-plan CSV with the Rust importer; poll status for counts, skipped rows, conflicts, and diagnostics.", transactionId, ["transaction_id"], false),
  definition("pile_get_pile_plan_import_status", "Read staged pile-plan import validation status and paged Rust diagnostics.", {
    ...transactionId, ...pageFields,
  }, ["transaction_id"]),
  definition("pile_apply_pile_plan_import", "Apply a validated CSV as one new plan and one Undo step. Set allow_partial_import true explicitly if rows were skipped or conflicted.", {
    ...transactionId, validation_id: { type: "string" }, allow_partial_import: { type: "boolean" },
  }, ["transaction_id", "validation_id"], false),
  definition("pile_discard_pile_plan_import", "Discard staged pile-plan CSV without changing the project.", transactionId, ["transaction_id"], false),
  definition("pile_open_project", "Open an IFCPP project selected in the app's native file dialog. Returns an operation ID immediately; poll pile_get_file_operation_status. Unsaved project changes require the user's decision in the app.", expected, expectedFields, false),
  definition("pile_save_project", "Save the current project to its existing file or show a native Save dialog. Returns an operation ID; poll status. Does not create an Undo step.", expected, expectedFields, false),
  definition("pile_save_project_as", "Show the native Save dialog and save the current project. Returns an operation ID; poll status. Does not create an Undo step.", expected, expectedFields, false),
  definition("pile_export_plan", "Export an explicit pile plan to CSV or XLSX through the app's native Save dialog. Returns an operation ID; poll status. Does not change the project or active plan.", {
    ...planField, format: { type: "string", enum: ["csv", "xlsx"] }, ...expected,
  }, ["plan_id", "format", ...expectedFields], false),
  definition("pile_get_file_operation_status", "Read a file operation's pending, completed, cancelled, or failed status. Local paths are never returned.", { operation_id: { type: "string" } }, ["operation_id"]),
  definition("pile_get_import_requirements", "Read the Rust-authoritative standard-table CSV columns, units, and examples before generating source data."),
  definition("pile_begin_source_import", "Begin a transient source import. For refresh, omit project_name, pile_head_level_m, and currency_code (null is also accepted). For new_project, supply all three. No project change yet.",
    { mode: { type: "string", enum: ["refresh", "new_project"] },
      project_name: { oneOf: [{ type: "string" }, { type: "null" }] },
      pile_head_level_m: { oneOf: [{ type: "number" }, { type: "null" }] },
      currency_code: { oneOf: [{ type: "string" }, { type: "null" }] }, ...expected },
    ["mode", ...expectedFields], false),
  definition("pile_append_import_source", "Append one UTF-8 standard-table CSV text chunk (at most 128 KiB), in order. Use a display .csv basename; do not pass a file path.",
    { ...transactionId, role: { type: "string", enum: ["load-points", "cpts", "bearing-capacities"] },
      file_name: { type: "string" }, chunk_index: integer, text: { type: "string" }, final: { type: "boolean" } },
    ["transaction_id", "role", "file_name", "chunk_index", "text", "final"], false),
  definition("pile_validate_source_import", "Validate all staged sources through the Rust importer without changing the project. Poll status with the returned validation ID.",
    transactionId, ["transaction_id"], false),
  definition("pile_get_source_import_status", "Read validation progress, Rust diagnostics, and prospective changes for a staged import.",
    transactionId, ["transaction_id"]),
  definition("pile_apply_source_import", "Apply a successful validation. Refresh is one Undo step; new project replaces the clean current project and remains unsaved.",
    { ...transactionId, validation_id: { type: "string" } }, ["transaction_id", "validation_id"], false),
  definition("pile_discard_source_import", "Discard the staged source import without changing the project.",
    transactionId, ["transaction_id"], false),
);
PILE_TOOL_SCHEMAS.push(
  definition("pile_start_optimization", "Start a cost-only reference solve, then optimize coherence within the reference cost plus budget_basis_points. Current plan assignments may seed the search but current plan cost does not set the budget. A rerun is a new search and is not guaranteed to improve the prior result. Return a run ID immediately; solved results are one Undo step.",
    { ...planField, target_load_point_ids: { type: "array", items: integer, minItems: 1, maxItems: 1000, uniqueItems: true },
      time_limit_seconds: { oneOf: [{ type: "integer", minimum: 1, maximum: 7200 }, { type: "null" }] },
      local_only: { type: "boolean" }, create_new_plan: { type: "boolean" }, new_plan_name: { type: "string" },
      limit_scope: { type: "string", enum: ["target", "whole-plan"] },
      include_boundary_transitions: { type: "boolean" }, ...expected },
    ["plan_id", ...expectedFields], false),
  definition("pile_stop_optimization", "Stop the named run and retain its best valid solution, if any.",
    { run_id: { type: "string" } }, ["run_id"], false),
  definition("pile_cancel_optimization", "Cancel the named run and discard its result.",
    { run_id: { type: "string" } }, ["run_id"], false),
  definition("pile_duplicate_plan", "Duplicate a pile plan and activate the copy. Undoable project change.",
    { ...planField, ...expected }, ["plan_id", ...expectedFields], false),
  definition("pile_rename_plan", "Rename a pile plan. Undoable project change.",
    { ...planField, name: { type: "string" }, ...expected }, ["plan_id", "name", ...expectedFields], false),
  definition("pile_assign_configuration", "Assign a pile configuration to a load point and its effective group. Undoable project change.",
    { ...planField, ...loadPointField, pile_size_mm: { type: "integer", minimum: 1 }, pile_tip_level_mm: { type: "integer", minimum: -1000000 }, ...expected },
    ["plan_id", "load_point_id", "pile_size_mm", "pile_tip_level_mm", ...expectedFields], false),
  definition("pile_clear_assignment", "Remove the pile assignment from a load point and its effective group. Undoable project change.",
    { ...planField, ...loadPointField, ...expected }, ["plan_id", "load_point_id", ...expectedFields], false),
  definition("pile_activate_plan", "Activate an existing pile plan. Matches UI navigation and does not add an undo step.",
    { ...planField, ...expected }, ["plan_id", ...expectedFields], false),
  definition("pile_delete_plan", "Delete a pile plan if another plan remains. Undoable project change.",
    { ...planField, ...expected }, ["plan_id", ...expectedFields], false),
  definition("pile_set_load_point_lock", "Lock or unlock one load point in the active pile plan. Undoable project change.",
    { ...planField, ...loadPointField, locked: { type: "boolean" }, ...expected },
    ["plan_id", "load_point_id", "locked", ...expectedFields], false),
  definition("pile_set_manual_cpts", "Replace manual CPT selection for one load point. An empty list explicitly selects none.",
    { ...loadPointField, cpt_ids: idList(0), ...expected }, ["load_point_id", "cpt_ids", ...expectedFields], false),
  definition("pile_use_automatic_cpts", "Remove manual CPT selection for one load point and use automatic selection.",
    { ...loadPointField, ...expected }, ["load_point_id", ...expectedFields], false),
  definition("pile_group_load_points", "Group selected effective load-point units through the Rust core. Undoable project change.",
    { load_point_ids: idList(2), ...expected }, ["load_point_ids", ...expectedFields], false),
  definition("pile_ungroup_load_points", "Separate the effective group containing this load point through the Rust core.",
    { ...loadPointField, ...expected }, ["load_point_id", ...expectedFields], false),
  definition("pile_set_assignments_bulk", "Set or clear per-location assignments atomically in the active plan. One Undo step.",
    { ...planField, changes: bulkChanges("configuration", { oneOf: [configuration, { type: "null" }] }), ...expected },
    ["plan_id", "changes", ...expectedFields], false),
  definition("pile_set_load_point_locks_bulk", "Set per-location locks atomically in the active plan. One Undo step.",
    { ...planField, changes: bulkChanges("locked", { type: "boolean" }), ...expected },
    ["plan_id", "changes", ...expectedFields], false),
  definition("pile_set_cpt_selections_bulk", "Set manual CPT lists or restore automatic selection per location atomically. One Undo step.",
    { changes: bulkChanges("cpt_ids", { oneOf: [{ type: "array", items: integer, minItems: 0, maxItems: 1000,
      uniqueItems: true }, { type: "null" }] }), ...expected },
    ["changes", ...expectedFields], false),
  definition("pile_ungroup_load_points_bulk", "Separate distinct effective groups atomically. One Undo step.",
    { load_point_ids: bulkIds, ...expected }, ["load_point_ids", ...expectedFields], false),
  definition("pile_set_cpt_selection_settings", "Set projectwide automatic CPT rules; optionally replace manual CPT choices. One Undo step.",
    { settings: cptSettingsPatch, overwrite_manual_selections: { type: "boolean" }, ...expected },
    ["settings", ...expectedFields], false),
  definition("pile_set_cpt_selection_settings_bulk", "Set different automatic CPT rules per load point atomically. One Undo step.",
    { changes: { type: "array", minItems: 1, maxItems: 500,
      items: { type: "object", properties: { load_point_id: integer, settings: cptSettingsPatch,
        overwrite_manual_selections: { type: "boolean" } },
        required: ["load_point_id", "settings"], additionalProperties: false } }, ...expected },
    ["changes", ...expectedFields], false),
  definition("pile_set_grouping_settings", "Set automatic grouping and/or maximum group distance. One Undo step.",
    { automatic: { type: "boolean" }, max_edge_distance_m: nonnegativeNumber, ...expected },
    expectedFields, false),
  definition("pile_reset_group_overrides", "Clear all manual joins and explicit automatic-group separations. One Undo step.",
    expected, expectedFields, false),
  definition("pile_add_cost_item", "Add one pile-size cost row. One Undo step.",
    { item: costItem, ...expected }, ["item", ...expectedFields], false),
  definition("pile_update_cost_item", "Change shape and/or unit cost for one pile size. One Undo step.",
    { pile_size_mm: { type: "integer", minimum: 1 }, shape: costShape,
      cost_per_m3: nonnegativeNumber, ...expected }, ["pile_size_mm", ...expectedFields], false),
  definition("pile_remove_cost_item", "Remove one unused pile-size cost row. One Undo step.",
    { pile_size_mm: { type: "integer", minimum: 1 }, ...expected }, ["pile_size_mm", ...expectedFields], false),
  definition("pile_edit_cost_catalog_bulk", "Apply up to 500 add, update, or remove cost-row actions atomically. One Undo step.",
    { actions: { type: "array", minItems: 1, maxItems: 500, items: costAction }, ...expected },
    ["actions", ...expectedFields], false),
  definition("pile_set_optimization_settings", "Patch project-owned optimization settings. budget_basis_points is extra cost above the cost-only reference, not the current plan. One Undo step.", {
    settings: { type: "object", minProperties: 1, properties: {
      skip_unsolvable_units: { type: "boolean" }, optimize_coherence: { type: "boolean" },
      max_pile_tip_levels: nullablePositiveInteger, max_pile_sizes: nullablePositiveInteger,
      max_pile_configurations: nullablePositiveInteger,
      max_utilization: { type: "number", minimum: 0, maximum: 1 },
      candidate_source: { type: "string", enum: ["all_available", "active_legend", "custom"] },
      custom_configurations: { type: "array", items: configuration, maxItems: 500 },
      budget_basis_points: integer,
      transition_weights: { type: "object", minProperties: 1, properties: {
        tip_only_milli: integer, size_only_milli: integer,
      }, additionalProperties: false },
    }, additionalProperties: false }, ...expected,
  }, ["settings", ...expectedFields], false),
  definition("pile_set_active_configurations", "Replace active pile sizes and tip levels for one plan. Values must exist in foundation advice. One Undo step.", {
    ...planField, pile_sizes_mm: { type: "array", items: { type: "integer", minimum: 1 }, maxItems: 1000, uniqueItems: true },
    pile_tip_levels_mm: { type: "array", items: { type: "integer", minimum: -1000000 }, maxItems: 1000, uniqueItems: true }, ...expected,
  }, ["plan_id", "pile_sizes_mm", "pile_tip_levels_mm", ...expectedFields], false),
  definition("pile_set_legend_settings", "Replace the complete project legend, including mode, color schemes, symbols, colors, and automatic flags. Read the current legend first. One Undo step.", {
    legend: legendSettings, show_tip_level_regions: { type: "boolean" }, ...expected,
  }, ["legend", ...expectedFields], false),
  definition("pile_set_project_properties", "Set project name, pile head level in metres, and ISO currency code together. One Undo step.", {
    name: { type: "string" }, pile_head_level_m: { type: "number" }, currency_code: { type: "string" }, ...expected,
  }, ["name", "pile_head_level_m", "currency_code", ...expectedFields], false),
  definition("pile_edit_load_points_bulk", "Add, replace, or remove up to 500 load points atomically. Updates supply the complete row. Removing a point clears its plan assignments, locks, and selections. One Undo step.", {
    actions: sourceActions(sourceLoadPoint, { id: integer }, ["id"]), ...expected,
  }, ["actions", ...expectedFields], false),
  definition("pile_edit_cpts_bulk", "Add, replace, or remove up to 500 CPTs atomically. Updates supply the complete row. Removing a CPT also removes its advice and manual references. One Undo step.", {
    actions: sourceActions(sourceCpt, { id: integer }, ["id"]), ...expected,
  }, ["actions", ...expectedFields], false),
  definition("pile_edit_foundation_advice_bulk", "Add, replace, or remove up to 500 foundation-advice rows atomically. A row key is CPT ID, pile size in mm, and tip level in mm; updates supply the complete row. One Undo step.", {
    actions: sourceActions(sourceAdvice, { cpt_id: integer, pile_size_mm: { type: "integer", minimum: 1 },
      pile_tip_level_mm: { type: "integer", minimum: -1000000 } }, ["cpt_id", "pile_size_mm", "pile_tip_level_mm"]), ...expected,
  }, ["actions", ...expectedFields], false),
);

const definitions = new Map(PILE_TOOL_SCHEMAS.map((tool) => [tool.name, tool]));
const sourceNames = new Set<ProjectSourceToolName>([
  "pile_get_project_settings", "pile_list_cpts", "pile_get_cpt_advice", "pile_list_groups", "pile_get_technical_assessment",
]);
const planNames = new Set<PlanAssessmentToolName>([
  "pile_get_plan", "pile_get_plan_costs", "pile_get_plan_optimization", "pile_get_current_optimization", "pile_compare_plans",
]);
const writeNames = new Set<PileMcpWriteToolName>([
  "pile_duplicate_plan", "pile_rename_plan", "pile_assign_configuration", "pile_clear_assignment",
  "pile_activate_plan", "pile_delete_plan", "pile_set_load_point_lock",
  "pile_set_manual_cpts", "pile_use_automatic_cpts", "pile_group_load_points", "pile_ungroup_load_points",
  "pile_set_assignments_bulk", "pile_set_load_point_locks_bulk", "pile_set_cpt_selections_bulk", "pile_ungroup_load_points_bulk",
  "pile_set_cpt_selection_settings", "pile_set_cpt_selection_settings_bulk",
  "pile_set_grouping_settings", "pile_reset_group_overrides",
  "pile_add_cost_item", "pile_update_cost_item", "pile_remove_cost_item", "pile_edit_cost_catalog_bulk",
  "pile_set_optimization_settings", "pile_set_active_configurations", "pile_set_legend_settings",
  "pile_set_project_properties", "pile_edit_load_points_bulk", "pile_edit_cpts_bulk",
  "pile_edit_foundation_advice_bulk",
]);
const optimizationControlNames = new Set<OptimizationControlToolName>([
  "pile_start_optimization", "pile_stop_optimization", "pile_cancel_optimization",
]);
const sourceImportNames = new Set<SourceImportToolName>([
  "pile_get_import_requirements", "pile_begin_source_import", "pile_append_import_source",
  "pile_validate_source_import", "pile_get_source_import_status", "pile_apply_source_import", "pile_discard_source_import",
]);
const sourceImportWriteNames = new Set<SourceImportToolName>([
  "pile_begin_source_import", "pile_append_import_source", "pile_validate_source_import",
  "pile_apply_source_import", "pile_discard_source_import",
]);
const fileOperationNames = new Set<FileOperationToolName>([
  "pile_open_project", "pile_save_project", "pile_save_project_as", "pile_export_plan", "pile_get_file_operation_status",
]);
const fileOperationWriteNames = new Set<FileOperationToolName>([
  "pile_open_project", "pile_save_project", "pile_save_project_as", "pile_export_plan",
]);
const pilePlanImportNames = new Set<PilePlanImportToolName>([
  "pile_get_pile_plan_import_requirements", "pile_begin_pile_plan_import", "pile_append_pile_plan_import",
  "pile_validate_pile_plan_import", "pile_get_pile_plan_import_status", "pile_apply_pile_plan_import",
  "pile_discard_pile_plan_import",
]);
const pilePlanImportWriteNames = new Set<PilePlanImportToolName>([
  "pile_begin_pile_plan_import", "pile_append_pile_plan_import", "pile_validate_pile_plan_import",
  "pile_apply_pile_plan_import", "pile_discard_pile_plan_import",
]);
const sourceImportErrorMessages: Record<string, string> = {
  project_changed: "The open project changed. Read its current instance ID and revision, then begin again.",
  write_access_disabled: "Enable MCP editing in Pile Plan Studio before changing a project.",
  import_not_found: "The source import transaction was not found in this MCP session.",
  import_expired: "The source import expired. Begin a new transaction.",
  invalid_chunk_order: "Send CSV chunks in order, starting at zero; a completed role may be restaged from zero.",
  invalid_import_source_name: "Use a .csv display filename without a directory path.",
  import_chunk_too_large: "The CSV chunk exceeds 128 KiB; split it into smaller chunks.",
  import_source_too_large: "This CSV source exceeds the 8 MiB limit.",
  import_transaction_too_large: "The staged sources exceed the 16 MiB transaction limit.",
  import_busy: "Wait for the current validation or apply operation to finish.",
  missing_import_roles: "Complete every required CSV role before validating.",
  import_not_validated: "Validate the current staged data and use its successful validation ID.",
  import_content_changed: "The staged CSV no longer matches the validated content; validate it again.",
  too_many_imports: "Discard an older source import before beginning another one.",
  unsaved_project_changes: "Save or discard the open project's changes in the app before creating a new project.",
  partial_import_requires_acceptance: "Review skipped or conflicting rows, then explicitly set allow_partial_import to true if acceptable.",
  group_assignment_expansion_required: "The imported pile choices would change other members of a load-point group. Include those rows with the same configuration in the CSV.",
  unknown_plan: "The requested pile plan does not exist in the open project.",
};

type ValueSchema = {
  type?: string;
  oneOf?: ValueSchema[];
  properties?: Record<string, ValueSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: ValueSchema;
  minimum?: number;
  maximum?: number;
  minProperties?: number;
  enum?: unknown[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
};

function validateValue(schema: ValueSchema, value: unknown): boolean {
  if (schema.oneOf) return schema.oneOf.filter((part) => validateValue(part, value)).length === 1;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "null") return value === null;
  if (schema.type === "string") return typeof value === "string" && value.length > 0;
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value)
    && value >= (schema.minimum ?? -Number.MAX_VALUE) && value <= (schema.maximum ?? Number.MAX_VALUE);
  if (schema.type === "integer") return Number.isSafeInteger(value)
    && (value as number) >= (schema.minimum ?? 0)
    && (value as number) <= (schema.maximum ?? Number.MAX_SAFE_INTEGER);
  if (schema.type === "array") return Array.isArray(value)
    && value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Number.MAX_SAFE_INTEGER)
    && (!schema.uniqueItems || new Set(value).size === value.length)
    && !!schema.items && value.every((item) => validateValue(schema.items!, item));
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    if (entries.length < (schema.minProperties ?? 0)) return false;
    const properties = schema.properties ?? {};
    if (schema.required?.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) return false;
    return entries.every(([key, item]) => Object.prototype.hasOwnProperty.call(properties, key)
      ? validateValue(properties[key], item) : schema.additionalProperties !== false);
  }
  return false;
}


type EditArguments<K extends ProjectDocumentEdit["kind"]> = Omit<Extract<ProjectDocumentEdit, { kind: K }>, "kind">;
type OptimizationPatch = Omit<Partial<IlpOptimizationSettings>, "transition_weights"> & {
  transition_weights?: Partial<IlpOptimizationSettings["transition_weights"]>;
};
type ProjectEditToolArguments = {
  pile_set_optimization_settings: { settings: OptimizationPatch };
  pile_set_active_configurations: EditArguments<"active_configurations">;
  pile_set_legend_settings: EditArguments<"legend_settings">;
  pile_set_project_properties: EditArguments<"project_properties">;
  pile_edit_load_points_bulk: EditArguments<"load_points">;
  pile_edit_cpts_bulk: EditArguments<"cpts">;
  pile_edit_foundation_advice_bulk: EditArguments<"bearing_capacities">;
};

// The dispatcher checks revision fields; direct operation callers need only the edit fields.
// Narrowing reuses the published tool schema rather than maintaining a second validator.
export function projectEditArguments<K extends keyof ProjectEditToolArguments>(
  name: K, raw: unknown,
): ProjectEditToolArguments[K] {
  const schema = definitions.get(name)!.inputSchema as ValueSchema;
  const editSchema = { ...schema,
    required: schema.required?.filter(key => !expectedFields.includes(key)),
  };
  if (!validateValue(editSchema, raw)) throw new McpReadError("invalid_arguments");
  return raw as ProjectEditToolArguments[K];
}

function validateArgs(name: string, raw: unknown): Record<string, unknown> {
  const definition = definitions.get(name as PileMcpToolName);
  if (!definition) throw new McpReadError("unknown_tool");
  if (raw === undefined) raw = {};
  if (!validateValue(definition.inputSchema as ValueSchema, raw)) throw new McpReadError("invalid_arguments");
  const args = raw as Record<string, unknown>;
  if (Array.isArray(args.changes)) {
    const ids = args.changes.map((item) => (item as Record<string, unknown>).load_point_id);
    if (new Set(ids).size !== ids.length) throw new McpReadError("invalid_arguments");
  }
  if (name === "pile_set_grouping_settings" && args.automatic === undefined && args.max_edge_distance_m === undefined) {
    throw new McpReadError("invalid_arguments");
  }
  if (name === "pile_update_cost_item" && args.shape === undefined && args.cost_per_m3 === undefined) {
    throw new McpReadError("invalid_arguments");
  }
  if (name === "pile_begin_source_import" && args.mode === "new_project"
    && (typeof args.project_name !== "string" || typeof args.pile_head_level_m !== "number"
      || typeof args.currency_code !== "string")) {
    throw new McpReadError("invalid_arguments");
  }
  return args;
}

export async function routePileTool(snapshot: McpSnapshot, name: string, rawArgs: unknown, write?: McpWriteHandler, optimize?: OptimizationControlHandler, importSource?: SourceImportHandler, fileOperation?: FileOperationHandler, importPilePlan?: PilePlanImportHandler): Promise<ToolPayload> {
  const args = validateArgs(name, rawArgs);
  let result: ToolPayload;
  if (pilePlanImportNames.has(name as PilePlanImportToolName)) {
    if (!importPilePlan) throw new McpReadError("unavailable");
    return importPilePlan(snapshot, name as PilePlanImportToolName, args);
  } else if (fileOperationNames.has(name as FileOperationToolName)) {
    if (fileOperationWriteNames.has(name as FileOperationToolName) && (args.expected_project_instance_id !== snapshot.marker.project_instance_id
      || args.expected_project_revision !== snapshot.marker.project_revision
      || (snapshot.isCurrent && !snapshot.isCurrent()))) throw new McpReadError("project_changed");
    if (!fileOperation) throw new McpReadError("unavailable");
    return fileOperation(snapshot, name as FileOperationToolName, args);
  } else if (sourceImportNames.has(name as SourceImportToolName)) {
    if (name === "pile_begin_source_import" && (args.expected_project_instance_id !== snapshot.marker.project_instance_id
      || args.expected_project_revision !== snapshot.marker.project_revision)) throw new McpReadError("project_changed");
    if (!importSource) throw new McpReadError("unavailable");
    return importSource(snapshot, name as SourceImportToolName, args);
  } else if (optimizationControlNames.has(name as OptimizationControlToolName)) {
    if (name === "pile_start_optimization" && (args.expected_project_instance_id !== snapshot.marker.project_instance_id
      || args.expected_project_revision !== snapshot.marker.project_revision
      || (snapshot.isCurrent && !snapshot.isCurrent()))) throw new McpReadError("project_changed");
    if (!optimize) throw new McpReadError("unavailable");
    return optimize(snapshot, name as OptimizationControlToolName, args);
  } else if (writeNames.has(name as PileMcpWriteToolName)) {
    if (args.expected_project_instance_id !== snapshot.marker.project_instance_id
      || args.expected_project_revision !== snapshot.marker.project_revision
      || (snapshot.isCurrent && !snapshot.isCurrent())) throw new McpReadError("project_changed");
    if (!write) throw new McpReadError("unavailable");
    result = await write(snapshot, name as PileMcpWriteToolName, args);
    return result;
  } else if (sourceNames.has(name as ProjectSourceToolName)) {
    result = await readProjectSourceTool(snapshot, name as ProjectSourceToolName, args);
  } else if (planNames.has(name as PlanAssessmentToolName)) {
    result = await readPlanAssessment(snapshot, name as PlanAssessmentToolName, args);
  } else {
    result = readPileTool(snapshot.state, snapshot.marker, name as PileToolName, args, snapshot.analysisReady !== false);
    if (name === "pile_get_load_point") {
      const groups = requireCurrentGroups(snapshot.groups);
      const id = args.load_point_id as number;
      result.data.effective_group = groups.find((group) => group.load_point_ids.includes(id)) ?? null;
    }
  }
  if (snapshot.isCurrent && !snapshot.isCurrent()) throw new McpReadError("project_changed");
  return result;
}

function response(id: string | number | null, result: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function error(id: string | number | null, code: number, message: string) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

export function createMcpDispatcher(getSnapshot: () => McpSnapshot, write?: McpWriteHandler, canWrite: () => boolean = () => true, optimize?: OptimizationControlHandler, importSource?: SourceImportHandler, fileOperation?: FileOperationHandler, importPilePlan?: PilePlanImportHandler) {
  return async (body: string): Promise<string> => {
    let request: Record<string, unknown>;
    try { request = JSON.parse(body); }
    catch { return error(null, -32700, "Parse error"); }
    if (!request || typeof request !== "object" || Array.isArray(request) || request.jsonrpc !== "2.0"
      || typeof request.method !== "string") return error(null, -32600, "Invalid request");
    const id = request.id;
    if (id === undefined) return "";
    if (id !== null && typeof id !== "string" && typeof id !== "number") return error(null, -32600, "Invalid request");
    if (request.method === "initialize") {
      return response(id, {
        protocolVersion: "2025-11-25", capabilities: { tools: {} },
        serverInfo: { name: "open-pile-plan-studio", version: "0.4.2" },
        instructions: "Read pile_project_overview before editing. Copy its project_instance_id and project_revision into expected_project_instance_id and expected_project_revision for every write. Writes require the user to enable editing in Pile Plan Studio and return a new revision. Content edits are undoable; pile_activate_plan follows UI navigation without an undo step. Re-read after project_changed or pending analysis/grouping. Assignment writes apply to the full effective group and only to the active plan. For source imports, call pile_get_import_requirements first, convert source content to standard-table CSV, then begin, append, validate, poll status, and apply. Chat attachments are not visible to the app automatically. Optimization first computes a cost-only reference without coherence optimization; budget_basis_points allows extra cost above that reference, not above the current plan. Repeating a run starts a new search and does not guarantee further improvement.",
      });
    }
    if (request.method === "ping") return response(id, {});
    if (request.method === "tools/list") return response(id, { tools: PILE_TOOL_SCHEMAS });
    if (request.method !== "tools/call") return error(id, -32601, "Method not found");
    const params = request.params;
    if (!params || typeof params !== "object" || Array.isArray(params)
      || typeof (params as Record<string, unknown>).name !== "string") return error(id, -32602, "Invalid params");
    try {
      const values = params as { name: string; arguments?: unknown };
      if ((writeNames.has(values.name as PileMcpWriteToolName)
        || optimizationControlNames.has(values.name as OptimizationControlToolName)
        || sourceImportWriteNames.has(values.name as SourceImportToolName)
        || fileOperationWriteNames.has(values.name as FileOperationToolName)
        || pilePlanImportWriteNames.has(values.name as PilePlanImportToolName)) && !canWrite()) throw new McpReadError("write_access_disabled");
      const payload = await routePileTool(getSnapshot(), values.name, values.arguments, write, optimize, importSource, fileOperation, importPilePlan);
      return response(id, {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError: false,
      });
    } catch (failure) {
      const code = failure instanceof McpReadError ? failure.code : "unavailable";
      const ids = failure instanceof McpReadError ? failure.ids : undefined;
      const message = sourceImportErrorMessages[code];
      return response(id, { content: [{ type: "text", text: JSON.stringify({ code,
        ...(message ? { message } : {}), ...(ids ? { ids } : {}) }) }], isError: true });
    }
  };
}
