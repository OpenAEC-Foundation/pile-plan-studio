import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PileBaseShape,
  PileFillPattern,
  PileSymbol,
} from "../../core/projectTypes.ts";
import type { ProjectState } from "../../domain/projectState.ts";
import {
  getActivePilePlan,
  getPilePlanActivation,
  replacePilePlanActivation,
  summarizePilePlanScope,
  unionActivationForPlans,
  unionUsedConfigurationsForPlans,
} from "../../domain/pilePlanActivation.ts";
import {
  findCoactiveLegendConflicts,
  getLegendValuePlanUsage,
  type LegendValuePlanUsage,
  type LegendValuePlanUsageItem,
} from "../../domain/legendConflicts.ts";
import {
  applyAutomaticColors,
  applyAutomaticSymbols,
  applyLegendEditorBulkAction,
  createLegendEditorDraft,
  resetLegendEditorAppearance,
  setLegendColorScheme,
  setLegendEditorItemEnabled,
  setLegendEncodingMode,
  updateLegendColor,
  updateLegendSymbol,
  wouldReassignLegendAppearance,
  type LegendEditorBulkAction,
  type LegendEditorActionResult,
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

const NEUTRAL_SYMBOL_PREVIEW_COLOR = "#6F7B82";

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
  planUsage: LegendValuePlanUsage;
};

