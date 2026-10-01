import { applyManualCptSelectionUpdates } from "../../domain/cpt-selection/cptSettingsModel.ts";
import { McpReadError } from "./readModel.ts";
import type { WriteOperation, McpSnapshot } from "./protocol.ts";
import type { PreparedMcpWrite } from "./writeModel.ts";

export function prepareCptWrite(snapshot: McpSnapshot, operation: WriteOperation): PreparedMcpWrite {
  const { name, args } = operation;
  if (name !== "pile_set_manual_cpts" && name !== "pile_use_automatic_cpts") throw new McpReadError("unknown_tool");
  const { state } = snapshot;
  if (state.cptSelectionEditDraft) throw new McpReadError("editing_in_progress");
  const loadPointId = args.load_point_id;
  if (!state.loadPoints.some((point) => point.id === loadPointId)) throw new McpReadError("unknown_id");
  const requested = name === "pile_set_manual_cpts" ? args.cpt_ids : null;
  if (requested && requested.some((id) => !state.cpts.some((cpt) => cpt.id === id))) {
    throw new McpReadError("unknown_id");
  }
  const updates = new Map<number, number[] | null>([[loadPointId, requested]]);
  const changed = applyManualCptSelectionUpdates(state, updates) !== state;
  return {
    mode: "history", changed,
    data: { load_point_id: loadPointId, cpt_ids: requested === null ? null : [...requested].sort((a, b) => a - b),
      changed, analysis_requested: changed },
    update: (current) => changed ? applyManualCptSelectionUpdates(current, updates) : current,
  };
}
