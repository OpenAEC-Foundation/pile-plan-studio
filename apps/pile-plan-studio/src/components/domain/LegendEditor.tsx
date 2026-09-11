import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PileBaseShape,
  PileFillPattern,
  PileSymbol,
  LegendEncodingMode,
} from "../../core/projectTypes.ts";
import type { ProjectState } from "../../domain/projectState.ts";
import {
  getActivePilePlan,
  getPilePlanActivation,
  replacePilePlanActivation,
  summarizePilePlanScope,
  togglePilePlanScope,
  unionActivationForPlans,
  unionUsedConfigurationsForPlans,
} from "../../domain/pilePlanActivation.ts";
import {
  findCoactiveLegendConflicts,
  getLegendValuePlanUsage,
  groupLegendConflictsByProperty,
  type LegendConflict,
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
import {
  chooseLegendEncodingMode,
  LEGEND_ENCODING_MODES,
} from "./legendEncodingControls.ts";
import { getRightAlignedLegendPopoverMaxWidth } from "./legendPickerPlacement.ts";
import "./LegendEditor.css";
import { formatPileTipLevelMillimetres } from "../../domain/formatting.ts";

const NEUTRAL_SYMBOL_PREVIEW_COLOR = "#6F7B82";

type Props = {
  open: boolean;
  state: ProjectState;
  onApply: (draft: LegendEditorDraft, enableTipLevelRegions?: boolean) => void;
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
  const [enableTipLevelRegions, setEnableTipLevelRegions] = useState(false);
  const openedPlanId = useRef(state.activePilePlanId);
  const encodingDisclosure = useRef<HTMLDetailsElement>(null);
  const used = deriveUsedPileConfigurations(state.selectedPileConfigurationsByLoadPoint.values());
  const scopeActivation = unionActivationForPlans(state.pilePlans, scopePlanIds, {
    pilePlanId: state.activePilePlanId,
    activation: draft.active,
  });
  const scopeUsed = unionUsedConfigurationsForPlans(state.pilePlans, scopePlanIds);
  const presentation = buildLegendPresentation({ legend: draft.legend, enabled: draft.active, used });
  const available = {
    pileSizes: presentation.pileSizes.map(({ value }) => value),
    pileTipLevelMms: presentation.pileTipLevels.map(({ value }) => value),
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
  const dualColorMode = draft.legend.encodingMode === "size-color-tip-region";
  const symbolKind: LegendEditorItemKind = draft.legend.encodingMode === "tip-symbol" ? "tip" : "size";
  const colorKind: LegendEditorItemKind = draft.legend.encodingMode === "size-symbol" ? "tip" : "size";
  const canReassignSymbols = !dualColorMode && wouldReassignLegendAppearance(
    draft, symbolKind, "symbol", scopeActivation[symbolKind === "size" ? "pileSizes" : "pileTipLevelMms"],
  );
  const canReassignSizeColors = wouldReassignLegendAppearance(
    draft, "size", "color", scopeActivation.pileSizes,
  );
  const canReassignTipColors = wouldReassignLegendAppearance(
    draft, "tip", "color", scopeActivation.pileTipLevelMms,
  );
  const canReassignColors = colorKind === "size" ? canReassignSizeColors : canReassignTipColors;
  const missingShapeSizes = dualColorMode
    ? sizeItems.filter(({ value }) => !state.pileCostSettings.items.some(({ pile_size_mm }) => pile_size_mm === value))
    : [];
  const conflicts = findCoactiveLegendConflicts(draft.legend, plansWithDraftActivation);
  const scopeSummary = summarizePilePlanScope(state.pilePlans.length, scopePlanIds.size);
  const allPlansInScope = state.pilePlans.every(({ id }) => scopePlanIds.has(id));

  useEffect(() => {
    if (!open) return;
    openedPlanId.current = state.activePilePlanId;
    setDraft(createLegendEditorDraft(activeFromState(state), state.pileLegend));
    setScopePlanIds(new Set([state.activePilePlanId]));
    setOpenInfoKey(null);
    setSymbolLimitError(false);
    setEnableTipLevelRegions(false);
  }, [open]);

  useEffect(() => {
    if (open && openedPlanId.current !== state.activePilePlanId) onClose();
  }, [open, onClose, state.activePilePlanId]);

  const footer = (
    <>
      <button className="settings-btn settings-btn-secondary" type="button" onClick={onClose}>
        {t("cancel")}
      </button>
      <button className="settings-btn settings-btn-primary" type="button" onClick={applyDraft}>
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
            <details ref={encodingDisclosure} className="legend-editor-disclosure legend-editor-encoding">
              <summary>
                <span className="legend-editor-control-label">{t("legend.encoding")}</span>
                <span className="legend-editor-disclosure-value">{encodingModeLabel(draft.legend.encodingMode)}</span>
                <span aria-hidden="true" className="legend-editor-disclosure-chevron" />
              </summary>
              <div className="legend-editor-encoding-line">
                <div className="legend-editor-encoding-choices" role="radiogroup" aria-label={t("legend.encoding")}>
                  {LEGEND_ENCODING_MODES.map((mode) => {
                    const selected = draft.legend.encodingMode === mode;
                    return (
                      <button
                        aria-checked={selected}
                        className={`legend-editor-encoding-choice${selected ? " is-selected" : ""}`}
                        key={mode}
                        role="radio"
                        type="button"
                        onClick={() => {
                          setEnableTipLevelRegions(chooseLegendEncodingMode({
                            disclosure: encodingDisclosure.current,
                            currentMode: draft.legend.encodingMode,
                            nextMode: mode,
                            enableTipLevelRegions,
                          }));
                          applyEditorActionResult(setLegendEncodingMode(draft, mode, scopeActivation));
                        }}
                      >
                        {encodingModeLabel(mode)}
                      </button>
                    );
                  })}
                </div>
                {dualColorMode && !state.showTipLevelRegions && !enableTipLevelRegions ? (
                  <button
                    className="legend-editor-toolbar-button legend-editor-show-regions"
                    type="button"
                    onClick={() => setEnableTipLevelRegions(true)}
                  >
                    {t("legend.showTipLevelRegions")}
                  </button>
                ) : null}
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
              <div className="legend-editor-plan-scope-content">
                {state.pilePlans.length > 1 ? (
                  <button
                    className="legend-editor-toolbar-button legend-editor-plan-scope-toggle"
                    type="button"
                    onClick={() => setScopePlanIds((current) => togglePilePlanScope(
                      state.pilePlans.map(({ id }) => id),
                      state.activePilePlanId,
                      current,
                    ))}
                  >
                    {t(allPlansInScope ? "legend.selectCurrentPlanOnly" : "legend.selectAllPlans")}
                  </button>
                ) : null}
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
              </div>
            </details>
          </div>
          <div className={`legend-editor-auto-actions${dualColorMode ? " is-dual" : ""}`}>
            {!dualColorMode ? (
              <button
                className="legend-editor-toolbar-button"
                disabled={!canReassignSymbols}
                title={!canReassignSymbols ? t("legend.noSymbolsToReassign") : undefined}
                type="button"
                onClick={assignSymbols}
              >
                {t("legend.assignSymbols")}
              </button>
            ) : null}
            {dualColorMode ? (
              <>
                <ColorAction kind="size" disabled={!canReassignSizeColors} label={t("legend.recolorSizes")} />
                <ColorAction kind="tip" disabled={!canReassignTipColors} label={t("legend.recolorTipLevels")} />
              </>
            ) : <ColorAction kind={colorKind} disabled={!canReassignColors} label={t("legend.assignColors")} />}
          </div>
          <div className="legend-editor-secondary-actions">
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
            {conflicts.length > 0 ? (
              <LegendConflictNotice conflicts={conflicts} pilePlans={state.pilePlans} />
            ) : null}
          </div>
          {[draft.legend.pileSizeColorScheme, draft.legend.pileTipLevelColorScheme].includes("colorblind-friendly") ? (
            <p className="legend-editor-aid">{t("legend.colorblindAid")}</p>
          ) : null}
          {missingShapeSizes.length > 0 ? (
            <p className="legend-editor-error" role="alert">{t("legend.missingCostShape", {
              items: missingShapeSizes.map(({ value }) => `${value} mm`).join(", "),
            })}</p>
          ) : null}
          {symbolLimitError ? (
            <p className="legend-editor-error" role="alert">{t("legend.symbolLimit", { count: 54 })}</p>
          ) : null}
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
            encodingMode={draft.legend.encodingMode}
            pileCostSettings={state.pileCostSettings}
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
            encodingMode={draft.legend.encodingMode}
            pileCostSettings={state.pileCostSettings}
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
      scopeActivation[symbolKind === "size" ? "pileSizes" : "pileTipLevelMms"],
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

  function ColorAction({
    kind,
    disabled,
    label,
  }: {
    kind: LegendEditorItemKind;
    disabled: boolean;
    label: string;
  }) {
    return (
      <div className="legend-editor-color-action">
        <button
          className="legend-editor-toolbar-button"
          disabled={disabled}
          title={disabled ? t("legend.noColorsToReassign") : undefined}
          type="button"
          onClick={() => setDraft(applyAutomaticColors(
            draft, kind, scopeActivation[kind === "size" ? "pileSizes" : "pileTipLevelMms"],
          ))}
        >
          {label}
        </button>
        <LegendColorSchemeSelect
          value={kind === "size"
            ? draft.legend.pileSizeColorScheme
            : draft.legend.pileTipLevelColorScheme}
          label={t("legend.colorScheme")}
          getSchemeLabel={schemeLabel}
          onChange={(scheme) => setDraft(setLegendColorScheme(
            draft, kind, scheme, scopeActivation[kind === "size" ? "pileSizes" : "pileTipLevelMms"],
          ))}
        />
      </div>
    );
  }

  function applyDraft() {
    if (enableTipLevelRegions) onApply(draft, true);
    else onApply(draft);
  }

  function encodingModeLabel(mode: LegendEncodingMode): string {
    const key = mode === "size-symbol"
      ? "sizeSymbolTipColor"
      : mode === "tip-symbol"
        ? "tipSymbolSizeColor"
        : "sizeColorTipRegion";
    return t(`legend.encodingModes.${key}`);
  }
}

type EditorSectionProps = {
  draft: LegendEditorDraft;
  items: EditorItem[];
  language: string;
  openInfoKey: string | null;
  symbolKind: LegendEditorItemKind;
  encodingMode: LegendEncodingMode;
  pileCostSettings: ProjectState["pileCostSettings"];
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
      <div className="legend-editor-section-heading">
        <h3>{props.title}</h3>
        {props.encodingMode === "size-color-tip-region" && props.items[0]?.kind === "size" ? (
          <span>{t("legend.shapeFromCostTable")}</span>
        ) : null}
      </div>
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
  encodingMode,
  pileCostSettings,
  onDraftChange,
  onInfoOpenChange,
}: EditorItemRowProps) {
  const { t } = useTranslation("common");
  const isDisabled = item.state.startsWith("disabled");
  const isUnused = item.state === "enabled-unused" || item.state === "disabled-unused";
  const isDisabledUsed = item.state === "disabled-used";
  const label = item.kind === "size"
    ? `${item.value} mm`
    : formatPileTipLevelMillimetres(item.value, language);
  const infoKey = `${item.kind}:${item.value}`;

  return (
    <div className={`legend-editor-item${isUnused ? " is-unused" : ""}${isDisabledUsed ? " is-warning" : ""}`}>
      <AppearanceControl
        draft={draft}
        item={item}
        label={label}
        symbolKind={symbolKind}
        encodingMode={encodingMode}
        pileCostSettings={pileCostSettings}
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
            <svg aria-hidden="true" className="legend-editor-info-icon" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M8 7.25v4M8 4.75h.01" />
            </svg>
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

function LegendConflictNotice({
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

type AppearanceControlProps = Pick<EditorItemRowProps,
  "draft" | "item" | "symbolKind" | "encodingMode" | "pileCostSettings" | "onDraftChange"> & {
  label: string;
};

function AppearanceControl({
  draft,
  item,
  label,
  symbolKind,
  encodingMode,
  pileCostSettings,
  onDraftChange,
}: AppearanceControlProps) {
  const { t } = useTranslation("common");
  if (encodingMode !== "size-color-tip-region" && item.kind === symbolKind) {
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
      freeColorLabel={t("legend.freeColor")}
      openColorPickerLabel={t("legend.openColorPicker")}
      schemeLabel={t("legend.colorScheme")}
      colorScheme={item.kind === "size"
        ? draft.legend.pileSizeColorScheme
        : draft.legend.pileTipLevelColorScheme}
      colorCount={item.kind === "size"
        ? draft.legend.pileSizes.length
        : draft.legend.pileTipLevels.length}
      previewSymbol={encodingMode === "size-color-tip-region" && item.kind === "size"
        ? costTableSymbol(item.value, pileCostSettings)
        : undefined}
      onChange={(color) => onDraftChange(updateLegendColor(draft, item.kind, item.value, color))}
    />
  );
}

function activeFromState(state: ProjectState) {
  return getPilePlanActivation(getActivePilePlan(state));
}

function costTableSymbol(sizeMm: number, settings: ProjectState["pileCostSettings"]): PileSymbol {
  const shape = settings.items.find(({ pile_size_mm }) => pile_size_mm === sizeMm)?.shape;
  return {
    baseShape: shape === "round" ? "circle" : shape === "square" ? "square" : "diamond",
    fillPattern: "full",
  };
}

function formatLegendValue(value: number, kind: LegendEditorItemKind, language: string): string {
  return kind === "size" ? `${value} mm` : formatPileTipLevelMillimetres(value, language);
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
