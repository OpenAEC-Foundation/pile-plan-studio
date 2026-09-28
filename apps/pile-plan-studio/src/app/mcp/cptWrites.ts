import { applyManualCptSelectionUpdates } from "../../domain/cpt-selection/cptSettingsModel.ts";
import { McpReadError } from "./readModel.ts";
import type { McpSnapshot, PileMcpWriteToolName } from "./protocol.ts";
import type { PreparedMcpWrite } from "./writeModel.ts";

export function prepareCptWrite(snapshot: McpSnapshot, name: PileMcpWriteToolName,
  args: Record<string, unknown>): PreparedMcpWrite {
  const { state } = snapshot;
  if (state.cptSelectionEditDraft) throw new McpReadError("editing_in_progress");
  const loadPointId = args.load_point_id as number;
  if (!state.loadPoints.some((point) => point.id === loadPointId)) throw new McpReadError("unknown_id");
  const requested = name === "pile_set_manual_cpts" ? args.cpt_ids as number[] : null;
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
