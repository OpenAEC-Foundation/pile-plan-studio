import type { IfcppProject } from "../../core/projectFile.ts";

type Counts = { before: number; after: number; remapped: number; lost: number };

function compareKeys(before: string[], after: string[]): Counts {
  const oldKeys = new Set(before);
  const newKeys = new Set(after);
  const removed = before.filter((key) => !newKeys.has(key)).length;
  const added = after.filter((key) => !oldKeys.has(key)).length;
  const remapped = Math.min(removed, added);
  return { before: before.length, after: after.length, remapped, lost: removed - remapped };
}

function planKeys(project: IfcppProject, kind: "assignments" | "locks"): string[] {
  return (project.user_state.pile_plans ?? []).flatMap((plan) => kind === "assignments"
    ? Object.keys(plan.selected_piles).map((id) => `${plan.id}:${id}`)
    : plan.locked_load_point_ids.map((id) => `${plan.id}:${id}`));
}

export function summarizeImportReconciliation(before: IfcppProject, after: IfcppProject) {
  return {
    assignments: compareKeys(planKeys(before, "assignments"), planKeys(after, "assignments")),
    locks: compareKeys(planKeys(before, "locks"), planKeys(after, "locks")),
    manual_cpt_selections: compareKeys(Object.keys(before.user_state.manual_cpt_selections),
      Object.keys(after.user_state.manual_cpt_selections)),
  };
}
