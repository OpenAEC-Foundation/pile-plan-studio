import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PileSymbol, LegendEncodingMode } from "../../../../core/projectTypes.ts";
import type { ProjectState } from "../../../../domain/projectState.ts";
import {
  getActivePilePlan,
  getPilePlanActivation,
  replacePilePlanActivation,
  summarizePilePlanScope,
  togglePilePlanScope,
  unionActivationForPlans,
  unionUsedConfigurationsForPlans,
} from "../../../../domain/pilePlanActivation.ts";
import {
  findCoactiveLegendConflicts,
  getLegendValuePlanUsage,
  type LegendValuePlanUsage,
} from "../../../../domain/legendConflicts.ts";
import {
  applyAutomaticColors,
  applyAutomaticSymbols,
  applyLegendEditorBulkAction,
  createLegendEditorDraft,
  resetLegendEditorAppearance,
  setLegendColorScheme,
  setLegendEncodingMode,
  wouldReassignLegendAppearance,
  type LegendEditorBulkAction,
  type LegendEditorActionResult,
  type LegendEditorDraft,
  type LegendEditorItemKind,
} from "../../../../domain/legendEditorModel.ts";
import {
  buildLegendPresentation,
  deriveUsedPileConfigurations,
  type LegendPresentationState,
} from "../../../../domain/legendState.ts";
import type { LegendColorScheme } from "../../../../viewer/legendColors.ts";
import Modal from "../../../template/Modal.tsx";
import LegendColorSchemeSelect from "../LegendColorSchemeSelect.tsx";
import {
  chooseLegendEncodingMode,
  LEGEND_ENCODING_MODES,
} from "../legendEncodingControls.ts";
import "../LegendEditor.css";
import EditorSection from "./LegendEditorItemRow.tsx";
import LegendConflictNotice from "./LegendConflictNotice.tsx";

export type LegendEditorProps = {
  open: boolean;
  state: ProjectState;
  onApply: (draft: LegendEditorDraft, enableTipLevelRegions?: boolean) => void;
  onClose: () => void;
};

export type LegendEditorItem = {
  kind: LegendEditorItemKind;
  value: number;
  state: LegendPresentationState;
  symbol: PileSymbol;
  color: string;
  planUsage: LegendValuePlanUsage;
};

export default function LegendEditor({ open, state, onApply, onClose }: LegendEditorProps) {
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
  const sizeItems: LegendEditorItem[] = presentation.pileSizes.map((item) => ({
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
  const tipItems: LegendEditorItem[] = presentation.pileTipLevels.map((item) => ({
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


function activeFromState(state: ProjectState) {
  return getPilePlanActivation(getActivePilePlan(state));
}


function schemeKey(scheme: LegendColorScheme): string {
  return scheme.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
