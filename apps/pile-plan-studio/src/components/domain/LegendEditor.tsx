import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PileBaseShape,
  PileFillPattern,
  PileSymbol,
} from "../../core/projectTypes.ts";
import type { ProjectState } from "../../domain/projectState.ts";
import {
  applyAutomaticColors,
  applyAutomaticSymbols,
  applyLegendEditorBulkAction,
  createLegendEditorDraft,
  resetLegendEditorAppearance,
  setLegendAssignmentScope,
  setLegendColorScheme,
  setLegendEditorItemEnabled,
  setLegendEncodingMode,
  updateLegendColor,
  updateLegendSymbol,
  type LegendEditorBulkAction,
  type LegendEditorDraft,
  type LegendEditorItemKind,
} from "../../domain/legendEditorModel.ts";
import {
  buildLegendPresentation,
  deriveUsedPileConfigurations,
  type LegendPresentationState,
} from "../../domain/legendState.ts";
import type { LegendColorScheme } from "../../viewer/legendColors.ts";
import Modal from "../template/Modal.tsx";
import LegendColorPicker from "./LegendColorPicker.tsx";
import LegendColorSchemeSelect from "./LegendColorSchemeSelect.tsx";
import LegendSymbolPicker from "./LegendSymbolPicker.tsx";
import "./LegendEditor.css";

type Props = {
  open: boolean;
  state: ProjectState;
  onApply: (draft: LegendEditorDraft) => void;
  onClose: () => void;
};

type EditorItem = {
  kind: LegendEditorItemKind;
  value: number;
  state: LegendPresentationState;
  symbol: PileSymbol;
  color: string;
};

