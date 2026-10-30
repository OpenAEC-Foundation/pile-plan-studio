import type { LoadPointGroup } from "../../core/loadPointGroupContract.ts";
import type { LoadPoint } from "../../core/projectTypes.ts";
import type { LoadPointSelectionContext } from "./selectionState.ts";

export function getLoadPointSelectionContext(state: {
  loadPoints: LoadPoint[]; selectedLoadPointIds: number[]; loadPointSelectionContext?: LoadPointSelectionContext;
}, groups: readonly LoadPointGroup[]): number[] {
  const context = state.loadPointSelectionContext;
  if(context?.loadPoints===state.loadPoints&&context.exclusive)return state.selectedLoadPointIds.filter(id=>state.loadPoints.some(p=>p.id===id));
  return resolveLoadPointSelectionContext(state.loadPoints, state.selectedLoadPointIds, groups,
    context?.loadPoints === state.loadPoints ? context.ids : []);
}

export type LoadPointSelectionBlock = {
  key: string;
  loadPoints: LoadPoint[];
  groupLoadPointIds: number[] | null;
};

const rowOrderCache=new WeakMap<readonly LoadPoint[],readonly LoadPoint[]>();

/** Presentation order follows default Mark numbering: descending Y rows (1 mm), ascending X. */
function inRowOrder(points:readonly LoadPoint[]):readonly LoadPoint[]{
  const cached=rowOrderCache.get(points);if(cached)return cached;
  const ordered=[...points].sort((a,b)=>b.y_mm-a.y_mm||a.id-b.id);
  for(let start=0;start<ordered.length;){
    const anchor=ordered[start].y_mm;
    let end=start+1;
    while(end<ordered.length&&anchor-ordered[end].y_mm<=1)end++;
    const row=ordered.slice(start,end).sort((a,b)=>a.x_mm-b.x_mm||b.y_mm-a.y_mm||a.id-b.id);
    for(let i=0;i<row.length;i++)ordered[start+i]=row[i];
    start=end;
  }
  rowOrderCache.set(points,ordered);return ordered;
}

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
  for (const point of inRowOrder(loadPoints)) {
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
