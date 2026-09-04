import type { PilePlanData } from "../core/projectFile.ts";
import { samePileConfiguration } from "../core/pileConfigurationKey.ts";
import type { ProjectContent } from "./projectContent.ts";

export type HistoryActionKind =
  | "pile-change"
  | "cpt-selection"
  | "cpt-settings"
  | "locks"
  | "cost-settings"
  | "legend-settings"
  | "optimization-settings"
  | "utilization-settings"
  | "pile-plan-created"
  | "pile-plan-deleted"
  | "pile-plan-renamed"
  | "project-name"
  | "project-import"
  | "project-change";

export type HistoryAction = {
  kind: HistoryActionKind;
  count?: number;
  pilePlanName?: string;
};

export function inferHistoryAction(
  before: ProjectContent,
  after: ProjectContent,
): HistoryAction {
  if (
    before.loadPoints !== after.loadPoints
    || before.cpts !== after.cpts
    || before.bearingCapacities !== after.bearingCapacities
  ) {
    return { kind: "project-import" };
  }

  const beforePlans = new Map(before.pilePlans.map((plan) => [plan.id, plan]));
  const afterPlans = new Map(after.pilePlans.map((plan) => [plan.id, plan]));
  const created = after.pilePlans.find((plan) => !beforePlans.has(plan.id));
  if (created) return { kind: "pile-plan-created", pilePlanName: created.name };
  const deleted = before.pilePlans.find((plan) => !afterPlans.has(plan.id));
  if (deleted) return { kind: "pile-plan-deleted", pilePlanName: deleted.name };

  if (before.name !== after.name) return { kind: "project-name" };
  if (before.globalCptSelectionSettings !== after.globalCptSelectionSettings
    || before.cptSelectionSettingsByLoadPoint !== after.cptSelectionSettingsByLoadPoint) {
    return { kind: "cpt-settings" };
  }
  if (before.manualCptIdsByLoadPoint !== after.manualCptIdsByLoadPoint) {
    return {
      kind: "cpt-selection",
      count: changedMapEntryCount(before.manualCptIdsByLoadPoint, after.manualCptIdsByLoadPoint),
    };
  }
  if (before.pileCostSettings !== after.pileCostSettings) return { kind: "cost-settings" };
  if (before.optimizationSettings !== after.optimizationSettings) {
    return { kind: "optimization-settings" };
  }
  if (before.viewerUtilizationSettings !== after.viewerUtilizationSettings) {
    return { kind: "utilization-settings" };
  }
  if (before.activePileSizes !== after.activePileSizes
    || before.activePileTipLevels !== after.activePileTipLevels
    || before.pileLegend !== after.pileLegend) {
    return { kind: "legend-settings" };
  }

  for (const afterPlan of after.pilePlans) {
    const beforePlan = beforePlans.get(afterPlan.id);
    if (!beforePlan) continue;
    if (beforePlan.name !== afterPlan.name) {
      return { kind: "pile-plan-renamed", pilePlanName: afterPlan.name };
    }
  }

  const lockChange = changedPlan(before.pilePlans, afterPlans, (left, right) => (
    changedSetEntryCount(left.lockedLoadPointIds, right.lockedLoadPointIds)
  ));
  if (lockChange && lockChange.count > 0) {
    return { kind: "locks", count: lockChange.count, pilePlanName: lockChange.plan.name };
  }

  const pileChange = changedPlan(before.pilePlans, afterPlans, (left, right) => (
    changedMapEntryCount(
      left.selectedPileConfigurationsByLoadPoint,
      right.selectedPileConfigurationsByLoadPoint,
      samePileConfiguration,
    )
  ));
  if (pileChange && pileChange.count > 0) {
    return {
      kind: "pile-change",
      count: pileChange.count,
      pilePlanName: pileChange.plan.name,
    };
  }

  return { kind: "project-change" };
}

function changedPlan(
  beforePlans: PilePlanData[],
  afterPlans: Map<string, PilePlanData>,
  count: (before: PilePlanData, after: PilePlanData) => number,
): { plan: PilePlanData; count: number } | null {
  for (const before of beforePlans) {
    const after = afterPlans.get(before.id);
    if (!after) continue;
    const changed = count(before, after);
    if (changed > 0) return { plan: after, count: changed };
  }
  return null;
}

function changedMapEntryCount<K, V>(
  before: Map<K, V>,
  after: Map<K, V>,
  equal: (left: V | undefined, right: V | undefined) => boolean = (left, right) => left === right,
): number {
  if (before === after) return 0;
  let count = 0;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (before.has(key) !== after.has(key) || !equal(before.get(key), after.get(key))) count += 1;
  }
  return count;
}

function changedSetEntryCount(before: number[], after: number[]): number {
  if (before === after) return 0;
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  let count = 0;
  for (const value of new Set([...before, ...after])) {
    if (beforeSet.has(value) !== afterSet.has(value)) count += 1;
  }
  return count;
}
