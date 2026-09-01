import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import type { PileConfigurationKey, PileConfigurationOption } from "./projectTypes.ts";

export type SpatialEdge = {
  from_site_id: number;
  to_site_id: number;
};

export type SpatialFace = {
  boundary_site_ids: number[];
};

export type SpatialNeighborhood = {
  sites: Array<{
    site_id: number;
    load_point_ids: number[];
    x_mm: number;
    y_mm: number;
  }>;
  edges: SpatialEdge[];
  faces: SpatialFace[];
};

export type SpatialPileAssignment = PileConfigurationKey;

export type TipLevelRegionTopology = {
  groups: Array<{
    pile_tip_level_mm: number;
    legend_value_m: number;
    site_ids: number[];
    edges: SpatialEdge[];
    faces: SpatialFace[];
  }>;
};

type CorePileConfigurationOption = Omit<PileConfigurationOption, "isOption"> & {
  is_option: boolean;
};

type TipLevelRegionTopologyInput = {
  neighborhood: SpatialNeighborhood;
  selectedAssignments: Map<number, SpatialPileAssignment>;
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>;
};

export type BrowserTipLevelRegionTopologyRequest = {
  neighborhood: SpatialNeighborhood;
  selected_assignments: Map<number, SpatialPileAssignment>;
  options_by_load_point: Map<number, CorePileConfigurationOption[]>;
};

export type DesktopTipLevelRegionTopologyRequest = {
  neighborhood: SpatialNeighborhood;
  selected_assignments: Record<string, SpatialPileAssignment>;
  options_by_load_point: Record<string, CorePileConfigurationOption[]>;
};

export function parseSpatialPileAssignments(
  selectedConfigurationsByLoadPoint: Map<number, PileConfigurationKey>,
): Map<number, SpatialPileAssignment> {
  return new Map(
    [...selectedConfigurationsByLoadPoint].map(([loadPointId, configuration]) => [
      loadPointId,
      { ...configuration },
    ]),
  );
}

export function toBrowserTipLevelRegionTopologyRequest(
  input: TipLevelRegionTopologyInput,
): BrowserTipLevelRegionTopologyRequest {
  return {
    neighborhood: input.neighborhood,
    selected_assignments: toWasmNumberKeyedMap(input.selectedAssignments),
    options_by_load_point: toWasmNumberKeyedMap(toCoreOptionsByLoadPoint(input.optionsByLoadPoint)),
  };
}

export function toDesktopTipLevelRegionTopologyRequest(
  input: TipLevelRegionTopologyInput,
): DesktopTipLevelRegionTopologyRequest {
  return {
    neighborhood: input.neighborhood,
    selected_assignments: toStringKeyedRecord(input.selectedAssignments),
    options_by_load_point: toStringKeyedRecord(toCoreOptionsByLoadPoint(input.optionsByLoadPoint)),
  };
}

function toCoreOptionsByLoadPoint(
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>,
): Map<number, CorePileConfigurationOption[]> {
  return new Map(
    [...optionsByLoadPoint].map(([loadPointId, options]) => [
      loadPointId,
      options.map(({ isOption, ...option }) => ({ ...option, is_option: isOption })),
    ]),
  );
}
