import { useEffect, useRef } from "react";
import { previewImportSourceCore } from "../../core/coreClient.ts";
import type { ImportSourceInput } from "../../core/coreImportContract.ts";
import type { ProjectImportPreview } from "../../core/adviceImportContract.ts";
import type { ImportDrafts, ProjectImportMode } from "../../domain/imports/projectImportModel.ts";
import { createAdviceImportPreviewController } from "./adviceImportPreviewController.ts";

export function useAdviceImportPreviews(drafts: ImportDrafts<File>, update: (f: (d: ImportDrafts<File>) => ImportDrafts<File>) => void,
  mode: ProjectImportMode, context: string, evaluate: (mode: ProjectImportMode, sources: ImportSourceInput[]) => Promise<ProjectImportPreview>) {
  const latest = useRef({ drafts, update, mode, context, evaluate });
  latest.current = { drafts, update, mode, context, evaluate };
  const controller = useRef<ReturnType<typeof createAdviceImportPreviewController> | null>(null);
  controller.current ??= createAdviceImportPreviewController({
    readDrafts: () => latest.current.drafts, update: fn => latest.current.update(fn),
    readMode: () => latest.current.mode, contextKey: () => latest.current.context,
    discoverSource: previewImportSourceCore, previewProject: (m, s) => latest.current.evaluate(m, s),
  });
  const active = controller.current;
  const discoveryKey = drafts.advice?.sources.map(s => `${s.id}:${s.discovery.status}`).join("|");
  useEffect(() => { for (const source of latest.current.drafts.advice?.sources ?? []) {
    if (source.discovery.status === "empty") void active.discover(source.id);
  } }, [active, discoveryKey]);
  useEffect(() => { void active.preview(); }, [active, drafts.advice?.generation, drafts["load-points"], drafts.cpts, mode, context]);
  useEffect(() => () => active.invalidate(), [active]);
  return active;
}
