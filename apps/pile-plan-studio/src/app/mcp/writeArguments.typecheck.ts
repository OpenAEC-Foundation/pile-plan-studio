import type { WriteToolArguments, WriteOperation } from "./protocol.ts";

// Compile-time coverage: malformed payloads must fail before reaching Rust.
export function checkWriteArguments(): void {
  const lock: WriteToolArguments["pile_set_load_point_lock"] = { plan_id: "p", load_point_id: 1, locked: true };
  const assignments: WriteToolArguments["pile_set_assignments_bulk"] = {
    plan_id: "p", changes: [{ load_point_id: 1, configuration: null }],
  };
  const settings: WriteToolArguments["pile_set_cpt_selection_settings"] = { settings: { max_distance_m: 20 } };
  const costs: WriteToolArguments["pile_edit_cost_catalog_bulk"] = { actions: [{ action: "remove", pile_size_mm: 320 }] };
  // @ts-expect-error lock state must be boolean
  const wrongLock: WriteToolArguments["pile_set_load_point_lock"] = { plan_id: "p", load_point_id: 1, locked: "true" };
  // @ts-expect-error assignment needs a complete configuration or null
  const wrongAssignment: WriteToolArguments["pile_set_assignments_bulk"] = { plan_id: "p", changes: [{ load_point_id: 1, configuration: { pile_size_mm: 320 } }] };
  // @ts-expect-error settings use the MCP snake_case fields
  const wrongSettings: WriteToolArguments["pile_set_cpt_selection_settings"] = { settings: { maxDistanceM: 20 } };
  // @ts-expect-error manual CPT selection needs an array of IDs
  const wrongCpts: WriteToolArguments["pile_set_manual_cpts"] = { load_point_id: 1, cpt_ids: null };
  // @ts-expect-error cost update uses a supported shape
  const wrongCost: WriteToolArguments["pile_update_cost_item"] = { pile_size_mm: 320, shape: "triangle" };
  // @ts-expect-error operation name and payload must belong together
  const wrongOperation: WriteOperation = { name: "pile_set_manual_cpts", args: { load_point_id: 1, locked: true } };
  void [wrongOperation, lock, assignments, settings, costs, wrongLock, wrongAssignment, wrongSettings, wrongCpts, wrongCost];
}
