export type JsonList<T> = {
  schema_version: number;
  items: T[];
};

export type LoadPoint = {
  id: number;
  name: string;
  x_mm: number;
  y_mm: number;
  design_load_kn: number;
};

export type Cpt = {
  id: number;
  name: string;
  x_mm: number;
  y_mm: number;
};

export type BearingCapacity = {
  cpt_id: number;
  pile_tip_level_m: number;
  pile_size_mm: number;
  frd_kn: number;
};

export type ProjectBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type ViewPoint = {
  x: number;
  y: number;
};

export type CptBearingCapacityRow = {
  pile_size_mm: number;
  pile_tip_level_m: number;
  frd_kn: number;
};

export type CptQuadrant = "upper right" | "lower right" | "upper left" | "lower left";

export type SelectedCpt = {
  label: string;
  quadrant?: CptQuadrant;
  cpt: Cpt;
  distance_mm: number;
};

export type CptSelectionAlgorithm = "quadrants" | "maximum-angle";

export type CptSelectionSettings = {
  algorithm: CptSelectionAlgorithm;
  maxDistanceM: number;
  maxAngleDegrees: number;
};

export type PileConfigurationOption = {
  pile_size_mm: number;
  pile_tip_level_m: number;
  isOption: boolean;
  governing_cpt_id: number | null;
  governing_frd_kn: number | null;
  utilization: number | null;
  missing_cpt_ids: number[];
};

export type ProjectAnalysisResult = {
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
  selectedCptsByLoadPointId: Map<number, SelectedCpt[]>;
  cptFrdRowsByCptId: Map<number, CptBearingCapacityRow[]> | null;
};

export type GreedyOptimizationSettings = {
  max_pile_sizes: number;
  max_pile_tip_levels: number;
  max_pile_configurations: number;
  enabled_pile_sizes: number[];
  enabled_pile_tip_levels: number[];
  baseline_pile_sizes: number[];
  baseline_pile_tip_levels: number[];
  baseline_pile_configurations: PileConfigurationKey[];
};

export type PileConfigurationKey = {
  pile_size_mm: number;
  pile_tip_level_m_key: number;
};

export type PilePlanExportInput = {
  loadPoints: LoadPoint[];
  selectedPiles: Map<number, PileConfigurationKey>;
  selectedCpts: Map<number, number[]>;
};

export type GreedyOptimizedPileChoice = {
  load_point_id: number;
  pile_size_mm: number;
  pile_tip_level_m: number;
  is_option: boolean;
  cost_eur: number | null;
};

export type PileCostShape = "round" | "square";

export type PileCostSettings = {
  schema_version: number;
  pile_head_level_m: number;
  items: PileCostSettingsItem[];
};

export type PileCostSettingsItem = {
  pile_size_mm: number;
  shape: PileCostShape;
  cost_per_m3_eur: number;
};

export type PileShape =
  | "circle"
  | "square"
  | "diamond"
  | "triangle-up"
  | "triangle-down"
  | "triangle-left"
  | "triangle-right"
  | "pentagon"
  | "star"
  | "thin-diamond"
  | "hexagon"
  | "octagon";

export type LegendItems = {
  pileSizes: Array<{ value: number; shape: PileShape }>;
  pileTipLevels: Array<{ value: number; color: string }>;
};

export type PileConfigurationStyle = {
  shape: PileShape;
  color: string;
};
