import { useEffect, useRef } from "react";
import { previewImportSourceCore } from "../../core/coreClient.ts";
import type { ImportDrafts } from "../../components/domain/imports/projectImportModel.ts";
import { createProjectImportPreviewController } from "./projectImportPreviewController.ts";

export function useProjectImportPreviews(update: (update: (drafts: ImportDrafts<File>) => ImportDrafts<File>) => void) {
  const latest = useRef(update);
  latest.current = update;
  const controller = useRef<ReturnType<typeof createProjectImportPreviewController> | null>(null);
  if (controller.current === null) {
    controller.current = createProjectImportPreviewController({
      evaluate: previewImportSourceCore,
      update: updateDrafts => latest.current(updateDrafts),
    });
  }
  const active = controller.current;
  useEffect(() => () => active.invalidate(), [active]);
  return active;
}
