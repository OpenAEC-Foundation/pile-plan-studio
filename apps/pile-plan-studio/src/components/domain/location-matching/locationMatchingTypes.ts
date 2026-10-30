import type {MatchingPoint, RevisionLocation} from "../../../core/exportRevisionContract.ts";

export type MatchingLocation = {id:number;x_mm:number|null;y_mm:number|null} & Partial<Omit<RevisionLocation, keyof MatchingPoint>> & {name?: string;label?:string};
export type MatchingSelection = import("../../../domain/exports/locationMatchingReview.ts").ReviewSelection;
export type MatchingTool = "new" | "link" | "old";
export type MatchingLines = "none" | "selected" | "all";

export function locationLabel(point: MatchingLocation): string {
  if(point.label)return point.label;
  return point.mark != null ? `Mark ${point.mark} · ID ${point.source_id ?? point.id}` : String(point.source_id ?? point.id);
}

export function hasMatchingCoordinates(point:MatchingLocation):point is MatchingLocation & MatchingPoint {return point.x_mm!=null&&point.y_mm!=null&&Number.isFinite(point.x_mm)&&Number.isFinite(point.y_mm);}