export default function LegendEditor({ open, state, onApply, onClose }: Props) {
  const { t, i18n } = useTranslation("common");
  const [draft, setDraft] = useState(() => createLegendEditorDraft(activeFromState(state), state.pileLegend));
  const [symbolLimitError, setSymbolLimitError] = useState(false);
  const openedPlanId = useRef(state.activePilePlanId);
  const used = deriveUsedPileConfigurations(state.selectedPileOptionKeysByLoadPoint.values());
  const presentation = buildLegendPresentation({ legend: draft.legend, enabled: draft.active, used });
  const available = {
    pileSizes: presentation.pileSizes.map(({ value }) => value),
    pileTipLevels: presentation.pileTipLevels.map(({ value }) => value),
  };
  const sizeItems: EditorItem[] = presentation.pileSizes.map((item) => ({ kind: "size", ...item }));
  const tipItems: EditorItem[] = presentation.pileTipLevels.map((item) => ({ kind: "tip", ...item }));
  const symbolKind: LegendEditorItemKind = draft.legend.encodingMode === "size-symbol" ? "size" : "tip";
  const colorKind: LegendEditorItemKind = symbolKind === "size" ? "tip" : "size";

  useEffect(() => {
    if (!open) return;
    openedPlanId.current = state.activePilePlanId;
    setDraft(createLegendEditorDraft(activeFromState(state), state.pileLegend));
    setSymbolLimitError(false);
  }, [open]);

  useEffect(() => {
    if (open && openedPlanId.current !== state.activePilePlanId) onClose();
  }, [open, onClose, state.activePilePlanId]);

  const footer = (
    <>
      <button className="legend-editor-footer-button" type="button" onClick={onClose}>
        {t("cancel")}
      </button>
      <button className="legend-editor-footer-button is-primary" type="button" onClick={() => onApply(draft)}>
        {t("apply")}
      </button>
    </>
  );

  return (
    <Modal
      className="legend-editor-dialog"
      closeLabel={t("close")}
      footer={footer}
      height="min(760px, 88vh)"
      onClose={onClose}
      open={open}
      title={t("legend.editorTitle")}
      width={860}
    >
      <div className="legend-editor">
        <div className="legend-editor-configuration">
          <div className="legend-editor-encoding">
            <span className="legend-editor-control-label">{t("legend.symbolRepresents")}</span>
            <div className="legend-editor-segmented" role="group" aria-label={t("legend.symbolRepresents")}>
              <SegmentButton
                active={draft.legend.encodingMode === "size-symbol"}
                label={t("legend.size")}
                onClick={() => setDraft(setLegendEncodingMode(draft, "size-symbol"))}
              />
              <SegmentButton
                active={draft.legend.encodingMode === "tip-symbol"}
                label={t("legend.tip")}
                onClick={() => setDraft(setLegendEncodingMode(draft, "tip-symbol"))}
              />
            </div>
            <span className="legend-editor-helper">
              {draft.legend.encodingMode === "size-symbol"
                ? t("legend.colorRepresentsTip")
                : t("legend.colorRepresentsSize")}
            </span>
          </div>

          <div className="legend-editor-automatic">
            <div className="legend-editor-scope">
              <span className="legend-editor-control-label">{t("legend.assignmentScope")}</span>
              <div className="legend-editor-segmented" role="group" aria-label={t("legend.assignmentScope")}>
                <SegmentButton
                  active={draft.assignmentScope === "enabled"}
                  label={t("legend.enabledItems")}
                  onClick={() => setDraft(setLegendAssignmentScope(draft, "enabled"))}
                />
                <SegmentButton
                  active={draft.assignmentScope === "all"}
                  label={t("legend.allItems")}
                  onClick={() => setDraft(setLegendAssignmentScope(draft, "all"))}
                />
              </div>
            </div>
            <div className="legend-editor-auto-actions">
              <button className="legend-editor-toolbar-button" type="button" onClick={assignSymbols}>
                {t("legend.assignSymbols")}
              </button>
              <LegendColorSchemeSelect
                value={draft.colorScheme}
                label={t("legend.colorScheme")}
                getSchemeLabel={schemeLabel}
                onChange={(scheme) => setDraft(setLegendColorScheme(draft, scheme))}
              />
              <button
                className="legend-editor-toolbar-button"
                type="button"
                onClick={() => setDraft(applyAutomaticColors(draft, colorKind))}
              >
                {t("legend.assignColors")}
              </button>
              <button
                className="legend-editor-toolbar-button is-secondary"
                type="button"
                onClick={() => {
                  setDraft(resetLegendEditorAppearance(draft, state.bearingCapacities));
                  setSymbolLimitError(false);
                }}
              >
                {t("legend.resetAppearance")}
              </button>
            </div>
            {draft.colorScheme === "colorblind-friendly" ? (
              <p className="legend-editor-aid">{t("legend.colorblindAid")}</p>
            ) : null}
            {symbolLimitError ? (
              <p className="legend-editor-error" role="alert">{t("legend.symbolLimit", { count: 54 })}</p>
            ) : null}
          </div>
        </div>

        {state.legendImportWarnings.length > 0 ? (
          <p className="legend-editor-import-warning">
            {t("legend.importWarnings", { count: state.legendImportWarnings.length })}
          </p>
        ) : null}

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

  function SegmentButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
      <button aria-pressed={active} className={active ? "is-active" : ""} type="button" onClick={onClick}>
        {label}
      </button>
    );
  }

  function BulkButton({ action, label }: { action: LegendEditorBulkAction; label: string }) {
    return (
      <button
        className="legend-editor-toolbar-button"
        type="button"
        onClick={() => setDraft(applyLegendEditorBulkAction(draft, action, available, used))}
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

  function EditorBlock({ className, items, title }: { className: string; items: EditorItem[]; title: string }) {
    return (
      <div className={`legend-editor-block ${className}`}>
        <h4>{title}</h4>
        <div className="legend-editor-items">
          {items.length > 0 ? items.map((item) => <EditorItemRow item={item} key={item.value} />) : (
            <span className="legend-editor-empty">{t("legend.none")}</span>
          )}
        </div>
      </div>
    );
  }

  function EditorItemRow({ item }: { item: EditorItem }) {
    const isDisabled = item.state.startsWith("disabled");
    const isUnused = item.state === "enabled-unused" || item.state === "disabled-unused";
    const isDisabledUsed = item.state === "disabled-used";
    const label = item.kind === "size" ? `${item.value} mm` : formatTipLevel(item.value, i18n.language);

    return (
      <div className={`legend-editor-item${isUnused ? " is-unused" : ""}${isDisabledUsed ? " is-warning" : ""}`}>
        {isDisabled ? null : <AppearanceControl item={item} label={label} />}
        <span className="legend-editor-item-label">{label}</span>
        {isDisabledUsed ? (
          <span className="legend-editor-warning" title={t("legend.usedWarning")} aria-label={t("legend.usedWarning")}>!</span>
        ) : null}
        <button
          aria-label={isDisabled ? t("legend.enableItem", { item: label }) : t("legend.disableItem", { item: label })}
          className="legend-editor-activation-button"
          title={isDisabled ? t("legend.enableItem", { item: label }) : t("legend.disableItem", { item: label })}
          type="button"
          onClick={() => setDraft(setLegendEditorItemEnabled(draft, item.kind, item.value, isDisabled))}
        >
          <span aria-hidden="true">{isDisabled ? "+" : "−"}</span>
        </button>
      </div>
    );
  }

  function AppearanceControl({ item, label }: { item: EditorItem; label: string }) {
    if (item.kind === symbolKind) {
      return (
        <LegendSymbolPicker
          value={item.symbol}
          color={item.color}
          label={t("legend.changeSymbol", { item: label })}
          fillLabel={t("legend.fillPattern")}
          getShapeLabel={(shape) => t(`legend.baseShapes.${shapeKey(shape)}`)}
          getFillLabel={(fill) => t(`legend.fillPatterns.${fillKey(fill)}`)}
          onChange={(symbol) => setDraft(updateLegendSymbol(draft, item.kind, item.value, symbol))}
        />
      );
    }

    return (
      <LegendColorPicker
        value={item.color}
        label={t("legend.changeColor", { item: label })}
        hexLabel={t("legend.hexColor")}
        onChange={(color) => setDraft(updateLegendColor(draft, item.kind, item.value, color))}
      />
    );
  }

  function assignSymbols() {
    const result = applyAutomaticSymbols(draft, symbolKind);
    setSymbolLimitError(!result.ok);
    if (result.ok) setDraft(result.draft);
  }

  function schemeLabel(scheme: LegendColorScheme): string {
    return t(`legend.colorSchemes.${schemeKey(scheme)}`);
  }
}

function activeFromState(state: ProjectState) {
  return { pileSizes: state.activePileSizes, pileTipLevels: state.activePileTipLevels };
}

function formatTipLevel(value: number, language: string): string {
  return `${value.toLocaleString(language, { maximumFractionDigits: 1 })} m`;
}

function shapeKey(shape: PileBaseShape): string {
  return shape.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function fillKey(fill: PileFillPattern): string {
  return fill.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function schemeKey(scheme: LegendColorScheme): string {
  return scheme.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
