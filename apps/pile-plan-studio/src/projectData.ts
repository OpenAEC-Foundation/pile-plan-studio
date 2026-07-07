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

export type BearingCapacitySummary = {
  count: number;
  minFrdKn: number;
  maxFrdKn: number;
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

export type BearingCapacityIndex = {
  get: (cptId: number, pileSizeMm: number, pileTipLevelM: number) => BearingCapacity | undefined;
};

const PILE_SHAPES: PileShape[] = [
  "circle",
  "square",
  "diamond",
  "triangle-up",
  "triangle-down",
  "triangle-left",
  "triangle-right",
  "pentagon",
  "star",
  "thin-diamond",
  "hexagon",
  "octagon",
];
const PILE_TIP_COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#59a14f",
  "#e15759",
  "#76b7b2",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
];

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 100;
const VIEW_PADDING = 10;

export function getProjectBounds(loadPoints: LoadPoint[], cpts: Cpt[]): ProjectBounds {
  const points = [...loadPoints, ...cpts];

  if (points.length === 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }

  return {
    minX: Math.min(...points.map((point) => point.x_mm)),
    maxX: Math.max(...points.map((point) => point.x_mm)),
    minY: Math.min(...points.map((point) => point.y_mm)),
    maxY: Math.max(...points.map((point) => point.y_mm)),
  };
}

export function projectPoint(
  point: Pick<LoadPoint | Cpt, "x_mm" | "y_mm">,
  bounds: ProjectBounds,
): ViewPoint {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const xRatio = (point.x_mm - bounds.minX) / width;
  const yRatio = (point.y_mm - bounds.minY) / height;

  return {
    x: Math.round(VIEW_PADDING + xRatio * (VIEW_WIDTH - VIEW_PADDING * 2)),
    y: Math.round(VIEW_HEIGHT - VIEW_PADDING - yRatio * (VIEW_HEIGHT - VIEW_PADDING * 2)),
  };
}

export function getBearingCapacitySummary(
  bearingCapacities: BearingCapacity[],
  cptId: number,
): BearingCapacitySummary {
  const cptCapacities = bearingCapacities.filter((capacity) => capacity.cpt_id === cptId);
  const frds = cptCapacities.map((capacity) => capacity.frd_kn);

  return {
    count: cptCapacities.length,
    minFrdKn: Math.min(...frds),
    maxFrdKn: Math.max(...frds),
  };
}

export function getBearingCapacityRowsForCpt(
  bearingCapacities: BearingCapacity[],
  cptId: number,
): CptBearingCapacityRow[] {
  return bearingCapacities
    .filter((capacity) => capacity.cpt_id === cptId)
    .map((capacity) => ({
      pile_size_mm: capacity.pile_size_mm,
      pile_tip_level_m: capacity.pile_tip_level_m,
      frd_kn: capacity.frd_kn,
    }))
    .sort(
      (left, right) =>
        left.pile_size_mm - right.pile_size_mm || right.pile_tip_level_m - left.pile_tip_level_m,
    );
}

export function getSelectedCptsByQuadrant(
  loadPoint: LoadPoint,
  cpts: Cpt[],
  maxDistanceM = 25,
): SelectedCpt[] {
  const quadrants: CptQuadrant[] = ["upper right", "lower right", "upper left", "lower left"];
  const maxDistanceMm = maxDistanceM * 1000;

  return quadrants.flatMap((quadrant) => {
    const candidates = cpts
      .map((cpt) => ({
        label: quadrant,
        quadrant,
        cpt,
        distance_mm: Math.hypot(cpt.x_mm - loadPoint.x_mm, cpt.y_mm - loadPoint.y_mm),
      }))
      .filter((selection) => selection.distance_mm <= maxDistanceMm)
      .filter((selection) => getQuadrant(loadPoint, selection.cpt) === quadrant)
      .sort((left, right) => left.distance_mm - right.distance_mm);

    return candidates[0] ? [candidates[0]] : [];
  });
}

export function getSelectedCpts(
  loadPoint: LoadPoint,
  cpts: Cpt[],
  settings: CptSelectionSettings,
  manualCptIds?: number[],
): SelectedCpt[] {
  if (manualCptIds) {
    return getManuallySelectedCpts(loadPoint, cpts, manualCptIds);
  }

  if (settings.algorithm === "quadrants") {
    return getSelectedCptsByQuadrant(loadPoint, cpts, settings.maxDistanceM);
  }

  return getSelectedCptsByMaximumAngle(loadPoint, cpts, settings.maxDistanceM, settings.maxAngleDegrees);
}

export function getManuallySelectedCpts(
  loadPoint: LoadPoint,
  cpts: Cpt[],
  manualCptIds: number[],
): SelectedCpt[] {
  return manualCptIds.flatMap((cptId, index) => {
    const cpt = cpts.find((item) => item.id === cptId);

    if (!cpt) {
      return [];
    }

    return [
      {
        label: `manual ${index + 1}`,
        cpt,
        distance_mm: Math.hypot(cpt.x_mm - loadPoint.x_mm, cpt.y_mm - loadPoint.y_mm),
      },
    ];
  });
}

