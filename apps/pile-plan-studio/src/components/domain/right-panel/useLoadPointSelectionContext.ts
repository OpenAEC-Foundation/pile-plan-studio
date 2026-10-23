import { useState } from "react";
import type { LoadPoint } from "../../../core/projectTypes.ts";
import type { LoadPointGroup } from "../../../core/loadPointGroupContract.ts";
import { resolveLoadPointSelectionContext } from "../../../domain/workspace/loadPointSelectionList.ts";

export function useLoadPointSelectionContext(loadPoints: LoadPoint[], selectedIds: number[], groups: LoadPointGroup[]): number[] {
  const [context, setContext] = useState<{ loadPoints: LoadPoint[]; ids: number[] }>({ loadPoints, ids: [] });
  const ids = resolveLoadPointSelectionContext(loadPoints, selectedIds, groups, context.loadPoints === loadPoints ? context.ids : []);
  if (context.loadPoints !== loadPoints || ids.join(",") !== context.ids.join(",")) setContext({ loadPoints, ids });
  return ids;
}
