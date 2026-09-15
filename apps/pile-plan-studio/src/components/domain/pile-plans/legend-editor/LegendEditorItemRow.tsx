import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { LegendEncodingMode, PileBaseShape, PileFillPattern, PileSymbol } from "../../../../core/projectTypes.ts";
import type { ProjectState } from "../../../../domain/project/projectState.ts";
import type { LegendValuePlanUsage } from "../../../../domain/legend/legendConflicts.ts";
import { setLegendEditorItemEnabled, updateLegendColor, updateLegendSymbol, type LegendEditorDraft, type LegendEditorItemKind } from "../../../../domain/legend/legendEditorModel.ts";
import { formatPileTipLevelMillimetres } from "../../../../domain/formatting.ts";
import LegendColorPicker from "../LegendColorPicker.tsx";
import LegendSymbolPicker from "../LegendSymbolPicker.tsx";
import LegendPlanUsageSection from "./LegendPlanUsageSection.tsx";
import type { LegendEditorItem } from "./LegendEditor.tsx";

const NEUTRAL_SYMBOL_PREVIEW_COLOR = "#6F7B82";

type EditorSectionProps = {
  draft: LegendEditorDraft;
  items: LegendEditorItem[];
  language: string;
  openInfoKey: string | null;
  symbolKind: LegendEditorItemKind;
  encodingMode: LegendEncodingMode;
  pileCostSettings: ProjectState["pileCostSettings"];
  title: string;
  onDraftChange: (draft: LegendEditorDraft) => void;
  onInfoOpenChange: (key: string | null) => void;
};

export default function EditorSection(props: EditorSectionProps) {
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
          <LegendEditorItemRow {...itemProps} item={item} key={item.value} />
        )) : <span className="legend-editor-empty">{t("legend.none")}</span>}
      </div>
    </div>
  );
}

type LegendEditorItemRowProps = Omit<EditorSectionProps, "items" | "title"> & { item: LegendEditorItem };

export function LegendEditorItemRow({
  draft,
  item,
  language,
  openInfoKey,
  symbolKind,
  encodingMode,
  pileCostSettings,
  onDraftChange,
  onInfoOpenChange,
}: LegendEditorItemRowProps) {
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

function costTableSymbol(sizeMm: number, settings: ProjectState["pileCostSettings"]): PileSymbol {
  const shape = settings.items.find(({ pile_size_mm }) => pile_size_mm === sizeMm)?.shape;
  return {
    baseShape: shape === "round" ? "circle" : shape === "square" ? "square" : "diamond",
    fillPattern: "full",
  };
}

function shapeKey(shape: PileBaseShape): string {
  return shape.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function fillKey(fill: PileFillPattern): string {
  return fill.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
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

type AppearanceControlProps = Pick<LegendEditorItemRowProps,
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

