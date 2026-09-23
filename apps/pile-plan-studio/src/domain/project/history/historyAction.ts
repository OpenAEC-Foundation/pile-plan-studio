import type { PilePlanData } from "../../../core/projectFile.ts";
import { samePileConfiguration } from "../../../core/pileConfigurationKey.ts";
import type { ProjectContent } from "../projectContent.ts";

export type HistoryActionKind =
  | "pile-change"
  | "cpt-selection"
  | "cpt-settings"
  | "grouping-settings"
  | "group-created"
  | "group-removed"
  | "group-overrides-reset"
  | "group-visibility"
  | "locks"
  | "cost-settings"
  | "legend-settings"
  | "ilp-optimization-settings"
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
  if (before.loadPointGroupingSettings !== after.loadPointGroupingSettings) {
    const overrideAction = inferGroupOverrideAction(
      before.loadPointGroupingSettings,
      after.loadPointGroupingSettings,
    );
    if (overrideAction) return { kind: overrideAction };
    return { kind: "grouping-settings" };
  }
  if (before.showLoadPointGroups !== after.showLoadPointGroups) {
    return { kind: "group-visibility" };
  }
  if (before.pileCostSettings !== after.pileCostSettings) return { kind: "cost-settings" };
  if (before.ilpOptimizationSettings !== after.ilpOptimizationSettings) {
    return { kind: "ilp-optimization-settings" };
  }
  if (before.viewerUtilizationSettings !== after.viewerUtilizationSettings) {
    return { kind: "utilization-settings" };
  }
  if (before.pileLegend !== after.pileLegend
    || after.pilePlans.some((afterPlan) => {
      const beforePlan = beforePlans.get(afterPlan.id);
      return beforePlan !== undefined && (
        !sameNumberArray(beforePlan.activePileSizes, afterPlan.activePileSizes)
        || !sameNumberArray(beforePlan.activePileTipLevelMms, afterPlan.activePileTipLevelMms)
      );
    })) {
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

function inferGroupOverrideAction(
  before: ProjectContent["loadPointGroupingSettings"],
  after: ProjectContent["loadPointGroupingSettings"],
): Extract<HistoryActionKind,
  "group-created" | "group-removed" | "group-overrides-reset"> | null {
  const beforeManual = overrideSet(before.manualGroups);
  const afterManual = overrideSet(after.manualGroups);
  const beforeUngrouped = overrideSet(before.ungroupedGroups);
  const afterUngrouped = overrideSet(after.ungroupedGroups);
  const manualChanged = !sameStringSet(beforeManual, afterManual);
  const ungroupedChanged = !sameStringSet(beforeUngrouped, afterUngrouped);
  if (!manualChanged && !ungroupedChanged) return null;
  if (
    manualChanged
    && ungroupedChanged
    && afterManual.size === 0
    && afterUngrouped.size === 0
  ) {
    return "group-overrides-reset";
  }
  const manualAdded = [...afterManual].some((record) => !beforeManual.has(record));
  const ungroupedRemoved = [...beforeUngrouped].some((record) => !afterUngrouped.has(record));
  return manualAdded || ungroupedRemoved ? "group-created" : "group-removed";
}

function overrideSet(
  records: ProjectContent["loadPointGroupingSettings"]["manualGroups"],
): Set<string> {
  return new Set(records.map(({ loadPointIds }) => (
    [...new Set(loadPointIds)].sort((left, right) => left - right).join(",")
  )));
}

function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function sameNumberArray(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
