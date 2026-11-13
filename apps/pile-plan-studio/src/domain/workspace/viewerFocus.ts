import type { LoadPoint } from "../../core/projectTypes.ts";

/** One transient navigation request, scoped to the displayed project and plan. */
export type ViewerFocusRequest = {
  loadPoints: readonly LoadPoint[];
  planId: string;
} & (
  | { loadPointIds: number[]; fitLoadPointIds?: readonly number[] }
  | { previewLoadPointId: number; previewCptIds?: readonly number[] }
);
