import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { groupLegendConflictsByProperty, type LegendConflict } from "../../../domain/legendConflicts.ts";
import type { LegendEditorItemKind } from "../../../domain/legendEditorModel.ts";
import { formatPileTipLevelMillimetres } from "../../../domain/formatting.ts";
import { getRightAlignedLegendPopoverMaxWidth } from "../legendPickerPlacement.ts";

export default function LegendConflictNotice({
  conflicts,
  pilePlans,
}: {
  conflicts: LegendConflict[];
  pilePlans: Array<{ id: string; name: string }>;
}) {
  const { t, i18n } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [popoverMaxWidth, setPopoverMaxWidth] = useState<number>();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const groups = groupLegendConflictsByProperty(conflicts);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return undefined;
    const root = rootRef.current;
    const boundary = root.closest(".legend-editor");
    const updatePlacement = () => {
      const triggerRect = root.getBoundingClientRect();
      const boundaryRect = boundary?.getBoundingClientRect();
      setPopoverMaxWidth(getRightAlignedLegendPopoverMaxWidth(
        triggerRect.right,
        boundaryRect?.left ?? 0,
        8,
      ));
    };
    updatePlacement();
    const resizeObserver = new ResizeObserver(updatePlacement);
    if (boundary) resizeObserver.observe(boundary);
    resizeObserver.observe(root);
    window.addEventListener("resize", updatePlacement);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePlacement);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span className="legend-editor-conflict-notice" ref={rootRef}>
      <button
        aria-controls={popoverId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="legend-editor-outside-scope-chip legend-editor-conflict-trigger"
        ref={triggerRef}
        title={t("legend.duplicateEncodingTitle")}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <svg aria-hidden="true" className="legend-editor-info-icon" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 7.25v4M8 4.75h.01" />
        </svg>
        {t("legend.duplicateEncoding", { count: conflicts.length })}
      </button>
      {open ? (
        <span
          aria-label={t("legend.duplicateEncodingDetails")}
          className="legend-editor-conflict-popover"
          id={popoverId}
          role="dialog"
          style={{
            maxWidth: popoverMaxWidth,
            minWidth: popoverMaxWidth === undefined
              ? undefined
              : Math.min(280, popoverMaxWidth),
          }}
        >
          <strong>{t("legend.duplicateEncodingDetails")}</strong>
          {(["symbol", "color"] as const).map((property) => groups[property].length > 0 ? (
            <span className="legend-editor-conflict-section" key={property}>
              <b>{t(`legend.${property}`)}</b>
              {groups[property].map((conflict) => (
                <span className="legend-editor-conflict-row" key={`${property}-${conflict.kind}-${conflict.values.join("-")}`}>
                  <b>{t(conflict.kind === "size" ? "legend.size" : "legend.tip")}: </b>
                  {t("legend.duplicateConflict", {
                    values: conflict.values.map((value) => formatLegendValue(
                      value,
                      conflict.kind,
                      i18n.language,
                    )).join(", "),
                    plans: conflict.pilePlanIds
                      .map((id) => pilePlans.find((plan) => plan.id === id)?.name ?? id)
                      .join(", "),
                  })}
                </span>
              ))}
            </span>
          ) : null)}
        </span>
      ) : null}
    </span>
  );
}



function formatLegendValue(value: number, kind: LegendEditorItemKind, language: string): string {
  return kind === "size" ? String(value) + " mm" : formatPileTipLevelMillimetres(value, language);
}
