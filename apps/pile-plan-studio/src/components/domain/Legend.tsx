import type { ProjectState } from "../../domain/projectState";
import { useTranslation } from "react-i18next";
import { applyLegendEditorBulkAction } from "../../domain/legendEditorModel.ts";
import { buildLegendPresentation, deriveUsedPileConfigurations } from "../../domain/legendState.ts";
import { getLegendItems } from "../../viewer/legend.ts";
import {
  getLoadPointIdsForLegendSelection,
  replaceLegendSelectionFilter,
  toggleLegendSelectionFilter,
} from "../../viewer/legendSelection.ts";
import { renderPileSymbol } from "../../viewer/pileSymbols.ts";
import { filterCheckIcon, pencilIcon } from "../template/ribbon/icons.ts";

type Props = {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  onEdit: () => void;
};

export default function Legend({ state, onStateChange, onEdit }: Props) {
  const { t, i18n } = useTranslation("common");
  const legend = getLegendItems(state.bearingCapacities);
  const used = deriveUsedPileConfigurations(state.selectedPileOptionKeysByLoadPoint.values());
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
    );
    onStateChange({
      ...state,
      legendSelectionFilter: nextFilter,
      selectedLoadPointId: selectedLoadPointIds[0] ?? null,
      selectedLoadPointIds,
      selectedCptId: null,
    });
  }

  function enableUsedOnly() {
    const active = applyLegendEditorBulkAction(
      "enable-used",
      {
        pileSizes: legend.pileSizes.map((item) => item.value),
        pileTipLevels: legend.pileTipLevels.map((item) => item.value),
      },
      used,
    );
    onStateChange({
      ...state,
      activePileSizes: active.pileSizes,
      activePileTipLevels: active.pileTipLevels,
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
              <span
                className="legend-symbol"
                dangerouslySetInnerHTML={{ __html: renderPileSymbol(item.shape, "transparent") }}
              />
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
              <span className="legend-color" style={{ backgroundColor: item.color }} />
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
    [...state.selectedPileOptionKeysByLoadPoint.entries()].map(([loadPointId, key]) => [
      loadPointId,
      optionFromKey(key),
    ]),
  );
}

function optionFromKey(key: string) {
  const [pileSize, pileTipLevel] = key.split("|").map(Number);
  if (!Number.isFinite(pileSize) || !Number.isFinite(pileTipLevel)) {
    return null;
  }

  return {
    pile_size_mm: pileSize,
    pile_tip_level_m: pileTipLevel,
    isOption: true,
    governing_cpt_id: null,
    governing_frd_kn: null,
    utilization: null,
    missing_cpt_ids: [],
  };
}

function formatTipLevel(value: number, language: string): string {
  return `${value.toLocaleString(language, { maximumFractionDigits: 1 })} m`;
}
