import type {
  LoadPointGroup,
  LoadPointGroupEditAction,
  LoadPointGroupEditBlockReason,
  LoadPointGroupEditPreview,
} from "../../../core/loadPointGroupContract.ts";

export function getLoadPointGroupEditAction(
  selectedLoadPointIds: number[],
  groups: LoadPointGroup[],
): LoadPointGroupEditAction | null {
  const selectedIds = [...new Set(selectedLoadPointIds)].sort((left, right) => left - right);
  const exactSelectedGroup = groups.find((group) => (
    group.load_point_ids.length > 1 && sameIds(group.load_point_ids, selectedIds)
  ));
  return exactSelectedGroup ? "ungroup" : selectedIds.length > 1 ? "group" : null;
}

export function buildLoadPointGroupEditButtonModel(input: {
  action: LoadPointGroupEditAction;
  editPending: boolean;
  previewPending: boolean;
  preview: LoadPointGroupEditPreview | null;
}): { disabled: boolean; tooltipReason: LoadPointGroupEditBlockReason | null } {
  const validationBlocked = !input.editPending
    && !input.previewPending
    && input.preview?.allowed === false;
  return {
    disabled: input.editPending || input.previewPending || input.preview?.allowed !== true,
    tooltipReason: validationBlocked ? input.preview?.reason ?? null : null,
  };
}

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((first, second) => first - second);
  return sortedLeft.every((id, index) => id === right[index]);
}
