import type { TechnicalAssignmentSnapshot } from "../../../app/derived-state/technicalAssignmentController.ts";
import type { PileSymbol } from "../../../core/projectTypes.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { getConfigurationActivationPresentation } from "../../../domain/legend/legendActivationPresentation.ts";
import { getPilePlanActivation } from "../../../domain/pile-plans/pilePlanActivation.ts";
import { shouldRaiseCptMarker } from "../../../domain/workspace/viewerInteractions.ts";
import { getCptDisplayName } from "../../../domain/source-data/cptDisplayName.ts";
import { getCptLabelScale } from "../../../viewer/cptLabel.ts";
import { effectiveSymbolScale } from "../../../viewer/hoverCandidates.ts";
import {
  getLoadPointMarkerInvalidVisual,
  getUnselectedLoadPointMarkerState,
  usesNeutralUnassignedMarker,
} from "../../../viewer/loadPointMarker.ts";
import {
  getCptMarkerLayerClass,
  getLoadPointMarkerLayerClass,
} from "../../../viewer/mapMarkerLayer.ts";
import {
  getCptRingRadius,
  getLoadPointRingRadius,
  getMarkerDrawPriority,
  getMarkerHitDiameter,
} from "../../../viewer/markerGraphicGeometry.ts";
import { projectPointPixels, type ProjectViewTransform } from "../../../viewer/viewerGeometry.ts";
import { getSelectedPileOption } from "./viewerPresentation.ts";

export type ViewerMarkerRing = { color: "selection"; radius: number };
export type ViewerMarkerHalo = {
  kind: "above" | "below" | "missing";
  intensity: number;
  opacity: number;
};

export type ViewerMarkerAppearance =
  | { type: "pile"; symbol: PileSymbol; color: string; smallDot: boolean }
  | { type: "neutral" }
  | { type: "optimizer" }
  | { type: "error"; color: string }
  | { type: "cpt"; label: string; labelScale: number; selectedStyle: boolean; inspectedOnly: boolean };

export type ViewerMarkerGraphic = {
  key: string;
  kind: "load-point" | "cpt";
  id: number;
  x: number;
  y: number;
  scale: number;
  drawPriority: number;
  ring: ViewerMarkerRing | null;
  halo: ViewerMarkerHalo | null;
  appearance: ViewerMarkerAppearance;
  locked: boolean;
  opacity: number;
};

export type ViewerMarkerHitTarget = Pick<ViewerMarkerGraphic, "key" | "kind" | "id" | "x" | "y"> & {
  className: string;
  ariaLabel: string;
  hitDiameter: number;
};

export type ViewerMarkerPresentationInput = {
  state: ProjectState;
  technicalAssignment: TechnicalAssignmentSnapshot;
  projectTransform: ProjectViewTransform;
  pileOptionsByLoadPointId: ProjectState["pileOptionsByLoadPointId"];
  selectedLoadPointIds: ReadonlySet<number>;
  completeSelectedGroupLoadPointIds: ReadonlySet<number>;
  relatedLoadPointIds: ReadonlySet<number>;
  lockedLoadPointIds: ReadonlySet<number>;
  contextSelectedCptIds: ReadonlySet<number>;
  governingCptId: number | null;
  isEditingLoadPointLocks: boolean;
  isEditingCptSelection: boolean;
  activeHoverCandidateKey: string | null;
  translate: (key: string) => string;
};

export type ViewerMarkerPresentation = {
  graphics: ViewerMarkerGraphic[];
  hitTargets: ViewerMarkerHitTarget[];
};

