import type { ProjectState } from "../../domain/projectState";
import { getLegendItems } from "../../../src/legend.ts";
import {
  shouldDisableActivePileConfigurationToggle,
  toggleActivePileConfiguration,
} from "../../../src/activePileConfigurations.ts";
import {
  getLoadPointIdsForLegendSelection,
  toggleLegendSelectionFilter,
} from "../../../src/legendSelection.ts";
import { renderPileSymbol } from "../../../src/pileSymbols.ts";

type Props = {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
};

export default function Legend({ state, onStateChange }: Props) {
  const legend = getLegendItems(state.bearingCapacities);
  const active = {
    pileSizes: state.activePileSizes,
    pileTipLevels: state.activePileTipLevels,
  };

  function toggleActive(kind: "size" | "tip", value: number) {
    const nextActive = toggleActivePileConfiguration(active, kind, value);
    onStateChange({
      ...state,
      activePileSizes: nextActive.pileSizes,
      activePileTipLevels: nextActive.pileTipLevels,
    });
  }

  function selectByLegend(kind: "size" | "tip", value: number) {
    const nextFilter = toggleLegendSelectionFilter(state.legendSelectionFilter, kind, value);
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

  return (
    <div className="pile-plan-legend" aria-label="Pile symbol legend">
      <div className="legend-group">
        <span className="legend-title">Size</span>
        {legend.pileSizes.map((item) => {
          const isActive = state.activePileSizes.includes(item.value);
          const isSelected = state.legendSelectionFilter.pileSizes.includes(item.value);
          return (
            <button
              className={`legend-item${isActive ? "" : " is-muted"}${isSelected ? " is-selected" : ""}`}
              disabled={shouldDisableActivePileConfigurationToggle(active, "size", item.value)}
              key={item.value}
              type="button"
              onClick={(event) => {
                if (event.shiftKey) {
                  selectByLegend("size", item.value);
                } else {
                  toggleActive("size", item.value);
                }
              }}
            >
              <span
                className="legend-symbol"
                dangerouslySetInnerHTML={{ __html: renderPileSymbol(item.shape, "transparent") }}
              />
              <span>{item.value} mm</span>
            </button>
          );
        })}
      </div>
      <div className="legend-group">
        <span className="legend-title">Tip</span>
        {legend.pileTipLevels.map((item) => {
          const isActive = state.activePileTipLevels.includes(item.value);
          const isSelected = state.legendSelectionFilter.pileTipLevels.includes(item.value);
          return (
            <button
              className={`legend-item${isActive ? "" : " is-muted"}${isSelected ? " is-selected" : ""}`}
              disabled={shouldDisableActivePileConfigurationToggle(active, "tip", item.value)}
              key={item.value}
              type="button"
              onClick={(event) => {
                if (event.shiftKey) {
                  selectByLegend("tip", item.value);
                } else {
                  toggleActive("tip", item.value);
                }
              }}
            >
              <span className="legend-color" style={{ backgroundColor: item.color }} />
              <span>{formatTipLevel(item.value)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
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

function formatTipLevel(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} m`;
}
