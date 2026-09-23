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
  pile_tip_level_mm: number;
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

export type LoadPointGroupingSettings = {
  automatic: boolean;
  maxEdgeDistanceM: number;
  manualGroups: LoadPointGroupOverride[];
  ungroupedGroups: LoadPointGroupOverride[];
};

export type LoadPointGroupOverride = {
  loadPointIds: number[];
};

export type PileOptionTechnicalStatus =
  | "valid"
  | "missing_capacity_data"
  | "insufficient_capacity";

export type PileConfigurationOption = {
  configuration: PileConfigurationKey;
  pile_size_mm: number;
  pile_tip_level_m: number;
  isOption: boolean;
  governing_cpt_id: number | null;
  governing_frd_kn: number | null;
  utilization: number | null;
  missing_cpt_ids: number[];
  technicalStatus: PileOptionTechnicalStatus;
};

export type PileOptionAnalysisResult = {
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
  selectedCptsByLoadPointId: Map<number, SelectedCpt[]>;
  cptFrdRowsByCptId: Map<number, CptBearingCapacityRow[]> | null;
};

export type OptimizationLimitScope = "target" | "whole-plan";

export type ViewerUtilizationSettings = {
  minimum: number;
  maximum: number;
};

export type PileConfigurationKey = {
  pile_size_mm: number;
  pile_tip_level_mm: number;
};

export type IfcppPileConfigurationKey = {
  pile_size_mm: number;
  pile_tip_level_m_key: number;
};

export type PilePlanExportInput = {
  loadPoints: LoadPoint[];
  selectedPiles: Map<number, PileConfigurationKey>;
  selectedCpts: Map<number, number[]>;
};

export type OptimizationUnassignedReason =
  | "optimization_constraints"
  | "configuration_limits";

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

export type LegendEncodingMode = "size-symbol" | "tip-symbol" | "size-color-tip-region";

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
  pileSizeColorScheme: LegendColorScheme;
  pileTipLevelColorScheme: LegendColorScheme;
  pileSizes: LegendValueStyle[];
  pileTipLevels: LegendValueStyle[];
};

export type PileConfigurationStyle = {
  symbol: PileSymbol;
  color: string;
};
