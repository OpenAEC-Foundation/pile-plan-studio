import type { ImportFileRole } from "../../core/importFiles.ts";
import type { LoadPointGroupEditAction } from "../../core/loadPointGroupContract.ts";
import type { PilePlanData } from "../../core/projectFile.ts";
import { ProjectDocumentReadError } from "../../core/projectDocumentContract.ts";
import type { HistoryAction } from "../../domain/project/history/historyAction.ts";
import type { InputSourceKind } from "../../domain/project/projectState.ts";
import { getActiveLockedLoadPointIds } from "../../domain/pile-plans/loadPointLocking.ts";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function describeProjectOpenError(error: unknown, t: Translate): string {
  if (!(error instanceof ProjectDocumentReadError)) {
    return error instanceof Error ? error.message : String(error);
  }
  if (error.details.code === "invalid-pile-tip-levels") {
    const first = error.details.errors[0];
    return t("pileTipLevels.projectOpenError", {
      count: error.details.errors.length,
      value: first?.value ?? "",
    });
  }
  if (error.details.code !== "duplicate-load-point-positions") {
    return t(`projectDocument.errors.${error.details.code}`, {
      schema: error.details.code === "invalid-schema" ? error.details.schema : "",
      schemaVersion: error.details.code === "unsupported-schema-version"
        ? error.details.schemaVersion
        : "",
      pilePlanId: error.details.code === "duplicate-pile-plan-id"
        ? error.details.pilePlanId
        : "",
    });
  }
  const first = error.details.positions[0];
  const locations = first.loadPoints
    .map((loadPoint) => `${loadPoint.name} (${loadPoint.id})`)
    .join(", ");
  return t("loadPointPositions.projectOpenError", {
    count: error.details.positions.length,
    locations,
    x: first.xMm,
    y: first.yMm,
  });
}

export function getLoadPointLockSignature(
  pilePlans: PilePlanData[],
  activePilePlanId: string,
): string {
  return getActiveLockedLoadPointIds(pilePlans, activePilePlanId)
    .sort((left, right) => left - right)
    .join(",");
}

export function getLoadPointGroupEditHistoryAction(
  action: LoadPointGroupEditAction,
): HistoryAction {
  if (action === "group") return { kind: "group-created" };
  if (action === "ungroup") return { kind: "group-removed" };
  return { kind: "group-overrides-reset" };
}

export function importRoleForSource(kind: InputSourceKind): ImportFileRole {
  if (kind === "load_points") return "load-points";
  if (kind === "bearing_capacities") return "bearing-capacities";
  return "cpts";
}