export function getSelectedCptsByMaximumAngle(
  loadPoint: LoadPoint,
  cpts: Cpt[],
  maxDistanceM = 25,
  maxAngleDegrees = 120,
): SelectedCpt[] {
  const maxDistanceMm = maxDistanceM * 1000;
  const candidates = cpts
    .map((cpt) => ({
      label: "",
      cpt,
      distance_mm: Math.hypot(cpt.x_mm - loadPoint.x_mm, cpt.y_mm - loadPoint.y_mm),
    }))
    .filter((selection) => selection.distance_mm <= maxDistanceMm)
    .sort((left, right) => left.distance_mm - right.distance_mm);

  const first = candidates[0];

  if (!first) {
    return [];
  }

  const selected = [first];
  const remaining = candidates.slice(1);
  let current = first;

  while (remaining.length > 0) {
    const withinAngle = remaining.find(
      (candidate) => clockwiseAngleDegrees(loadPoint, current.cpt, candidate.cpt) < maxAngleDegrees,
    );
    let chosen = withinAngle;

    if (!chosen) {
      const closingAngle = current.cpt.id === first.cpt.id ? 360 : clockwiseAngleDegrees(loadPoint, current.cpt, first.cpt);
      chosen = remaining
        .filter((candidate) => clockwiseAngleDegrees(loadPoint, current.cpt, candidate.cpt) < closingAngle)
        .sort(
          (left, right) =>
            clockwiseAngleDegrees(loadPoint, current.cpt, left.cpt) -
            clockwiseAngleDegrees(loadPoint, current.cpt, right.cpt),
        )[0];
    }

    if (!chosen) {
      break;
    }

    selected.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
    current = chosen;

    if (clockwiseAngleDegrees(loadPoint, current.cpt, first.cpt) < maxAngleDegrees) {
      break;
    }
  }

  return selected.map((selection, index) => ({
    ...selection,
    label: index === 0 ? "nearest" : `angle ${index + 1}`,
  }));
}

export function calculatePileConfigurationOptions(input: {
  designLoadKn: number;
  selectedCpts: SelectedCpt[];
  bearingCapacities: BearingCapacity[];
  bearingCapacityIndex?: BearingCapacityIndex;
}): PileConfigurationOption[] {
  const configurations = uniquePileConfigurations(input.bearingCapacities);
  const bearingCapacityIndex = input.bearingCapacityIndex ?? createBearingCapacityIndex(input.bearingCapacities);

  return configurations.map((configuration) => {
    const matchingCapacities = input.selectedCpts.map((selection) => {
      const capacity = bearingCapacityIndex.get(
        selection.cpt.id,
        configuration.pile_size_mm,
        configuration.pile_tip_level_m,
      );

      return { cptId: selection.cpt.id, capacity };
    });

    const missing_cpt_ids = matchingCapacities
      .filter((item) => !item.capacity)
      .map((item) => item.cptId);
    const availableCapacities = matchingCapacities.flatMap((item) => (item.capacity ? [item.capacity] : []));
    const governingCapacity = availableCapacities
      .slice()
      .sort((left, right) => left.frd_kn - right.frd_kn)[0];
    const governing_frd_kn = governingCapacity?.frd_kn ?? null;
    const utilization = governing_frd_kn ? input.designLoadKn / governing_frd_kn : null;

    return {
      ...configuration,
      isOption: missing_cpt_ids.length === 0 && utilization !== null && utilization <= 1,
      governing_cpt_id: governingCapacity?.cpt_id ?? null,
      governing_frd_kn,
      utilization,
      missing_cpt_ids,
    };
  });
}

export function calculatePileCost(
  configuration: Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m">,
  settings: PileCostSettings,
): number | null {
  const settingsItem = settings.items.find((item) => item.pile_size_mm === configuration.pile_size_mm);

  if (!settingsItem) {
    return null;
  }

  const pileLengthM = Math.abs(settings.pile_head_level_m - configuration.pile_tip_level_m);
  const crossSectionM2 =
    settingsItem.shape === "round"
      ? Math.PI * (configuration.pile_size_mm / 2000) ** 2
      : (configuration.pile_size_mm / 1000) ** 2;

  return Math.trunc(settingsItem.cost_per_m3_eur * pileLengthM * crossSectionM2);
}

export function chooseDefaultPileOption(
  options: PileConfigurationOption[],
  settings: PileCostSettings,
): PileConfigurationOption | null {
  const validOptions = options.filter((option) => option.isOption);
  const candidates = validOptions.length ? validOptions : options;

  return (
    candidates
      .map((option) => ({ option, cost: calculatePileCost(option, settings) }))
      .sort((left, right) => {
        if (left.cost === null && right.cost === null) {
          return left.option.pile_size_mm - right.option.pile_size_mm || right.option.pile_tip_level_m - left.option.pile_tip_level_m;
        }
        if (left.cost === null) {
          return 1;
        }
        if (right.cost === null) {
          return -1;
        }
        return left.cost - right.cost;
      })[0]?.option ?? null
  );
}

