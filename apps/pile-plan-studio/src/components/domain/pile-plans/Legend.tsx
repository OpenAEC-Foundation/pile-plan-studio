import type { ProjectState } from "../../../domain/project/projectState";
import type { PileConfigurationKey } from "../../../core/projectTypes.ts";
import { useTranslation } from "react-i18next";
import { Button, Icon, IconButton, OpenAECProvider } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "../../../openaec/openaec-components.css";
import "./Legend.css";
import { buildLegendPresentation, deriveUsedPileConfigurations } from "../../../domain/legend/legendState.ts";
import {
  getLoadPointIdsForLegendSelection,
  replaceLegendSelectionFilter,
  toggleLegendSelectionFilter,
} from "../../../viewer/legendSelection.ts";
import { renderPileSymbol } from "../../../viewer/pileSymbols.ts";
import { getActiveLockedLoadPointIds } from "../../../domain/pile-plans/loadPointLocking.ts";
import {
  getActivePilePlan,
  getPilePlanActivation,
  replacePilePlanActivation,
} from "../../../domain/pile-plans/pilePlanActivation.ts";
import { INACTIVE_LEGEND_COLOR, SMALL_DOT_SYMBOL } from "../../../domain/legend/legendActivationPresentation.ts";
import type { TipLevelRegionTopologyStatus } from "../pile-plan-viewer/tip-level-regions/useTipLevelRegionTopology.ts";
import { formatPileTipLevelMillimetres } from "../../../domain/formatting.ts";
import { setLoadPointSelection } from "../../../domain/workspace/selectionState.ts";

type Props = {
  readOnly?: boolean;
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  onEdit: () => void;
  tipLevelRegionStatus: TipLevelRegionTopologyStatus;
};

