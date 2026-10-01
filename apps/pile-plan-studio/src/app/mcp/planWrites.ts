import { activatePilePlanState } from "../../domain/pile-plans/pilePlanNavigation.ts";
import { applyLoadPointLockDraft, getActiveLockedLoadPointIds } from "../../domain/pile-plans/loadPointLocking.ts";
import { deletePilePlan } from "../../domain/pile-plans/pilePlanManagement.ts";
import { McpReadError } from "./readModel.ts";
import type { WriteOperation, McpSnapshot } from "./protocol.ts";
import type { PreparedMcpWrite } from "./writeModel.ts";

export function preparePlanWrite(snapshot: McpSnapshot, operation: WriteOperation): PreparedMcpWrite {
  const { name, args } = operation;
  if (name !== "pile_activate_plan" && name !== "pile_delete_plan" && name !== "pile_set_load_point_lock") {
    throw new McpReadError("unknown_tool");
  }
  const { state } = snapshot;
  const plan = state.pilePlans.find((item) => item.id === args.plan_id);
  if (!plan) throw new McpReadError("unknown_id");

  if (name === "pile_activate_plan") {
    const changed = plan.id !== state.activePilePlanId;
    return {
      mode: "navigation", changed,
      data: { plan_id: plan.id, active_plan_id: plan.id, changed },
      update: (current) => changed ? activatePilePlanState(current, plan.id) : current,
    };
  }

  if (name === "pile_delete_plan") {
    if (state.pilePlans.length <= 1) throw new McpReadError("last_plan");
    const transition = deletePilePlan({ ...state, pilePlanId: plan.id });
    return {
      mode: "history", changed: true,
      data: { plan_id: plan.id, active_plan_id: transition.activePilePlanId, changed: true },
      update: (current) => ({ ...current, ...deletePilePlan({ ...current, pilePlanId: plan.id }) }),
    };
  }

  if (name !== "pile_set_load_point_lock") throw new McpReadError("unknown_tool");
  if (plan.id !== state.activePilePlanId) throw new McpReadError("plan_not_active");
  const { load_point_id: loadPointId, locked } = args;
  if (!state.loadPoints.some((point) => point.id === loadPointId)) throw new McpReadError("unknown_id");
  const currentLocks = new Set(getActiveLockedLoadPointIds(state.pilePlans, plan.id));
  const changed = currentLocks.has(loadPointId) !== locked;
  return {
    mode: "history", changed,
    data: { plan_id: plan.id, load_point_id: loadPointId, locked, changed },
    update: (current) => {
      if (!changed) return current;
      const draft = new Set(getActiveLockedLoadPointIds(current.pilePlans, plan.id));
      if (locked) draft.add(loadPointId);
      else draft.delete(loadPointId);
      const selectedLoadPointIds = current.selectedLoadPointIds.filter((id) => !draft.has(id));
      return {
        ...current,
        pilePlans: applyLoadPointLockDraft(current.pilePlans, plan.id, draft),
        selectedLoadPointIds,
        selectedLoadPointId: selectedLoadPointIds.includes(current.selectedLoadPointId ?? -1)
          ? current.selectedLoadPointId : selectedLoadPointIds[0] ?? null,
        selectedCptId: null,
      };
    },
  };
}
