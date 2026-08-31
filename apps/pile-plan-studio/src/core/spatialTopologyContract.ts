import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import type { PileConfigurationOption } from "./projectTypes.ts";

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

export type SpatialPileAssignment = {
  pile_size_mm: number;
  pile_tip_level_m: number;
};

export type TipLevelRegionTopology = {
  groups: Array<{
    pile_tip_level_m_key: number;
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
  selectedOptionKeysByLoadPoint: Map<number, string>,
): Map<number, SpatialPileAssignment> {
  const assignments = new Map<number, SpatialPileAssignment>();
  for (const [loadPointId, optionKey] of selectedOptionKeysByLoadPoint) {
    const parts = optionKey.split("|");
    if (parts.length !== 2) {
      continue;
    }
    const pileSizeMm = Number(parts[0]);
    const pileTipLevelM = Number(parts[1]);
    if (!Number.isFinite(pileSizeMm) || !Number.isFinite(pileTipLevelM)) {
      continue;
    }
    assignments.set(loadPointId, {
      pile_size_mm: pileSizeMm,
      pile_tip_level_m: pileTipLevelM,
    });
  }
  return assignments;
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
