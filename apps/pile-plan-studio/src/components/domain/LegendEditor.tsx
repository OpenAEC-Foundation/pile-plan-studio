import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PileShape } from "../../core/projectTypes.ts";
import type { ProjectState } from "../../domain/projectState.ts";
import {
  applyLegendEditorBulkAction,
  createLegendEditorDraft,
  toggleLegendEditorItem,
  type LegendEditorBulkAction,
  type LegendEditorDraft,
} from "../../domain/legendEditorModel.ts";
import {
  buildLegendPresentation,
  deriveUsedPileConfigurations,
  type LegendPresentationState,
} from "../../domain/legendState.ts";
import { getLegendItems } from "../../viewer/legend.ts";
import { renderPileSymbol } from "../../viewer/pileSymbols.ts";
import Modal from "../template/Modal.tsx";
import "./LegendEditor.css";

type Props = {
  open: boolean;
  state: ProjectState;
  onApply: (active: LegendEditorDraft) => void;
  onClose: () => void;
};

type EditorItem = {
  kind: "size" | "tip";
  value: number;
  state: LegendPresentationState;
  shape?: PileShape;
  color?: string;
};

export default function LegendEditor({ open, state, onApply, onClose }: Props) {
  const { t, i18n } = useTranslation("common");
  const [draft, setDraft] = useState(() => createLegendEditorDraft(activeFromState(state)));
  const openedPlanId = useRef(state.activePilePlanId);
  const legend = getLegendItems(state.bearingCapacities);
  const used = deriveUsedPileConfigurations(state.selectedPileOptionKeysByLoadPoint.values());
  const presentation = buildLegendPresentation({ legend, enabled: draft, used });
  const available = {
    pileSizes: presentation.pileSizes.map(({ value }) => value),
    pileTipLevels: presentation.pileTipLevels.map(({ value }) => value),
  };
  const sizeItems: EditorItem[] = presentation.pileSizes.map((item) => ({
    kind: "size",
    ...item,
  }));
  const tipItems: EditorItem[] = presentation.pileTipLevels.map((item) => ({
    kind: "tip",
    ...item,
  }));

  useEffect(() => {
    if (!open) return;
    openedPlanId.current = state.activePilePlanId;
    setDraft(createLegendEditorDraft(activeFromState(state)));
  }, [open]);

  useEffect(() => {
    if (open && openedPlanId.current !== state.activePilePlanId) {
      onClose();
    }
  }, [open, onClose, state.activePilePlanId]);

  const footer = (
    <>
      <button className="legend-editor-footer-button" type="button" onClick={onClose}>
        {t("cancel")}
      </button>
      <button
        className="legend-editor-footer-button is-primary"
        type="button"
        onClick={() => onApply(draft)}
      >
        {t("apply")}
      </button>
    </>
  );

  return (
    <Modal
      className="legend-editor-dialog"
      closeLabel={t("close")}
      footer={footer}
      height="min(640px, 84vh)"
      onClose={onClose}
      open={open}
      title={t("legend.editorTitle")}
      width={720}
    >
      <div className="legend-editor">
        <div className="legend-editor-toolbar" aria-label={t("legend.bulkActions")}>
          <BulkButton action="enable-all" label={t("legend.enableAll")} />
          <BulkButton action="enable-used" label={t("legend.enableUsed")} />
          <BulkButton action="disable-all" label={t("legend.disableAll")} />
        </div>
        <div className="legend-editor-sections">
          <EditorSection items={sizeItems} title={t("legend.size")} />
          <EditorSection items={tipItems} title={t("legend.tip")} />
        </div>
      </div>
    </Modal>
  );

  function BulkButton({ action, label }: { action: LegendEditorBulkAction; label: string }) {
    return (
      <button
        className="legend-editor-toolbar-button"
        type="button"
        onClick={() => setDraft(applyLegendEditorBulkAction(action, available, used))}
      >
        {label}
      </button>
    );
  }

  function EditorSection({ items, title }: { items: EditorItem[]; title: string }) {
    const enabledItems = items.filter((item) => !item.state.startsWith("disabled"));
    const disabledItems = items.filter((item) => item.state.startsWith("disabled"));

    return (
      <section className="legend-editor-section">
        <h3>{title}</h3>
        <div className="legend-editor-columns">
          <EditorBlock className="legend-editor-enabled" items={enabledItems} title={t("legend.enabled")} />
          <EditorBlock className="legend-editor-disabled" items={disabledItems} title={t("legend.disabled")} />
        </div>
      </section>
    );
  }

  function EditorBlock({
    className,
    items,
    title,
  }: {
    className: string;
    items: EditorItem[];
    title: string;
  }) {
    return (
      <div className={`legend-editor-block ${className}`}>
        <h4>{title}</h4>
        <div className="legend-editor-items">
          {items.length > 0 ? items.map((item) => <EditorItemButton item={item} key={item.value} />) : (
            <span className="legend-editor-empty">{t("legend.none")}</span>
          )}
        </div>
      </div>
    );
  }

  function EditorItemButton({ item }: { item: EditorItem }) {
    const isDisabled = item.state.startsWith("disabled");
    const isUnused = item.state === "enabled-unused" || item.state === "disabled-unused";
    const isDisabledUsed = item.state === "disabled-used";
    const label = item.kind === "size"
      ? `${item.value} mm`
      : formatTipLevel(item.value, i18n.language);

    return (
      <button
        aria-label={isDisabledUsed ? `${label}. ${t("legend.usedWarning")}` : label}
        className={`legend-editor-item${isUnused ? " is-unused" : ""}${isDisabledUsed ? " is-warning" : ""}`}
        type="button"
        onClick={() => setDraft(toggleLegendEditorItem(draft, item.kind, item.value))}
      >
        {!isDisabled && item.shape ? (
          <span
            className="legend-symbol"
            dangerouslySetInnerHTML={{ __html: renderPileSymbol(item.shape, "transparent") }}
          />
        ) : null}
        {!isDisabled && item.color ? (
          <span className="legend-color" style={{ backgroundColor: item.color }} />
        ) : null}
        <span>{label}</span>
        {isDisabledUsed ? (
          <span className="legend-editor-warning" title={t("legend.usedWarning")} aria-hidden="true">!</span>
        ) : null}
      </button>
    );
  }
}

function activeFromState(state: ProjectState): LegendEditorDraft {
  return {
    pileSizes: state.activePileSizes,
    pileTipLevels: state.activePileTipLevels,
  };
}

function formatTipLevel(value: number, language: string): string {
  return `${value.toLocaleString(language, { maximumFractionDigits: 1 })} m`;
}
