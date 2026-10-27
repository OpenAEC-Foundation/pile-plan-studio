import { MAX_PILE_CAP_COUNT } from "../../../core/pileCapProposalTypes.ts";
import type { ProjectedPileCap } from "../../../viewer/pileCapProposalGeometry.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { pileConfigurationToken } from "../../../core/pileConfigurationKey.ts";
import { getConfigurationActivationPresentation } from "../../../domain/legend/legendActivationPresentation.ts";
import { getPilePlanActivation } from "../../../domain/pile-plans/pilePlanActivation.ts";
import { effectiveSymbolScale } from "../../../viewer/hoverCandidates.ts";
import { getLoadPointMarkerInvalidVisual } from "../../../viewer/loadPointMarker.ts";
import {
  parseLoadPointStatusHalo,
  type ViewerMarkerGraphic,
} from "./viewerMarkerPresentation.ts";

export function buildPileCapMarkerGraphics(
  layouts: readonly ProjectedPileCap[],
  state: ProjectState,
  selectedIds: ReadonlySet<number>,
): ViewerMarkerGraphic[] {
  const plan =
    state.pilePlans.find((p) => p.id === state.activePilePlanId) ??
    state.pilePlans[0];
  return layouts.flatMap((cap, capIndex) => {
    const configuration = cap.preview.proposal.configuration;
    const option = configuration
      ? (cap.preview.options.find(
          (o) =>
            pileConfigurationToken(o.configuration) ===
            pileConfigurationToken(configuration),
        ) ?? null)
      : null;
    const style = configuration
      ? getConfigurationActivationPresentation(
          {
            configuration,
            pile_size_mm: configuration.pile_size_mm,
            pile_tip_level_m: configuration.pile_tip_level_mm / 1000,
          },
          state.pileLegend,
          getPilePlanActivation(plan),
          state.pileCostSettings,
        )
      : null;
    const invalid = getLoadPointMarkerInvalidVisual(
      option,
      state.viewerUtilizationSettings,
    );
    const halo =
      configuration &&
      (!option || cap.preview.status === "missing_cpt_selection")
        ? { kind: "missing" as const, intensity: 0, opacity: 1 }
        : parseLoadPointStatusHalo(
            invalid.className,
            invalid.style,
            false,
            false,
          );
    const selected = cap.sourceIds.every((id) => selectedIds.has(id));
    return cap.points.map((point, index) => ({
      key: `cap:${cap.sourceIds.join("-")}:${index}`,
      id: -(capIndex * MAX_PILE_CAP_COUNT + index + 1),
      kind: "load-point" as const,
      ...point,
      scale: effectiveSymbolScale(state.symbolScalePercent),
      drawPriority: selected ? 40 : 20,
      ring: null,
      halo,
      locked: false,
      opacity: 1,
      appearance: style
        ? {
            type: "pile" as const,
            symbol: style.symbol,
            color: style.color,
            smallDot: style.smallDot,
          }
        : { type: "neutral" as const },
    }));
  });
}
