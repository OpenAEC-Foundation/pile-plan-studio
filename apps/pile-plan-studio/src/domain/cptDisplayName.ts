import type { Cpt } from "../core/projectTypes.ts";

export function getCptDisplayName(cpt: Pick<Cpt, "id" | "name">): string {
  return cpt.name.trim() || `CPT ${cpt.id}`;
}