export default function LegendEditor({ open, state, onApply, onClose }: Props) {
  const { t, i18n } = useTranslation("common");
  const [draft, setDraft] = useState(() => createLegendEditorDraft(activeFromState(state), state.pileLegend));
  const [scopePlanIds, setScopePlanIds] = useState(() => new Set([state.activePilePlanId]));
  const [openInfoKey, setOpenInfoKey] = useState<string | null>(null);
  const [symbolLimitError, setSymbolLimitError] = useState(false);
  const openedPlanId = useRef(state.activePilePlanId);
  const used = deriveUsedPileConfigurations(state.selectedPileConfigurationsByLoadPoint.values());
  const scopeActivation = unionActivationForPlans(state.pilePlans, scopePlanIds);
  const scopeUsed = unionUsedConfigurationsForPlans(state.pilePlans, scopePlanIds);
  const presentation = buildLegendPresentation({ legend: draft.legend, enabled: draft.active, used });
  const available = {
    pileSizes: presentation.pileSizes.map(({ value }) => value),
    pileTipLevels: presentation.pileTipLevels.map(({ value }) => value),
  };
  const plansWithDraftActivation = replacePilePlanActivation(
    state.pilePlans,
    state.activePilePlanId,
    draft.active,
  );
  const sizeItems: EditorItem[] = presentation.pileSizes.map((item) => ({
    kind: "size",
    ...item,
    planUsage: getLegendValuePlanUsage({
      plans: plansWithDraftActivation,
      currentPlanId: state.activePilePlanId,
      scopePlanIds,
      kind: "size",
      value: item.value,
    }),
  }));
  const tipItems: EditorItem[] = presentation.pileTipLevels.map((item) => ({
    kind: "tip",
    ...item,
    planUsage: getLegendValuePlanUsage({
      plans: plansWithDraftActivation,
      currentPlanId: state.activePilePlanId,
      scopePlanIds,
      kind: "tip",
      value: item.value,
    }),
  }));
  const symbolKind: LegendEditorItemKind = draft.legend.encodingMode === "size-symbol" ? "size" : "tip";
  const colorKind: LegendEditorItemKind = symbolKind === "size" ? "tip" : "size";
  const canReassignSymbols = wouldReassignLegendAppearance(
    draft,
    symbolKind,
    "symbol",
    scopeActivation[symbolKind === "size" ? "pileSizes" : "pileTipLevels"],
  );
  const canReassignColors = wouldReassignLegendAppearance(
    draft,
    colorKind,
    "color",
    scopeActivation[colorKind === "size" ? "pileSizes" : "pileTipLevels"],
  );
  const conflicts = findCoactiveLegendConflicts(draft.legend, plansWithDraftActivation);
  const scopeSummary = summarizePilePlanScope(state.pilePlans.length, scopePlanIds.size);

  useEffect(() => {
    if (!open) return;
    openedPlanId.current = state.activePilePlanId;
    setDraft(createLegendEditorDraft(activeFromState(state), state.pileLegend));
    setScopePlanIds(new Set([state.activePilePlanId]));
    setOpenInfoKey(null);
    setSymbolLimitError(false);
  }, [open]);

  useEffect(() => {
    if (open && openedPlanId.current !== state.activePilePlanId) onClose();
  }, [open, onClose, state.activePilePlanId]);

  const footer = (
    <>
      <button className="settings-btn settings-btn-secondary" type="button" onClick={onClose}>
        {t("cancel")}
      </button>
      <button className="settings-btn settings-btn-primary" type="button" onClick={() => onApply(draft)}>
        {t("apply")}
      </button>
    </>
  );

  return (
    <Modal
      className="legend-editor-dialog"
      closeLabel={t("close")}
      footer={footer}
      height="min(680px, 84vh)"
      onClose={onClose}
      open={open}
      title={t("legend.editorTitle")}
      width={760}
    >
      <div className="legend-editor">
        <div className="legend-editor-configuration">
          <div className="legend-editor-control-row">
            <details className="legend-editor-disclosure legend-editor-encoding">
              <summary>
                <span className="legend-editor-control-label">{t("legend.encoding")}</span>
                <span className="legend-editor-disclosure-value">{t("legend.encodingSummary", {
                  symbol: t(symbolKind === "size" ? "legend.size" : "legend.tip"),
                  color: t(colorKind === "size" ? "legend.size" : "legend.tip"),
                })}</span>
                <span aria-hidden="true" className="legend-editor-disclosure-chevron" />
              </summary>
              <div className="legend-editor-encoding-line">
                <span className="legend-editor-channel-label">{t("legend.symbol")}</span>
                <span className="legend-editor-channel-value">
                  {t(symbolKind === "size" ? "legend.size" : "legend.tip")}
                </span>
                <button
                  aria-label={t("legend.swapEncoding")}
                  className="legend-editor-encoding-swap"
                  title={t("legend.swapEncoding")}
                  type="button"
                  onClick={() => applyEditorActionResult(setLegendEncodingMode(
                    draft,
                    draft.legend.encodingMode === "size-symbol" ? "tip-symbol" : "size-symbol",
                    scopeActivation,
                  ))}
                >
                  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                    <path d="M5 8h12m0 0-3-3m3 3-3 3M19 16H7m0 0 3-3m-3 3 3 3" />
                  </svg>
                </button>
                <span className="legend-editor-channel-label">{t("legend.color")}</span>
                <span className="legend-editor-channel-value">
                  {t(colorKind === "size" ? "legend.size" : "legend.tip")}
                </span>
              </div>
            </details>
            <details className="legend-editor-disclosure legend-editor-scope">
              <summary>
                <span className="legend-editor-control-label">{t("legend.pilePlansInScope")}</span>
                <span className="legend-editor-disclosure-value">{scopeSummary.kind === "current-only"
                  ? t("legend.scopeCurrentOnly")
                  : t("legend.scopeSelection", {
                      selected: scopeSummary.selectedCount,
                      total: scopeSummary.totalCount,
                    })}</span>
                <span aria-hidden="true" className="legend-editor-disclosure-chevron" />
              </summary>
              <div className="legend-editor-plan-scope" role="group" aria-label={t("legend.pilePlansInScope")}>
                {state.pilePlans.map((plan) => (
                  <label key={plan.id}>
                    <input
                      checked={scopePlanIds.has(plan.id)}
                      disabled={plan.id === state.activePilePlanId}
                      type="checkbox"
                      onChange={(event) => setScopePlanIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(plan.id);
                        else next.delete(plan.id);
                        return next;
                      })}
                    />
                    <span>{plan.name}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="legend-editor-auto-actions">
            <button
              className="legend-editor-toolbar-button"
              disabled={!canReassignSymbols}
              title={!canReassignSymbols ? t("legend.noSymbolsToReassign") : undefined}
              type="button"
              onClick={assignSymbols}
            >
              {t("legend.assignSymbols")}
            </button>
            <div className="legend-editor-color-action">
              <button
                className="legend-editor-toolbar-button"
                disabled={!canReassignColors}
                title={!canReassignColors ? t("legend.noColorsToReassign") : undefined}
                type="button"
              onClick={() => setDraft(applyAutomaticColors(
                draft,
                colorKind,
                scopeActivation[colorKind === "size" ? "pileSizes" : "pileTipLevels"],
              ))}
              >
                {t("legend.assignColors")}
              </button>
              <LegendColorSchemeSelect
                value={draft.legend.colorScheme}
                label={t("legend.colorScheme")}
                getSchemeLabel={schemeLabel}
                onChange={(scheme) => setDraft(setLegendColorScheme(
                  draft,
                  scheme,
                  scopeActivation[colorKind === "size" ? "pileSizes" : "pileTipLevels"],
                ))}
              />
            </div>
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
          {draft.legend.colorScheme === "colorblind-friendly" ? (
            <p className="legend-editor-aid">{t("legend.colorblindAid")}</p>
          ) : null}
          {symbolLimitError ? (
            <p className="legend-editor-error" role="alert">{t("legend.symbolLimit", { count: 54 })}</p>
          ) : null}
          {conflicts.map((conflict) => (
            <p className="legend-editor-conflict" key={`${conflict.property}-${conflict.values.join("-")}`}>
              {t("legend.coactiveConflict", {
                property: t(`legend.${conflict.property}`),
                values: conflict.values.map((value) => formatLegendValue(
                  value,
                  conflict.property === "symbol" ? symbolKind : colorKind,
                  i18n.language,
                )).join(", "),
                plans: conflict.pilePlanIds
                  .map((id) => state.pilePlans.find((plan) => plan.id === id)?.name ?? id)
                  .join(", "),
              })}
            </p>
          ))}
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
          <EditorSection
            draft={draft}
            items={sizeItems}
            language={i18n.language}
            openInfoKey={openInfoKey}
            symbolKind={symbolKind}
            title={t("legend.size")}
            onDraftChange={setDraft}
            onInfoOpenChange={setOpenInfoKey}
          />
          <EditorSection
            draft={draft}
            items={tipItems}
            language={i18n.language}
            openInfoKey={openInfoKey}
            symbolKind={symbolKind}
            title={t("legend.tip")}
            onDraftChange={setDraft}
            onInfoOpenChange={setOpenInfoKey}
          />
        </div>
      </div>
    </Modal>
  );

  function BulkButton({ action, label }: { action: LegendEditorBulkAction; label: string }) {
    return (
      <button
        className="legend-editor-toolbar-button"
        type="button"
        onClick={() => setDraft(applyLegendEditorBulkAction(
          draft,
          action,
          available,
          action === "enable-used" ? scopeUsed : used,
        ))}
      >
        {label}
      </button>
    );
  }

  function assignSymbols() {
    const result = applyAutomaticSymbols(
      draft,
      symbolKind,
      scopeActivation[symbolKind === "size" ? "pileSizes" : "pileTipLevels"],
    );
    applyEditorActionResult(result);
  }

  function applyEditorActionResult(result: LegendEditorActionResult) {
    setDraft(result.draft);
    setSymbolLimitError(!result.ok);
  }

  function schemeLabel(scheme: LegendColorScheme): string {
    return t(`legend.colorSchemes.${schemeKey(scheme)}`);
  }
}

type EditorSectionProps = {
  draft: LegendEditorDraft;
  items: EditorItem[];
  language: string;
  openInfoKey: string | null;
  symbolKind: LegendEditorItemKind;
  title: string;
  onDraftChange: (draft: LegendEditorDraft) => void;
  onInfoOpenChange: (key: string | null) => void;
};

function EditorSection(props: EditorSectionProps) {
  const { t } = useTranslation("common");
  const enabledItems = props.items.filter((item) => !item.state.startsWith("disabled"));
  const disabledItems = props.items.filter((item) => item.state.startsWith("disabled"));

  return (
    <section className="legend-editor-section">
      <h3>{props.title}</h3>
      <div className="legend-editor-columns">
        <EditorBlock {...props} className="legend-editor-enabled" items={enabledItems} title={t("legend.enabled")} />
        <EditorBlock {...props} className="legend-editor-disabled" items={disabledItems} title={t("legend.disabled")} />
      </div>
    </section>
  );
}

type EditorBlockProps = EditorSectionProps & { className: string };

function EditorBlock({ className, items, title, ...itemProps }: EditorBlockProps) {
  const { t } = useTranslation("common");
  return (
    <div className={`legend-editor-block ${className}`}>
      <h4>{title}</h4>
      <div className="legend-editor-items">
        {items.length > 0 ? items.map((item) => (
          <EditorItemRow {...itemProps} item={item} key={item.value} />
        )) : <span className="legend-editor-empty">{t("legend.none")}</span>}
      </div>
    </div>
  );
}

type EditorItemRowProps = Omit<EditorSectionProps, "items" | "title"> & { item: EditorItem };

function EditorItemRow({
  draft,
  item,
  language,
  openInfoKey,
  symbolKind,
  onDraftChange,
  onInfoOpenChange,
}: EditorItemRowProps) {
  const { t } = useTranslation("common");
  const isDisabled = item.state.startsWith("disabled");
  const isUnused = item.state === "enabled-unused" || item.state === "disabled-unused";
  const isDisabledUsed = item.state === "disabled-used";
  const label = item.kind === "size" ? `${item.value} mm` : formatTipLevel(item.value, language);
  const infoKey = `${item.kind}:${item.value}`;

  return (
    <div className={`legend-editor-item${isUnused ? " is-unused" : ""}${isDisabledUsed ? " is-warning" : ""}`}>
      <AppearanceControl
        draft={draft}
        item={item}
        label={label}
        symbolKind={symbolKind}
        onDraftChange={onDraftChange}
      />
      <LegendItemPlanInfo
        label={label}
        open={openInfoKey === infoKey}
        usage={item.planUsage}
        onOpenChange={(open) => onInfoOpenChange(open ? infoKey : null)}
      />
      {isDisabledUsed ? (
        <span className="legend-editor-warning" title={t("legend.usedWarning")} aria-label={t("legend.usedWarning")}>!</span>
      ) : null}
      <button
        aria-label={isDisabled ? t("legend.enableItem", { item: label }) : t("legend.disableItem", { item: label })}
        className="legend-editor-activation-button"
        title={isDisabled ? t("legend.enableItem", { item: label }) : t("legend.disableItem", { item: label })}
        type="button"
        onClick={() => onDraftChange(setLegendEditorItemEnabled(draft, item.kind, item.value, isDisabled))}
      >
        <span aria-hidden="true">{isDisabled ? "+" : "−"}</span>
      </button>
    </div>
  );
}

function LegendItemPlanInfo({
  label,
  open,
  usage,
  onOpenChange,
}: {
  label: string;
  open: boolean;
  usage: LegendValuePlanUsage;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("common");
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onOpenChange, open]);

  return (
    <span className="legend-editor-item-info" ref={rootRef}>
      <button
        aria-controls={popoverId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="legend-editor-item-info-trigger"
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
      >
        <span className="legend-editor-item-label">{label}</span>
        {usage.activeOutsideScopeCount > 0 ? (
          <span
            className="legend-editor-outside-scope-chip"
            title={t("legend.activeOutsideScopeTitle", { count: usage.activeOutsideScopeCount })}
          >
            <span aria-hidden="true">ⓘ</span>
            {t("legend.activeOutsideScope", { count: usage.activeOutsideScopeCount })}
          </span>
        ) : null}
      </button>
      {open ? (
        <span
          aria-label={t("legend.planUsageTitle", { item: label })}
          className="legend-editor-plan-info-popover"
          id={popoverId}
          role="dialog"
        >
          <strong>{label}</strong>
          <LegendPlanUsageSection
            items={[usage.current]}
            title={t("legend.currentPilePlan")}
          />
          {usage.inScope.length > 0 ? (
            <LegendPlanUsageSection items={usage.inScope} title={t("legend.inScope")} />
          ) : null}
          {usage.outsideScope.length > 0 ? (
            <LegendPlanUsageSection items={usage.outsideScope} title={t("legend.outsideScope")} />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

function LegendPlanUsageSection({
  items,
  title,
}: {
  items: LegendValuePlanUsageItem[];
  title: string;
}) {
  const { t } = useTranslation("common");
  return (
    <span className="legend-editor-plan-info-section">
      <b>{title}</b>
      {items.map((item) => (
        <span className="legend-editor-plan-info-row" key={item.planId}>
          <span>{item.planName}</span>
          <span>{item.active ? t("legend.active") : t("legend.inactive")}</span>
          <span>{t("legend.assignedLocations", { count: item.assignmentCount })}</span>
        </span>
      ))}
    </span>
  );
}

type AppearanceControlProps = Pick<EditorItemRowProps, "draft" | "item" | "symbolKind" | "onDraftChange"> & {
  label: string;
};

function AppearanceControl({ draft, item, label, symbolKind, onDraftChange }: AppearanceControlProps) {
  const { t } = useTranslation("common");
  if (item.kind === symbolKind) {
    return (
      <LegendSymbolPicker
        value={item.symbol}
        color={NEUTRAL_SYMBOL_PREVIEW_COLOR}
        label={t("legend.changeSymbol", { item: label })}
        fillLabel={t("legend.fillPattern")}
        getShapeLabel={(shape) => t(`legend.baseShapes.${shapeKey(shape)}`)}
        getFillLabel={(fill) => t(`legend.fillPatterns.${fillKey(fill)}`)}
        onChange={(symbol) => onDraftChange(updateLegendSymbol(draft, item.kind, item.value, symbol))}
      />
    );
  }

  return (
    <LegendColorPicker
      value={item.color}
      label={t("legend.changeColor", { item: label })}
      hexLabel={t("legend.hexColor")}
      onChange={(color) => onDraftChange(updateLegendColor(draft, item.kind, item.value, color))}
    />
  );
}

function activeFromState(state: ProjectState) {
  return getPilePlanActivation(getActivePilePlan(state));
}

function formatTipLevel(value: number, language: string): string {
  return `${value.toLocaleString(language, { maximumFractionDigits: 1 })} m`;
}

function formatLegendValue(value: number, kind: LegendEditorItemKind, language: string): string {
  return kind === "size" ? `${value} mm` : formatTipLevel(value, language);
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
