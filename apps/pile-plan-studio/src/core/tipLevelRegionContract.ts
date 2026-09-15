import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import type { PileConfigurationKey, PileConfigurationOption } from "./projectTypes.ts";

export type LoadPointEdge = {
  from_load_point_id: number;
  to_load_point_id: number;
};

export type LoadPointFace = {
  boundary_load_point_ids: number[];
};

export type LoadPointTopology = {
  load_point_ids: number[];
  edges: LoadPointEdge[];
  faces: LoadPointFace[];
};

export type TipLevelRegionAssignment = PileConfigurationKey;

export type TipLevelRegionTopology = {
  groups: Array<{
    pile_tip_level_mm: number;
    legend_value_m: number;
    load_point_ids: number[];
    edges: LoadPointEdge[];
    faces: LoadPointFace[];
  }>;
};

type CorePileConfigurationOption = Omit<PileConfigurationOption, "isOption" | "technicalStatus"> & {
  is_option: boolean;
  technical_status: PileConfigurationOption["technicalStatus"];
};

type TipLevelRegionTopologyInput = {
  loadPointTopology: LoadPointTopology;
  selectedAssignments: Map<number, TipLevelRegionAssignment>;
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>;
};

export type BrowserTipLevelRegionTopologyRequest = {
  load_point_topology: LoadPointTopology;
  selected_assignments: Map<number, TipLevelRegionAssignment>;
  options_by_load_point: Map<number, CorePileConfigurationOption[]>;
};

export type DesktopTipLevelRegionTopologyRequest = {
  load_point_topology: LoadPointTopology;
  selected_assignments: Record<string, TipLevelRegionAssignment>;
  options_by_load_point: Record<string, CorePileConfigurationOption[]>;
};

export function toTipLevelRegionAssignments(
  selectedConfigurationsByLoadPoint: Map<number, PileConfigurationKey>,
): Map<number, TipLevelRegionAssignment> {
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
    load_point_topology: input.loadPointTopology,
    selected_assignments: toWasmNumberKeyedMap(input.selectedAssignments),
    options_by_load_point: toWasmNumberKeyedMap(toCoreOptionsByLoadPoint(input.optionsByLoadPoint)),
  };
}

export function toDesktopTipLevelRegionTopologyRequest(
  input: TipLevelRegionTopologyInput,
): DesktopTipLevelRegionTopologyRequest {
  return {
    load_point_topology: input.loadPointTopology,
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
      options.map(({ isOption, technicalStatus, ...option }) => ({
        ...option,
        is_option: isOption,
        technical_status: technicalStatus,
      })),
    ]),
  );
}
