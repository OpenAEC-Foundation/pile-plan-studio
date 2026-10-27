import type { LoadPoint } from "../../core/projectTypes.ts";

/** One transient navigation request, scoped to the displayed project and plan. */
export type ViewerFocusRequest = {
  loadPointIds: number[];
  loadPoints: readonly LoadPoint[];
  planId: string;
};
