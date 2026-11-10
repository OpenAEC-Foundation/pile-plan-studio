import type { PileDrivingMatchField, PileDrivingTarget } from "../../core/pileDrivingCoreClient.ts";

export function resolvePileDrivingMatchField(
  targets: readonly PileDrivingTarget[],
  override: PileDrivingMatchField | null,
): PileDrivingMatchField {
  return override ?? (targets.some(target => target.revit_mark?.trim()) ? "revit-mark" : "location-id");
}
