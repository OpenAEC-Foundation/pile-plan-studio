import type {MatchingPoint, RevisionLocation} from "../../../core/exportRevisionContract.ts";

export type MatchingLocation = MatchingPoint & Partial<Omit<RevisionLocation, keyof MatchingPoint>> & {name?: string};
export type MatchingSelection = import("../../../domain/exports/locationMatchingReview.ts").ReviewSelection;
export type MatchingTool = "new" | "link" | "old";
export type MatchingLines = "none" | "selected" | "all";

export function locationLabel(point: MatchingLocation): string {
  return point.mark != null ? `Mark ${point.mark} · ID ${point.source_id ?? point.id}` : String(point.source_id ?? point.id);
}
