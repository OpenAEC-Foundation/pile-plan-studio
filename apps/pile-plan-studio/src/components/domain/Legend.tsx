import type { ProjectState } from "../../domain/projectState";
import type { PileConfigurationKey } from "../../core/projectTypes.ts";
import { useTranslation } from "react-i18next";
import { buildLegendPresentation, deriveUsedPileConfigurations } from "../../domain/legendState.ts";
import {
  getLoadPointIdsForLegendSelection,
  replaceLegendSelectionFilter,
  toggleLegendSelectionFilter,
} from "../../viewer/legendSelection.ts";
import { renderPileSymbol } from "../../viewer/pileSymbols.ts";
import { filterCheckIcon, pencilIcon } from "../template/ribbon/icons.ts";
import { getActiveLockedLoadPointIds } from "../../domain/loadPointLocking.ts";

type Props = {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  onEdit: () => void;
};

export default function Legend({ state, onStateChange, onEdit }: Props) {
  const { t, i18n } = useTranslation("common");
  const legend = state.pileLegend;
  const used = deriveUsedPileConfigurations(state.selectedPileConfigurationsByLoadPoint.values());
  const presentation = buildLegendPresentation({
    legend,
    enabled: {
      pileSizes: state.activePileSizes,
      pileTipLevels: state.activePileTipLevels,
    },
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
      legendSelectionFilter: nextFilter,
      selectedLoadPointId: selectedLoadPointIds[0] ?? null,
      selectedLoadPointIds,
      selectedCptId: null,
    });
  }

  function enableUsedOnly() {
    onStateChange({
      ...state,
      activePileSizes: [...used.pileSizes],
      activePileTipLevels: [...used.pileTipLevels],
    });
  }

  return (
    <div className="pile-plan-legend" aria-label={t("legend.aria")}>
      <div className="legend-group is-size">
        <span className="legend-title">{t("legend.size")}</span>
        {presentation.pileSizes.map((item) => {
          if (item.state === "disabled-unused") return null;
          const isSelected = state.legendSelectionFilter.pileSizes.includes(item.value);
          return (
            <button
              aria-pressed={isSelected}
              className={legendItemClass(item.state, isSelected)}
              key={item.value}
              type="button"
              onClick={(event) => selectByLegend("size", item.value, event.shiftKey)}
            >
              {presentation.encodingMode === "size-symbol" ? (
                <span
                  className="legend-symbol"
                  dangerouslySetInnerHTML={{ __html: renderLegendSymbol(item.symbol) }}
                />
              ) : <span className="legend-color" style={{ backgroundColor: item.color }} />}
              <span className="legend-item-label">{item.value} mm</span>
              {item.state === "disabled-used" ? <LegendWarning /> : null}
            </button>
          );
        })}
      </div>
      <div className="legend-group is-tip">
        <span className="legend-title">{t("legend.tip")}</span>
        {presentation.pileTipLevels.map((item) => {
          if (item.state === "disabled-unused") return null;
          const isSelected = state.legendSelectionFilter.pileTipLevels.includes(item.value);
          return (
            <button
              aria-pressed={isSelected}
              className={legendItemClass(item.state, isSelected)}
              key={item.value}
              type="button"
              onClick={(event) => selectByLegend("tip", item.value, event.shiftKey)}
            >
              {presentation.encodingMode === "tip-symbol" ? (
                <span
                  className="legend-symbol"
                  dangerouslySetInnerHTML={{ __html: renderLegendSymbol(item.symbol) }}
                />
              ) : <span className="legend-color" style={{ backgroundColor: item.color }} />}
              <span className="legend-item-label">{formatTipLevel(item.value, i18n.language)}</span>
              {item.state === "disabled-used" ? <LegendWarning /> : null}
            </button>
          );
        })}
      </div>
      <div className="legend-actions">
        <button
          aria-label={t("legend.enableUsed")}
          className="legend-control-button legend-control"
          title={t("legend.enableUsed")}
          type="button"
          onClick={enableUsedOnly}
        >
          <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: filterCheckIcon }} />
        </button>
        <button
          aria-label={t("legend.edit")}
          className="legend-control-button legend-control"
          title={t("legend.edit")}
          type="button"
          onClick={onEdit}
        >
          <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: pencilIcon }} />
        </button>
      </div>
    </div>
  );

  function LegendWarning() {
    return (
      <span className="legend-warning" title={t("legend.usedWarning")} aria-label={t("legend.usedWarning")}>
        !
      </span>
    );
  }
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

function formatTipLevel(value: number, language: string): string {
  return `${value.toLocaleString(language, { maximumFractionDigits: 1 })} m`;
}
