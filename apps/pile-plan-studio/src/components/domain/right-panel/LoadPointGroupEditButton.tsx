import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  LoadPointGroup,
  LoadPointGroupEditAction,
  LoadPointGroupEditPreview,
} from "../../../core/loadPointGroupContract.ts";
import {
  buildLoadPointGroupEditButtonModel,
  getLoadPointGroupEditAction,
} from "./loadPointGroupEditModel.ts";

type PreviewState = {
  key: string;
  pending: boolean;
  preview: LoadPointGroupEditPreview | null;
};

export default function LoadPointGroupEditButton({
  selectedLoadPointIds,
  groups,
  editPending,
  onPreview,
  onApply,
}: {
  selectedLoadPointIds: number[];
  groups: LoadPointGroup[];
  editPending: boolean;
  onPreview: (
    action: LoadPointGroupEditAction,
    selectedLoadPointIds?: number[],
  ) => Promise<LoadPointGroupEditPreview | null>;
  onApply: (
    action: LoadPointGroupEditAction,
    selectedLoadPointIds?: number[],
  ) => Promise<void>;
}) {
  const { t } = useTranslation("rightPanel");
  const selectedIds = [...new Set(selectedLoadPointIds)].sort((left, right) => left - right);
  const action = getLoadPointGroupEditAction(selectedIds, groups);
  const requestKey = action ? `${action}:${selectedIds.join(",")}` : "";
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);

  useEffect(() => {
    let current = true;
    if (!action) return () => { current = false; };
    setPreviewState({ key: requestKey, pending: true, preview: null });
    void onPreview(action, selectedIds).then((preview) => {
      if (current) setPreviewState({ key: requestKey, pending: false, preview });
    }).catch(() => {
      if (current) setPreviewState({ key: requestKey, pending: false, preview: null });
    });
    return () => { current = false; };
  }, [action, onPreview, requestKey]);

  if (!action) return null;
  const currentPreview = previewState?.key === requestKey ? previewState : null;
  const buttonModel = buildLoadPointGroupEditButtonModel({
    action,
    editPending,
    previewPending: currentPreview?.pending ?? true,
    preview: currentPreview?.preview ?? null,
  });
  const tooltip = buttonModel.tooltipReason
    ? t(`groupActions.blocked.${buttonModel.tooltipReason}`)
    : undefined;

  return (
    <span
      aria-label={tooltip}
      className="load-point-group-edit-control"
      tabIndex={tooltip ? 0 : undefined}
      title={tooltip}
    >
      <button
        className="load-point-group-edit-button"
        disabled={buttonModel.disabled}
        type="button"
        onClick={() => void onApply(action, selectedIds)}
      >
        {t(action === "group" ? "groupActions.group" : "groupActions.ungroup")}
      </button>
    </span>
  );
}
