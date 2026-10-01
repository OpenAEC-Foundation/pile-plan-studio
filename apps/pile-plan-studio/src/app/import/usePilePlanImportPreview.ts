import { useEffect, useRef } from "react";
import { previewPilePlanImportCore } from "../../core/coreClient.ts";
import type { PilePlanImportDraft } from "../../components/domain/imports/pilePlanImportModel.ts";
import { createPilePlanImportPreviewController, type PilePlanImportContext } from "./pilePlanImportPreviewController.ts";

export function usePilePlanImportPreview(context: PilePlanImportContext,
  update: (update: (draft: PilePlanImportDraft<File>) => PilePlanImportDraft<File>) => void,
) {
  const latest = useRef({ context, update });
  latest.current = { context, update };
  const controller = useRef<ReturnType<typeof createPilePlanImportPreviewController> | null>(null);
  if (controller.current === null) {
    controller.current = createPilePlanImportPreviewController({
      evaluate: previewPilePlanImportCore,
      currentContext: () => latest.current.context,
      update: updateDraft => latest.current.update(updateDraft),
    });
  }
  const active = controller.current;
  useEffect(() => () => active.invalidate(), [active, context.loadPoints, context.cpts, context.availablePileConfigurations]);
  return active;
}
