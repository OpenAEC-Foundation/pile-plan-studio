import type { ProjectState } from "../../domain/project/projectState.ts";

type Update = (current: ProjectState) => ProjectState;
export function createSymbolScaleHistory({ commit, amend }: {
  commit: (update: Update) => void;
  amend: (update: Update) => void;
}) {
  let phase: "idle" | "commit" | "amend" = "idle";
  return {
    begin() { if (phase === "idle") phase = "commit"; },
    change(symbolScalePercent: number) {
      const update = (current: ProjectState) => ({ ...current, symbolScalePercent });
      if (phase === "amend") { amend(update); return; }
      commit(update);
      if (phase === "commit") phase = "amend";
    },
    end() { phase = "idle"; },
  };
}