export default function Legend({ readOnly = false, state, onStateChange, onEdit, tipLevelRegionStatus }: Props) {
  const { t, i18n } = useTranslation("common");
  const legend = state.pileLegend;
  const activePlan = getActivePilePlan(state);
  const active = getPilePlanActivation(activePlan);
  const used = deriveUsedPileConfigurations(state.selectedPileConfigurationsByLoadPoint.values());
  const presentation = buildLegendPresentation({
    legend,
    enabled: active,
    used,
  });

  function selectByLegend(kind: "size" | "tip", value: number, extend: boolean) {
    const nextFilter = extend
      ? toggleLegendSelectionFilter(state.legendSelectionFilter, kind, value)
      : replaceLegendSelectionFilter(kind, value);
    const selectedLoadPointIds = getLoadPointIdsForLegendSelection(
      selectedPileOptionsByLoadPoint(state),
      nextFilter,
    ).filter((id) => !getActiveLockedLoadPointIds(state.pilePlans, state.activePilePlanId).includes(id));
    onStateChange({
      ...state,
      ...setLoadPointSelection(state, selectedLoadPointIds),
      legendSelectionFilter: nextFilter,
    });
  }

  function enableUsedOnly() {
    onStateChange({
      ...state,
      pilePlans: replacePilePlanActivation(state.pilePlans, state.activePilePlanId, used),
    });
  }

  return (
    <OpenAECProvider sprite={spriteUrl}>
    <div className="oa-app pile-plan-legend" role="region" aria-label={t("legend.aria")}>
      <div className="legend-group is-size" role="group" aria-label={t("legend.size")}>
        <span className="legend-title">{t("legend.size")}</span>
        {presentation.pileSizes.map((item) => {
          if (item.state === "disabled-unused") return null;
          const isSelected = state.legendSelectionFilter.pileSizes.includes(item.value);
          return (
            <Button kind="quiet" compact
              aria-pressed={isSelected}
              className={legendItemClass(item.state, isSelected)}
              key={item.value}
              type="button"
              onClick={(event) => selectByLegend("size", item.value, event.shiftKey)}
            >
              {presentation.encodingMode === "size-symbol" ? (
                <span
                  className={`legend-symbol${item.state === "disabled-used" ? " is-small-dot" : ""}`}
                  dangerouslySetInnerHTML={{ __html: renderLegendSymbol(
                    item.state === "disabled-used" ? SMALL_DOT_SYMBOL : item.symbol,
                  ) }}
                />
              ) : presentation.encodingMode === "size-color-tip-region" ? (
                <span
                  className="legend-symbol"
                  style={{ color: item.state === "disabled-used" ? INACTIVE_LEGEND_COLOR : item.color }}
                  dangerouslySetInnerHTML={{ __html: renderLegendSymbol(costTableSymbol(item.value, state)) }}
                />
              ) : <span className="legend-color" style={{
                backgroundColor: item.state === "disabled-used" ? INACTIVE_LEGEND_COLOR : item.color,
              }} />}
              <span className="legend-item-label">{item.value} mm</span>
              {item.state === "disabled-used" ? <LegendWarning /> : null}
            </Button>
          );
        })}
      </div>
      <div className="legend-group is-tip" role="group" aria-label={t("legend.tip")}>
        <span className="legend-title">{t("legend.tip")}</span>
        {presentation.encodingMode === "size-color-tip-region" && !state.showTipLevelRegions ? (
          <LegendRegionStatus kind="hidden" />
        ) : presentation.encodingMode === "size-color-tip-region" && tipLevelRegionStatus === "error" ? (
          <LegendRegionStatus kind="unavailable" />
        ) : null}
        {presentation.pileTipLevels.map((item) => {
          if (item.state === "disabled-unused") return null;
          const isSelected = state.legendSelectionFilter.pileTipLevels.includes(item.value);
          return (
            <Button kind="quiet" compact
              aria-pressed={isSelected}
              className={legendItemClass(item.state, isSelected)}
              key={item.value}
              type="button"
              onClick={(event) => selectByLegend("tip", item.value, event.shiftKey)}
            >
              {presentation.encodingMode === "tip-symbol" ? (
                <span
                  className={`legend-symbol${item.state === "disabled-used" ? " is-small-dot" : ""}`}
                  dangerouslySetInnerHTML={{ __html: renderLegendSymbol(
                    item.state === "disabled-used" ? SMALL_DOT_SYMBOL : item.symbol,
                  ) }}
                />
              ) : <span className={`legend-color${presentation.encodingMode === "size-color-tip-region" ? " is-region" : ""}`} style={{
                backgroundColor: item.state === "disabled-used" ? INACTIVE_LEGEND_COLOR : item.color,
              }} />}
              <span className="legend-item-label">{formatPileTipLevelMillimetres(item.value, i18n.language)}</span>
              {item.state === "disabled-used" ? <LegendWarning /> : null}
            </Button>
          );
        })}
      </div>
      <div className="legend-actions">
        <IconButton
          icon="pile.legend-used"
          label={t("legend.enableUsed")}
          className="legend-control-button legend-control"
          data-oa-tip={undefined}
          data-tooltip={readOnly ? undefined : t("legend.enableUsed")}
          disabled={readOnly}
          onClick={enableUsedOnly}
        />
        <IconButton
          icon="pile.legend-edit"
          label={t("legend.edit")}
          className="legend-control-button legend-control"
          data-oa-tip={undefined}
          data-tooltip={readOnly ? undefined : t("legend.edit")}
          disabled={readOnly}
          onClick={onEdit}
        />
      </div>
    </div>
    </OpenAECProvider>
  );

  function LegendWarning() {
    return (
      <span className="legend-warning" data-tooltip={t("legend.usedWarning")} aria-label={t("legend.usedWarning")}>
        !
      </span>
    );
  }

  function LegendRegionStatus({ kind }: { kind: "hidden" | "unavailable" }) {
    const unavailable = kind === "unavailable";
    const label = t(unavailable ? "legend.regionsUnavailable" : "legend.regionsHidden");
    const title = t(unavailable ? "legend.regionsUnavailableTitle" : "legend.regionsHiddenTitle");
    return (
      <span aria-label={title} className={`legend-region-status is-${kind}`} data-tooltip={title}>
        <Icon id={unavailable ? "status.warning" : "status.hidden"} />
        {label}
      </span>
    );
  }
}
function costTableSymbol(sizeMm: number, state: ProjectState) {
  const shape = state.pileCostSettings.items.find(({ pile_size_mm }) => pile_size_mm === sizeMm)?.shape;
  return {
    baseShape: shape === "round" ? "circle" as const : shape === "square" ? "square" as const : "diamond" as const,
    fillPattern: "full" as const,
  };
}

function renderLegendSymbol(symbol: Parameters<typeof renderPileSymbol>[0]): string {
  return renderPileSymbol(symbol, "currentColor", {
    outlineColor: "currentColor",
    neutralFill: "var(--theme-bg)",
  });
}

function legendItemClass(state: string, selected: boolean): string {
  return [
    "legend-item",
    state === "enabled-unused" ? "is-unused" : "",
    state === "disabled-used" ? "is-disabled-used" : "",
    selected ? "is-selected" : "",
  ].filter(Boolean).join(" ");
}

function selectedPileOptionsByLoadPoint(state: ProjectState) {
  return new Map(
    [...state.selectedPileConfigurationsByLoadPoint.entries()].map(([loadPointId, configuration]) => [
      loadPointId,
      optionFromConfiguration(configuration),
    ]),
  );
}

function optionFromConfiguration(configuration: PileConfigurationKey) {
  return {
    configuration: { ...configuration },
    pile_size_mm: configuration.pile_size_mm,
    pile_tip_level_m: configuration.pile_tip_level_mm / 1000,
    isOption: true,
    governing_cpt_id: null,
    governing_frd_kn: null,
    utilization: null,
    missing_cpt_ids: [],
    technicalStatus: "valid" as const,
  };
}
