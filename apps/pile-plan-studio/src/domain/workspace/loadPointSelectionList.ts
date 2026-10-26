import type { LoadPointGroup } from "../../core/loadPointGroupContract.ts";
import type { LoadPoint } from "../../core/projectTypes.ts";
import type { LoadPointSelectionContext } from "./selectionState.ts";

export function getLoadPointSelectionContext(state: {
  loadPoints: LoadPoint[]; selectedLoadPointIds: number[]; loadPointSelectionContext?: LoadPointSelectionContext;
}, groups: readonly LoadPointGroup[]): number[] {
  const context = state.loadPointSelectionContext;
  return resolveLoadPointSelectionContext(state.loadPoints, state.selectedLoadPointIds, groups,
    context?.loadPoints === state.loadPoints ? context.ids : []);
}

export type LoadPointSelectionBlock = {
  key: string;
  loadPoints: LoadPoint[];
  groupLoadPointIds: number[] | null;
};

/** Keep the inspection scope while moving through its members; new selections replace it. */
export function resolveLoadPointSelectionContext(
  loadPoints: readonly LoadPoint[], selectedIds: readonly number[], groups: readonly LoadPointGroup[],
  previousIds: readonly number[],
): number[] {
  const retained = selectedIds.length > 0 && selectedIds.every(id => previousIds.includes(id));
  return buildLoadPointSelectionBlocks(loadPoints, retained ? previousIds : selectedIds, groups)
    .flatMap(block => block.loadPoints.map(point => point.id));
}

export function buildLoadPointSelectionBlocks(
  loadPoints: readonly LoadPoint[],
  selectedLoadPointIds: readonly number[],
  groups: readonly LoadPointGroup[],
): LoadPointSelectionBlock[] {
  const selected = new Set(selectedLoadPointIds);
  const groupByPointId = new Map<number, LoadPointGroup>();
  for (const group of groups) {
    if (group.load_point_ids.length > 1 && group.load_point_ids.some(id => selected.has(id))) {
      for (const id of group.load_point_ids) groupByPointId.set(id, group);
    }
  }
  const blocks: LoadPointSelectionBlock[] = [];
  const blockByGroup = new Map<LoadPointGroup, LoadPointSelectionBlock>();
  for (const point of loadPoints) {
    const group = groupByPointId.get(point.id);
    if (group) {
      let block = blockByGroup.get(group);
      if (!block) {
        block = { key: `group:${[...group.load_point_ids].sort((a, b) => a - b).join(",")}`,
          loadPoints: [], groupLoadPointIds: group.load_point_ids };
        blockByGroup.set(group, block);
        blocks.push(block);
      }
      block.loadPoints.push(point);
    } else if (selected.has(point.id)) {
      blocks.push({ key: `point:${point.id}`, loadPoints: [point], groupLoadPointIds: null });
    }
  }
  return blocks;
}