export function buildViewerMarkerPresentation(input: ViewerMarkerPresentationInput): ViewerMarkerPresentation {
  const { state } = input;
  const scale = effectiveSymbolScale(state.symbolScalePercent);
  const plan = state.pilePlans.find((candidate) => candidate.id === state.activePilePlanId) ?? state.pilePlans[0]!;
  const active = getPilePlanActivation(plan);
  const graphics: ViewerMarkerGraphic[] = [];
  const hitTargets: ViewerMarkerHitTarget[] = [];

  for (const cpt of state.cpts) {
    const point = projectPointPixels(cpt, input.projectTransform);
    const key = `cpt:${cpt.id}`;
    const cptName = getCptDisplayName(cpt);
    const label = cptName.replace(/^CPT\s*/i, "");
    const inspected = state.selectedCptId === cpt.id;
    const contextSelected = input.contextSelectedCptIds.has(cpt.id);
    const selected = inspected || contextSelected;
    const raised = shouldRaiseCptMarker(selected, input.isEditingCptSelection);
    const governing = input.governingCptId === cpt.id;
    const hovered = input.activeHoverCandidateKey === key;
    const ring = inspected || hovered ? { color: "selection" as const, radius: getCptRingRadius(state.symbolScalePercent) } : null;
    graphics.push({
      key, kind: "cpt", id: cpt.id, ...point, scale,
      drawPriority: getMarkerDrawPriority({ kind: "cpt", foregroundLayer: state.foregroundLayer,
        selected: selected || governing, raised, hovered }),
      ring, halo: null, locked: false, opacity: 1,
      appearance: { type: "cpt", label, labelScale: getCptLabelScale(label),
        selectedStyle: (selected || governing) && !(inspected && !contextSelected),
        inspectedOnly: inspected && !contextSelected },
    });
    hitTargets.push({ key, kind: "cpt", id: cpt.id, ...point,
      ariaLabel: cptName,
      className: `cpt-marker${getCptMarkerLayerClass(selected)}${raised && !selected ? " is-layer-editable-cpt is-editable" : ""}${inspected ? " is-inspected-cpt" : ""}${inspected && !contextSelected ? " is-inspected-only" : ""}${governing ? " is-governing-cpt" : ""}${hovered ? " is-hover-candidate" : ""}`,
      hitDiameter: getMarkerHitDiameter("cpt", state.symbolScalePercent, ring !== null),
    });
  }

  for (const loadPoint of state.loadPoints) {
    const point = projectPointPixels(loadPoint, input.projectTransform);
    const key = `load-point:${loadPoint.id}`;
    const selected = input.selectedLoadPointIds.has(loadPoint.id);
    const groupSelected = input.completeSelectedGroupLoadPointIds.has(loadPoint.id);
    const related = input.relatedLoadPointIds.has(loadPoint.id);
    const locked = input.lockedLoadPointIds.has(loadPoint.id);
    const hovered = input.activeHoverCandidateKey === key;
    const option = getSelectedPileOption(state, loadPoint.id, input.pileOptionsByLoadPointId);
    const style = option ? getConfigurationActivationPresentation(
      option, state.pileLegend, active, state.pileCostSettings,
    ) : null;
    const unselectedState = option ? null : getUnselectedLoadPointMarkerState({
      analysisStatus: input.technicalAssignment.status,
      technicalIssueStatus: input.technicalAssignment.issuesByLoadPointId.get(loadPoint.id)?.status,
      optimizationUnassignedReason: plan.optimizationUnassignedByLoadPoint.get(loadPoint.id),
    });
    const unselectedTitle = unselectedState === "optimizer-unassigned"
      ? input.translate("viewer.optimizerUnassigned")
      : unselectedState ? input.translate(`viewer.unselected.${unselectedState}`) : undefined;
    const unselectedClass = unselectedState && usesNeutralUnassignedMarker(unselectedState)
      ? " is-pending" : unselectedState === "optimizer-unassigned" ? " has-optimizer-unassigned" : "";
    const invalid = getLoadPointMarkerInvalidVisual(option, state.viewerUtilizationSettings);
    const halo = parseLoadPointStatusHalo(invalid.className, invalid.style, locked, input.isEditingLoadPointLocks);
    const ring = getLoadPointRing(selected, groupSelected, hovered, state.symbolScalePercent);
    const appearance: ViewerMarkerAppearance = style
      ? { type: "pile", symbol: style.symbol, color: style.color, smallDot: style.smallDot }
      : unselectedState && usesNeutralUnassignedMarker(unselectedState)
        ? { type: "neutral" }
        : unselectedState === "optimizer-unassigned"
          ? { type: "optimizer" }
          : { type: "error", color: unselectedState === "missing-capacity-data" ? "#d99b00" : "#c92a2a" };
    graphics.push({ key, kind: "load-point", id: loadPoint.id, ...point, scale,
      drawPriority: getMarkerDrawPriority({ kind: "load-point", foregroundLayer: state.foregroundLayer,
        selected: selected || related, raised: false, hovered }),
      ring, halo, appearance, locked,
      opacity: locked ? input.isEditingLoadPointLocks ? 0.45 : 0.28 : 1,
    });
    hitTargets.push({ key, kind: "load-point", id: loadPoint.id, ...point,
      ariaLabel: `Load point ${loadPoint.name}${unselectedTitle ? `. ${unselectedTitle}` : ""}`,
      className: `load-point-marker${getLoadPointMarkerLayerClass(selected || related)}${selected ? " is-selected" : ""}${groupSelected ? " is-group-contour-selected" : ""}${related ? " is-related-group-member" : ""}${locked ? " is-locked" : ""}${unselectedClass}${hovered ? " is-hover-candidate" : ""}`,
      hitDiameter: getMarkerHitDiameter("load-point", state.symbolScalePercent, ring !== null),
    });
  }

  return { graphics: sortMarkerGraphics(graphics), hitTargets };
}

export function getLoadPointRing(
  selected: boolean,
  selectedGroupMember: boolean,
  hovered: boolean,
  symbolScalePercent: number,
): ViewerMarkerRing | null {
  if (hovered || selected && !selectedGroupMember) {
    return { color: "selection", radius: getLoadPointRingRadius(symbolScalePercent) };
  }
  if (selected && selectedGroupMember) return null;
  return null;
}

export function parseLoadPointStatusHalo(
  className: string,
  style: string,
  locked: boolean,
  editingLocks: boolean,
): ViewerMarkerHalo | null {
  const kind = className.includes("is-above-range") ? "above"
    : className.includes("is-below-range") ? "below"
      : className.includes("is-missing") ? "missing" : null;
  if (!kind) return null;
  const intensity = Number(style.match(/--utilization-intensity:\s*([0-9.]+)/)?.[1] ?? 0);
  return { kind, intensity, opacity: locked ? editingLocks ? 0.45 : 0.28 : 1 };
}

export function sortMarkerGraphics<T extends {
  key: string; kind: "load-point" | "cpt"; id: number; drawPriority: number;
}>(graphics: T[]): T[] {
  return [...graphics].sort((left, right) => left.drawPriority - right.drawPriority
    || left.kind.localeCompare(right.kind) || left.id - right.id);
}
