import type { LoadPointGroup } from "../core/loadPointGroupContract.ts";

export type LoadPointGroupSelection = {
  groupCount: number;
  markedLoadPointIds: number[];
  relatedLoadPointIds: number[];
};

export type LoadPointGroupNotice = {
  translationKey: "pileOptions.groupSelection.single" | "pileOptions.groupSelection.multiple";
  values: { count: number; markedCount?: number };
};

export function expandSelectionToGroups(
  selectedIds: Iterable<number>,
  groups: LoadPointGroup[],
): number[] {
  const expanded = new Set(selectedIds);
  for (const group of groups) {
    if (group.load_point_ids.some((loadPointId) => expanded.has(loadPointId))) {
      group.load_point_ids.forEach((loadPointId) => expanded.add(loadPointId));
    }
  }
  return [...expanded].sort((left, right) => left - right);
}

export function getCompleteSelectedGroupLoadPointIds(
  selectedIds: Iterable<number>,
  groups: LoadPointGroup[],
): number[] {
  const selected = new Set(selectedIds);
  const completeGroupMembers = new Set<number>();
  for (const group of groups) {
    if (
      group.load_point_ids.length > 1
      && group.load_point_ids.every((loadPointId) => selected.has(loadPointId))
    ) {
      group.load_point_ids.forEach((loadPointId) => completeGroupMembers.add(loadPointId));
    }
  }
  return [...completeGroupMembers].sort((left, right) => left - right);
}

export function getLoadPointGroupSelection(input: {
  selectedLoadPointIds: number[];
  groups: LoadPointGroup[];
}): LoadPointGroupSelection {
  const selectedLoadPointIds = new Set(input.selectedLoadPointIds);
  const markedLoadPointIds = new Set(selectedLoadPointIds);
  let groupCount = 0;

  for (const group of input.groups) {
    if (
      group.load_point_ids.length > 1
      && group.load_point_ids.some((loadPointId) => selectedLoadPointIds.has(loadPointId))
    ) {
      groupCount += 1;
      group.load_point_ids.forEach((loadPointId) => markedLoadPointIds.add(loadPointId));
    }
  }

  const sortedMarkedLoadPointIds = [...markedLoadPointIds].sort((left, right) => left - right);
  return {
    groupCount,
    markedLoadPointIds: sortedMarkedLoadPointIds,
    relatedLoadPointIds: sortedMarkedLoadPointIds.filter(
      (loadPointId) => !selectedLoadPointIds.has(loadPointId),
    ),
  };
}

export function getLoadPointGroupNotice(input: {
  selection: LoadPointGroupSelection;
  selectedLoadPointCount: number;
}): LoadPointGroupNotice | null {
  if (input.selection.groupCount === 0) return null;

  if (input.selectedLoadPointCount === 1) {
    return {
      translationKey: "pileOptions.groupSelection.single",
      values: { count: input.selection.markedLoadPointIds.length },
    };
  }

  return {
    translationKey: "pileOptions.groupSelection.multiple",
    values: {
      count: input.selection.groupCount,
      markedCount: input.selection.markedLoadPointIds.length,
    },
  };
}