export function createBearingCapacityIndex(bearingCapacities: BearingCapacity[]): BearingCapacityIndex {
  const capacitiesByKey = new Map<string, BearingCapacity>();

  bearingCapacities.forEach((capacity) => {
    capacitiesByKey.set(
      bearingCapacityKey(capacity.cpt_id, capacity.pile_size_mm, capacity.pile_tip_level_m),
      capacity,
    );
  });

  return {
    get: (cptId, pileSizeMm, pileTipLevelM) =>
      capacitiesByKey.get(bearingCapacityKey(cptId, pileSizeMm, pileTipLevelM)),
  };
}

export function buildPileOptionsByLoadPoint(input: {
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  bearingCapacities: BearingCapacity[];
  bearingCapacityIndex: BearingCapacityIndex;
  cptSelectionSettings: CptSelectionSettings | ((loadPoint: LoadPoint) => CptSelectionSettings);
  manualCptIdsByLoadPoint?: Map<number, number[]>;
}): Map<number, PileConfigurationOption[]> {
  return new Map(
    input.loadPoints.map((loadPoint) => {
      const settings =
        typeof input.cptSelectionSettings === "function"
          ? input.cptSelectionSettings(loadPoint)
          : input.cptSelectionSettings;
      const selectedCpts = getSelectedCpts(
        loadPoint,
        input.cpts,
        settings,
        input.manualCptIdsByLoadPoint?.get(loadPoint.id),
      );
      const options = calculatePileConfigurationOptions({
        designLoadKn: loadPoint.design_load_kn,
        selectedCpts,
        bearingCapacities: input.bearingCapacities,
        bearingCapacityIndex: input.bearingCapacityIndex,
      });

      return [loadPoint.id, options];
    }),
  );
}

function bearingCapacityKey(cptId: number, pileSizeMm: number, pileTipLevelM: number): string {
  return `${cptId}|${pileSizeMm}|${pileTipLevelM}`;
}

export function getLegendItems(bearingCapacities: BearingCapacity[]): LegendItems {
  const pileSizes = uniqueValues(bearingCapacities.map((capacity) => capacity.pile_size_mm)).map((value, index) => ({
    value,
    shape: PILE_SHAPES[index % PILE_SHAPES.length],
  }));
  const pileTipLevels = uniqueValues(bearingCapacities.map((capacity) => capacity.pile_tip_level_m))
    .sort((left, right) => right - left)
    .map(
    (value, index) => ({
      value,
      color: getPileTipColor(index),
    }),
  );

  return { pileSizes, pileTipLevels };
}

export function getConfigurationStyle(
  configuration: Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m">,
  legend: LegendItems,
): PileConfigurationStyle {
  return {
    shape: legend.pileSizes.find((item) => item.value === configuration.pile_size_mm)?.shape ?? "circle",
    color: legend.pileTipLevels.find((item) => item.value === configuration.pile_tip_level_m)?.color ?? "#8c989f",
  };
}

function getPileTipColor(index: number): string {
  if (index < PILE_TIP_COLORS.length) {
    return PILE_TIP_COLORS[index];
  }

  const hue = Math.round((index * 137.508) % 360);
  const saturation = 62 + (index % 3) * 8;
  const lightness = 46 + (index % 4) * 6;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function uniqueValues(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function uniquePileConfigurations(bearingCapacities: BearingCapacity[]) {
  const configurationKeys = new Set<string>();

  return bearingCapacities
    .map((capacity) => ({
      pile_size_mm: capacity.pile_size_mm,
      pile_tip_level_m: capacity.pile_tip_level_m,
    }))
    .filter((configuration) => {
      const key = `${configuration.pile_size_mm}|${configuration.pile_tip_level_m}`;
      if (configurationKeys.has(key)) {
        return false;
      }
      configurationKeys.add(key);
      return true;
    })
    .sort(
      (left, right) =>
        left.pile_size_mm - right.pile_size_mm || right.pile_tip_level_m - left.pile_tip_level_m,
    );
}

function getQuadrant(loadPoint: LoadPoint, cpt: Cpt): CptQuadrant {
  if (cpt.x_mm >= loadPoint.x_mm && cpt.y_mm >= loadPoint.y_mm) {
    return "upper right";
  }
  if (cpt.x_mm >= loadPoint.x_mm && cpt.y_mm < loadPoint.y_mm) {
    return "lower right";
  }
  if (cpt.x_mm < loadPoint.x_mm && cpt.y_mm >= loadPoint.y_mm) {
    return "upper left";
  }
  return "lower left";
}

function clockwiseAngleDegrees(origin: LoadPoint, from: Cpt, to: Cpt): number {
  const fromX = from.x_mm - origin.x_mm;
  const fromY = from.y_mm - origin.y_mm;
  const toX = to.x_mm - origin.x_mm;
  const toY = to.y_mm - origin.y_mm;
  const dot = fromX * toX + fromY * toY;
  const determinant = fromX * toY - fromY * toX;
  const angle = 180 - radiansToDegrees(Math.atan2(-determinant, -dot));

  return angle === 360 ? 0 : angle;
}

function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}
