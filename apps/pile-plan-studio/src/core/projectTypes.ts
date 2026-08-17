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
  monopolyDistanceM: number;
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
  max_utilization: number;
  enabled_pile_sizes: number[];
  enabled_pile_tip_levels: number[];
};

export type OptimizationLimitScope = "target" | "whole-plan";

export type ViewerUtilizationSettings = {
  minimum: number;
  maximum: number;
};

export type ProjectViewerSettings = {
  symbolScalePercent: number;
  foregroundLayer: "load-points" | "cpts";
  showGrid: boolean;
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
  cost: number | null;
};

export type GreedyUnassignedReason =
  | "no_valid_option"
  | "optimization_constraints"
  | "configuration_limits";

export type GreedyUnassignedLoadPoint = {
  load_point_id: number;
  reason: GreedyUnassignedReason;
};

export type GreedyOptimizationResult = {
  assignments: GreedyOptimizedPileChoice[];
  unassigned: GreedyUnassignedLoadPoint[];
  selected_configurations: PileConfigurationKey[];
  pile_size_count: number;
  pile_tip_level_count: number;
  configuration_count: number;
};

export type PileCostShape = "round" | "square";

export type PileCostSettings = {
  schema_version: number;
  items: PileCostSettingsItem[];
};

export type PileCostSettingsItem = {
  pile_size_mm: number;
  shape: PileCostShape;
  cost_per_m3: number;
};

export type PileBaseShape =
  | "circle"
  | "square"
  | "diamond"
  | "triangle-up"
  | "triangle-down"
  | "triangle-left"
  | "triangle-right"
  | "rectangle-horizontal"
  | "rectangle-vertical";

export type PileFillPattern =
  | "full"
  | "top-half"
  | "bottom-half"
  | "left-half"
  | "right-half"
  | "diagonal-half";

export type PileSymbol = {
  baseShape: PileBaseShape;
  fillPattern: PileFillPattern;
};

export type LegendEncodingMode = "size-symbol" | "tip-symbol";

export type LegendColorScheme =
  | "tableau-extended"
  | "even-hue"
  | "colorblind-friendly"
  | "rainbow"
  | "light-dark"
  | "cool-warm";

export type LegendValueStyle = {
  value: number;
  symbol: PileSymbol;
  color: string;
  symbolAutomatic: boolean;
  colorAutomatic: boolean;
};

export type LegendItems = {
  encodingMode: LegendEncodingMode;
  colorScheme: LegendColorScheme;
  pileSizes: LegendValueStyle[];
  pileTipLevels: LegendValueStyle[];
};

export type PileConfigurationStyle = {
  symbol: PileSymbol;
  color: string;
};
