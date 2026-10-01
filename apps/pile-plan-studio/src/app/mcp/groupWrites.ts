import { applyLoadPointGroupEditCore } from "../../core/coreClient.ts";
import type { LoadPointGroupEditAction } from "../../core/loadPointGroupContract.ts";
import { McpReadError } from "./readModel.ts";
import { requireCurrentGroups } from "./projectSettingsSources.ts";
import type { WriteOperation, McpSnapshot } from "./protocol.ts";
import type { PreparedMcpWrite } from "./writeModel.ts";

export async function prepareGroupWrite(snapshot: McpSnapshot, operation: WriteOperation, applyGroupEdit: typeof applyLoadPointGroupEditCore = applyLoadPointGroupEditCore,
): Promise<PreparedMcpWrite> {
  const { name, args } = operation;
  if (name !== "pile_group_load_points" && name !== "pile_ungroup_load_points") throw new McpReadError("unknown_tool");
  const { state } = snapshot;
  requireCurrentGroups(snapshot.groups);
  const action: LoadPointGroupEditAction = name === "pile_group_load_points" ? "group" : "ungroup";
  const selectedLoadPointIds = name === "pile_group_load_points"
    ? args.load_point_ids : [args.load_point_id];
  const knownIds = new Set(state.loadPoints.map((point) => point.id));
  if (selectedLoadPointIds.some((id) => !knownIds.has(id))) throw new McpReadError("unknown_id");
  const result = await applyGroupEdit({
    loadPoints: state.loadPoints,
    settings: state.loadPointGroupingSettings,
    selectedLoadPointIds,
    action,
  });
  if (result.status === "blocked") throw new McpReadError(result.reason);
  const nextSettings = {
    ...result.settings,
    manualGroups: result.settings.manualGroups.map(({ loadPointIds }) => ({ loadPointIds: [...loadPointIds] })),
    ungroupedGroups: result.settings.ungroupedGroups.map(({ loadPointIds }) => ({ loadPointIds: [...loadPointIds] })),
  };
  const changed = JSON.stringify(nextSettings) !== JSON.stringify(state.loadPointGroupingSettings);
  return {
    mode: "history", changed,
    data: { action, submitted_load_point_ids: selectedLoadPointIds, changed,
      group_assessment_status: changed ? "pending" : "unchanged" },
    update: (current) => changed ? { ...current, loadPointGroupingSettings: nextSettings } : current,
  };
}
