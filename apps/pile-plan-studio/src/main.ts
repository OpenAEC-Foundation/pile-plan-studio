import "./styles.css";

import sampleProjectText from "../../../sample_project/sample_project.ifcpp?raw";

import {
  type BearingCapacity,
  type CptBearingCapacityRow,
  type Cpt,
  type CptSelectionAlgorithm,
  type CptSelectionSettings,
  type PileConfigurationOption,
  type PileCostSettings,
  type PileCostShape,
  type LoadPoint,
  type SelectedCpt,
} from "./projectTypes";
import {
  filterActivePileOptions,
  getUsedPileConfigurations,
  isPileConfigurationActive,
  shouldDisableActivePileConfigurationToggle,
  toggleActivePileConfiguration,
} from "./activePileConfigurations";
import {
  calculatePileCostCore,
  calculatePileOptionsCore,
  calculateSelectedCptsCore,
  chooseDefaultPileOptionCore,
  getBearingCapacityRowsForCptCore,
  greedyOptimizeCore,
  importProjectFromFilesCore,
  isTauriRuntime,
} from "./coreClient";
import { getSelectedCptTableModel } from "./cptSelectionTable";
import { formatNumber, formatOptionalNumber } from "./formatting";
import { getConfigurationStyle, getLegendItems } from "./legend";
import {
  areImportFileAssignmentsComplete,
  emptyImportFileAssignments,
  inferImportFileAssignments,
  type ImportFileAssignments,
  type ImportFileRole,
} from "./importFiles";
import { getPointIdsInRectangle } from "./lassoSelection";
import { getLoadPointMarkerInvalidVisual } from "./loadPointMarker";
import { getCptMarkerLayerClass, getLoadPointMarkerLayerClass } from "./mapMarkerLayer";
import { shouldStartMapPan } from "./mapInteraction";
import { aggregatePileOptionsForLoadPoints } from "./pileOptionAggregation";
import { getUseColumnLabel } from "./pileOptionColumns";
import { getPileOptionStatus } from "./pileOptionStatus";
import { summarizeOptimizationRun, type OptimizationRunSummary } from "./optimizationSummary";
import {
  getLoadPointIdsForLegendSelection,
  shouldHighlightGoverningCpt,
  toggleLegendSelectionFilter,
  type LegendSelectionFilter,
} from "./legendSelection";
import {
  buildMaxOptimizationUiSettings,
  buildGreedyOptimizationSettings,
  clampMaxDifferentConfigurations,
  clampOptimizationUiSettingsToActiveConfigurations,
  createOptimizationLimitAutoState,
  type OptimizationLimitAutoState,
  reconcileOptimizationUiSettingsWithActiveConfigurations,
  snapSliderValueToInteger,
  type OptimizationUiSettings,
} from "./optimizationSettings";
import {
  PILE_OPTION_COLUMNS,
  createEmptyPileOptionFilters,
  getNextPileOptionSortState,
  getPileOptionFilterValues,
  getPileOptionTableRows,
  type PileOptionFilterState,
  type PileOptionSortState,
  type PileOptionTableColumn,
  type SortablePileOptionTableColumn,
  type PileOptionTableRow,
} from "./pileOptionTable";
import { renderPileSymbol } from "./pileSymbols";
import { DEFAULT_RIGHT_PANEL_WIDTH, resizeRightPanelWidth } from "./panelLayout";
import {
  applyDefaultPileCostSettings,
  createIfcppProject,
  loadIfcppProjectData,
  type LoadedProjectData,
} from "./projectFile";
import { summarizeProjectCosts } from "./projectCostSummary";
import { getRightPanelView } from "./rightPanelView";
import {
  addLoadPointsToSelection,
  clearSelection,
  openCpt,
  selectLoadPoint,
  switchRightPanelMode,
  type RightPanelMode,
  type SelectionState,
} from "./selectionState";
import { getProjectBounds, projectPoint } from "./viewerGeometry";
import { clampScale, panViewport, zoomViewportAtPoint, type Viewport } from "./viewport";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

const appRoot = app;
let projectData = loadIfcppProjectData(sampleProjectText);
let loadPoints = projectData.loadPoints;
let cpts = projectData.cpts;
let bearingCapacities = projectData.bearingCapacities;
let bounds = getProjectBounds(loadPoints, cpts);
let legendItems = getLegendItems(bearingCapacities);
let availablePileSizes = [...new Set(bearingCapacities.map((capacity) => capacity.pile_size_mm))]
  .sort((left, right) => left - right);
let availablePileTipLevels = [...new Set(bearingCapacities.map((capacity) => capacity.pile_tip_level_m))]
  .sort((left, right) => right - left);
type CptSettingsScope = "all" | "current";
type CptSelectionEditDraft = {
  loadPointId: number;
  cptIds: Set<number>;
};

let globalCptSelectionSettings: CptSelectionSettings = { ...projectData.globalCptSelectionSettings };
let pileCostSettings: PileCostSettings = structuredClone(projectData.pileCostSettings);
let cptSettingsScope: CptSettingsScope = "all";
let activePileSizes = availablePileSizes;
let activePileTipLevels = availablePileTipLevels;
let optimizationSettings: OptimizationUiSettings = buildMaxOptimizationUiSettings({
  pileSizes: activePileSizes,
  pileTipLevels: activePileTipLevels,
});
let optimizationLimitAutoState: OptimizationLimitAutoState = createOptimizationLimitAutoState(true);
let legendSelectionFilter: LegendSelectionFilter = { pileSizes: [], pileTipLevels: [] };
let lastOptimizationSummary: OptimizationRunSummary | null = null;
let cptSelectionEditDraft: CptSelectionEditDraft | null = null;
const cptSelectionSettingsByLoadPoint = new Map<number, CptSelectionSettings>(projectData.cptSelectionSettingsByLoadPoint);
const manualCptIdsByLoadPoint = new Map<number, number[]>(projectData.manualCptIdsByLoadPoint);
let pileOptionsByLoadPointId = new Map<number, PileConfigurationOption[]>();
let selectedCptsByLoadPointId = new Map<number, SelectedCpt[]>();
let defaultPileOptionByLoadPointId = new Map<number, PileConfigurationOption | null>();
let pileCostByOptionKey = new Map<string, number | null>();
let cptFrdRowsByCptId = new Map<number, CptBearingCapacityRow[]>();
let selectedLoadPointId: number | null = loadPoints[0]?.id ?? null;
let selectedLoadPointIds: number[] = loadPoints[0] ? [loadPoints[0].id] : [];
let selectedCptId: number | null = null;
let rightPanelMode: RightPanelMode = "load-point";
let viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
let pileOptionFilters: PileOptionFilterState = createEmptyPileOptionFilters();
let pileOptionSort: PileOptionSortState = null;
let openPileOptionFilterColumn: SortablePileOptionTableColumn | null = null;
let projectImportMessage: string | null = null;
let isImportDialogOpen = false;
let importFileAssignments: ImportFileAssignments<File> = emptyImportFileAssignments<File>();
let isShiftKeyPressed = false;
let dragState:
  | { mode: "pan"; x: number; y: number; startX: number; startY: number; hasMoved: boolean }
  | { mode: "lasso"; startX: number; startY: number; endX: number; endY: number; hasMoved: boolean; box: HTMLDivElement }
  | null = null;
let rightPanelWidth = DEFAULT_RIGHT_PANEL_WIDTH;
let panelResizeState: { startX: number; startWidth: number } | null = null;
const selectedPileOptions = new Map<number, string>(projectData.selectedPileOptionKeysByLoadPoint);
const chosenPileOptionByLoadPointId = new Map<number, PileConfigurationOption | null>();
const NO_PILE_OPTION_KEY = "__no_pile__";

async function loadProjectData(nextProjectData: LoadedProjectData): Promise<void> {
  projectData = nextProjectData;
  loadPoints = projectData.loadPoints;
  cpts = projectData.cpts;
  bearingCapacities = projectData.bearingCapacities;
  bounds = getProjectBounds(loadPoints, cpts);
  legendItems = getLegendItems(bearingCapacities);
  availablePileSizes = [...new Set(bearingCapacities.map((capacity) => capacity.pile_size_mm))]
    .sort((left, right) => left - right);
  availablePileTipLevels = [...new Set(bearingCapacities.map((capacity) => capacity.pile_tip_level_m))]
    .sort((left, right) => right - left);
  globalCptSelectionSettings = { ...projectData.globalCptSelectionSettings };
  pileCostSettings = structuredClone(projectData.pileCostSettings);
  cptSettingsScope = "all";
  activePileSizes = projectData.activePileSizes.length > 0 ? projectData.activePileSizes : availablePileSizes;
  activePileTipLevels = projectData.activePileTipLevels.length > 0
    ? projectData.activePileTipLevels
    : availablePileTipLevels;
  optimizationSettings = buildMaxOptimizationUiSettings({
    pileSizes: activePileSizes,
    pileTipLevels: activePileTipLevels,
  });
  optimizationLimitAutoState = createOptimizationLimitAutoState(true);
  legendSelectionFilter = { pileSizes: [], pileTipLevels: [] };
  lastOptimizationSummary = null;
  cptSelectionEditDraft = null;
  cptSelectionSettingsByLoadPoint.clear();
  projectData.cptSelectionSettingsByLoadPoint.forEach((settings, loadPointId) => {
    cptSelectionSettingsByLoadPoint.set(loadPointId, settings);
  });
  manualCptIdsByLoadPoint.clear();
  projectData.manualCptIdsByLoadPoint.forEach((cptIds, loadPointId) => {
    manualCptIdsByLoadPoint.set(loadPointId, cptIds);
  });
  selectedPileOptions.clear();
  projectData.selectedPileOptionKeysByLoadPoint.forEach((optionKey, loadPointId) => {
    selectedPileOptions.set(loadPointId, optionKey);
  });
  pileOptionsByLoadPointId = new Map();
  selectedCptsByLoadPointId = new Map();
  defaultPileOptionByLoadPointId = new Map();
  pileCostByOptionKey = new Map();
  cptFrdRowsByCptId = new Map();
  selectedLoadPointId = loadPoints[0]?.id ?? null;
  selectedLoadPointIds = loadPoints[0] ? [loadPoints[0].id] : [];
  selectedCptId = null;
  rightPanelMode = "load-point";
  viewport = { scale: 1, offsetX: 0, offsetY: 0 };
  pileOptionFilters = createEmptyPileOptionFilters();
  pileOptionSort = null;
  openPileOptionFilterColumn = null;
  chosenPileOptionByLoadPointId.clear();

  await rebuildCoreAnalysis();
  syncActiveConfigurationsToUsedPileChoices();
}

async function rebuildCoreAnalysis(): Promise<void> {
  const [pileOptions, selectedCptsEntries, cptRowsEntries] = await Promise.all([
    calculatePileOptionsCore({
      loadPoints,
      cpts,
      bearingCapacities,
      globalSettings: globalCptSelectionSettings,
      settingsByLoadPoint: cptSelectionSettingsByLoadPoint,
      manualCptIdsByLoadPoint,
    }),
    Promise.all(
      loadPoints.map(async (loadPoint) => [
        loadPoint.id,
        await calculateSelectedCptsCore({
          loadPoint,
          cpts,
          settings: getCptSelectionSettingsForLoadPoint(loadPoint),
          manualCptIds: manualCptIdsByLoadPoint.get(loadPoint.id),
        }),
      ] as const),
    ),
    Promise.all(
      cpts.map(async (cpt) => [
        cpt.id,
        await getBearingCapacityRowsForCptCore({ bearingCapacities, cptId: cpt.id }),
      ] as const),
    ),
  ]);

  pileOptionsByLoadPointId = pileOptions;
  selectedCptsByLoadPointId = new Map(selectedCptsEntries);
  cptFrdRowsByCptId = new Map(cptRowsEntries);

  await rebuildCostAndDefaultCaches();
}

function getSelectionState(): SelectionState {
  return {
    selectedLoadPointId,
    selectedLoadPointIds,
    selectedCptId,
    rightPanelMode,
  };
}

function setSelectionState(nextState: SelectionState): void {
  selectedLoadPointId = nextState.selectedLoadPointId;
  selectedLoadPointIds = nextState.selectedLoadPointIds;
  selectedCptId = nextState.selectedCptId;
  rightPanelMode = nextState.rightPanelMode;
}

async function updateCptSelectionSettings(nextSettings: CptSelectionSettings): Promise<void> {
  if (cptSettingsScope === "all" || selectedLoadPointId === null) {
    globalCptSelectionSettings = nextSettings;
    cptSelectionSettingsByLoadPoint.clear();
  } else {
    cptSelectionSettingsByLoadPoint.set(selectedLoadPointId, nextSettings);
  }

  await rebuildCoreAnalysis();
  chosenPileOptionByLoadPointId.clear();
}

async function rebuildPileOptionCache(): Promise<void> {
  await rebuildCoreAnalysis();
  chosenPileOptionByLoadPointId.clear();
}

async function updatePileCostSettings(nextSettings: PileCostSettings): Promise<void> {
  pileCostSettings = nextSettings;
  await rebuildCostAndDefaultCaches();
  chosenPileOptionByLoadPointId.clear();
}

async function rebuildCostAndDefaultCaches(): Promise<void> {
  const uniqueOptions = [
    ...new Map(
      [...pileOptionsByLoadPointId.values()]
        .flat()
        .map((option) => [optionKey(option), option]),
    ).values(),
  ];
  const costEntries = await Promise.all(
    uniqueOptions.map(async (option) => [
      optionKey(option),
      await calculatePileCostCore({
        pileSizeMm: option.pile_size_mm,
        pileTipLevelM: option.pile_tip_level_m,
        settings: pileCostSettings,
      }),
    ] as const),
  );
  const defaultEntries = await Promise.all(
    loadPoints.map(async (loadPoint) => [
      loadPoint.id,
      await chooseDefaultPileOptionCore({
        options: getPileOptions(loadPoint),
        settings: pileCostSettings,
      }),
    ] as const),
  );

  pileCostByOptionKey = new Map(costEntries);
  defaultPileOptionByLoadPointId = new Map(defaultEntries);
}

function syncActiveConfigurationsToUsedPileChoices(): void {
  const used = getUsedPileConfigurations(loadPoints.map(getChosenPileOption));

  if (used.pileSizes.length > 0) {
    activePileSizes = used.pileSizes;
  }

  if (used.pileTipLevels.length > 0) {
    activePileTipLevels = used.pileTipLevels;
  }

  syncOptimizationLimitsToActiveConfigurations();
}

function syncOptimizationLimitsToActiveConfigurations(): void {
  const reconciled = reconcileOptimizationUiSettingsWithActiveConfigurations({
    uiSettings: optimizationSettings,
    active: getActivePileConfigurations(),
    autoState: optimizationLimitAutoState,
  });
  optimizationSettings = reconciled.uiSettings;
  optimizationLimitAutoState = reconciled.autoState;
}

function getCptSelectionSettingsForLoadPoint(loadPoint: LoadPoint): CptSelectionSettings {
  return cptSelectionSettingsByLoadPoint.get(loadPoint.id) ?? globalCptSelectionSettings;
}

function getActiveCptSelectionSettings(): CptSelectionSettings {
  const selectedLoadPoint = loadPoints.find((loadPoint) => loadPoint.id === selectedLoadPointId) ?? loadPoints[0];

  return getCptSelectionSettingsForLoadPoint(selectedLoadPoint);
}

function getSelectedCptsForLoadPoint(loadPoint: LoadPoint) {
  return selectedCptsByLoadPointId.get(loadPoint.id) ?? [];
}

function getPileOptions(loadPoint: LoadPoint): PileConfigurationOption[] {
  return pileOptionsByLoadPointId.get(loadPoint.id) ?? [];
}

function getActivePileConfigurations() {
  return {
    pileSizes: activePileSizes,
    pileTipLevels: activePileTipLevels,
  };
}

function getSelectedLoadPoints(): LoadPoint[] {
  return selectedLoadPointIds.flatMap((loadPointId) => {
    const loadPoint = loadPoints.find((item) => item.id === loadPointId);
    return loadPoint ? [loadPoint] : [];
  });
}

function optionKey(option: Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m">): string {
  return `${option.pile_size_mm}|${option.pile_tip_level_m}`;
}

function getChosenPileOption(loadPoint: LoadPoint): PileConfigurationOption | null {
  const cachedChosenOption = chosenPileOptionByLoadPointId.get(loadPoint.id);
  if (cachedChosenOption !== undefined) {
    return cachedChosenOption;
  }

  const options = getPileOptions(loadPoint);
  const selectedKey = selectedPileOptions.get(loadPoint.id);
  if (selectedKey === NO_PILE_OPTION_KEY) {
    chosenPileOptionByLoadPointId.set(loadPoint.id, null);
    return null;
  }
  const selectedOption = selectedKey ? options.find((option) => optionKey(option) === selectedKey) : undefined;
  const fallbackOption = defaultPileOptionByLoadPointId.get(loadPoint.id) ?? null;

  const chosenOption = selectedOption ?? fallbackOption ?? null;
  chosenPileOptionByLoadPointId.set(loadPoint.id, chosenOption);

  return chosenOption;
}

function renderMap(selectedLoadPoints: LoadPoint[]): string {
  const primaryLoadPoint = selectedLoadPoints[0] ?? null;
  const selectedLoadPointIdSet = new Set(selectedLoadPoints.map((loadPoint) => loadPoint.id));
  const selectedCpts = getUnionSelectedCpts(selectedLoadPoints);
  const activeCptSelectionDraft =
    primaryLoadPoint && cptSelectionEditDraft?.loadPointId === primaryLoadPoint.id ? cptSelectionEditDraft : null;
  const isEditingCptSelection = activeCptSelectionDraft !== null;
  const selectedCptIds = isEditingCptSelection
    ? activeCptSelectionDraft.cptIds
    : new Set(selectedCpts.map((item) => item.cpt.id));
  const governingCptId = getHighlightedGoverningCptId(selectedLoadPoints, [...selectedCptIds]);
  const loadPointMarkers = loadPoints
    .map((loadPoint) => {
      const point = projectPoint(loadPoint, bounds);
      const isSelected = selectedLoadPointIdSet.has(loadPoint.id);
      const chosenOption = getChosenPileOption(loadPoint);
      const style = chosenOption ? getConfigurationStyle(chosenOption, legendItems) : null;
      const invalidVisual = getLoadPointMarkerInvalidVisual(chosenOption);
      const isOutsideActiveConfiguration = chosenOption
        ? !isPileConfigurationActive(chosenOption, getActivePileConfigurations())
        : false;
      return `
        <button
          class="map-marker load-point-marker${getLoadPointMarkerLayerClass(isSelected)}${isSelected ? " is-selected" : ""}${invalidVisual.className}${chosenOption ? "" : " has-no-pile"}${isOutsideActiveConfiguration ? " is-outside-active-config" : ""}"
          data-load-point-id="${loadPoint.id}"
          style="left: ${point.x}%; top: ${point.y}%; ${invalidVisual.style}"
          title="${loadPoint.name}"
          aria-label="${loadPoint.name}, ${loadPoint.design_load_kn} kN"
        >${
          chosenOption
            ? renderPileSymbol(style?.shape ?? "circle", style?.color ?? "#ffffff")
            : `<span class="no-pile-cross" aria-hidden="true">×</span>`
        }</button>
      `;
    })
    .join("");

  const cptMarkers = cpts
    .map((cpt) => {
      const point = projectPoint(cpt, bounds);
      const isSelected = selectedCptIds.has(cpt.id);
      const isGoverning = governingCptId === cpt.id;
      return `
        <button
          class="map-marker cpt-marker${getCptMarkerLayerClass(isSelected)}${isSelected ? " is-selected" : ""}${isEditingCptSelection ? " is-editable" : ""}${isGoverning ? " is-governing" : ""}${selectedCptId === cpt.id ? " is-open" : ""}"
          type="button"
          data-cpt-id="${cpt.id}"
          style="left: ${point.x}%; top: ${point.y}%"
          title="${cpt.name}"
        ><span class="cpt-marker-label">${cpt.id}</span></button>
      `;
    })
    .join("");

  return `
    <div class="map-shell">
      <div
        class="map-stage"
        role="img"
        aria-label="Project map with load points and CPTs"
        style="transform: translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})"
      >
        ${cptMarkers}
        ${loadPointMarkers}
      </div>
    </div>
  `;
}

function getUnionSelectedCpts(selectedLoadPoints: LoadPoint[]): SelectedCpt[] {
  const cptsById = new Map<number, SelectedCpt>();

  selectedLoadPoints.forEach((loadPoint) => {
    getSelectedCptsForLoadPoint(loadPoint).forEach((selection) => {
      cptsById.set(selection.cpt.id, selection);
    });
  });

  return [...cptsById.values()];
}

function getHighlightedGoverningCptId(selectedLoadPoints: LoadPoint[], activeSelectedCptIds: number[]): number | null {
  const chosenKey = getChosenPileOptionKeyForSelection(selectedLoadPoints);

  if (!chosenKey || selectedLoadPoints.length === 0) {
    return null;
  }

  const governingCptId = getPileOptionsForSelection(selectedLoadPoints)
    .find((option) => optionKey(option) === chosenKey)
    ?.governing_cpt_id ?? null;

  return shouldHighlightGoverningCpt(governingCptId, activeSelectedCptIds) ? governingCptId : null;
}

function renderSelectedCptDetails(selectedLoadPoint: LoadPoint): string {
  const selectedCpts = getSelectedCptsForLoadPoint(selectedLoadPoint);

  if (selectedCpts.length === 0) {
    return `<p>No CPTs available around this load point.</p>`;
  }

  return selectedCpts
    .map((selection) => {
      const rows = cptFrdRowsByCptId.get(selection.cpt.id) ?? [];
      const frds = rows.map((row) => row.frd_kn);
      const distanceM = selection.distance_mm / 1000;
      const frdRange = frds.length
        ? `${formatNumber(Math.min(...frds))}-${formatNumber(Math.max(...frds))} kN`
        : "-";

      return `
        <tr>
          <td>${selection.label}</td>
          <td>${renderCptLink(selection.cpt)}</td>
          <td>${formatNumber(distanceM)} m</td>
          <td>${frdRange}</td>
        </tr>
      `;
    })
    .join("");
}

type RenderablePileOptionTableRow = PileOptionTableRow & {
  governingHtml: string;
  statusClassName: string;
  symbolHtml: string;
};

function getRenderablePileOptionRows(selectedLoadPoints: LoadPoint[]): RenderablePileOptionTableRow[] {
  const options = getPileOptionsForSelection(selectedLoadPoints);

  return options.map((option) => {
    const status = getPileOptionStatus(option);
    const governingCpt = option.governing_cpt_id
      ? cpts.find((cpt) => cpt.id === option.governing_cpt_id) ?? null
      : null;
    const governingLabel = governingCpt?.name ?? "-";
    const governingHtml = governingCpt ? renderCptLink(governingCpt) : "-";
    const utilization = formatOptionalNumber(option.utilization, "%", 100);
    const frd = formatOptionalNumber(option.governing_frd_kn, " kN");
    const key = optionKey(option);
    const cost = pileCostByOptionKey.get(key) ?? null;
    const style = getConfigurationStyle(option, legendItems);
    const sizeLabel = `${formatNumber(option.pile_size_mm)} mm`;
    const tipLabel = `${formatNumber(option.pile_tip_level_m)} m`;

    return {
      costLabel: cost === null ? "-" : formatCurrency(cost),
      costValue: cost,
      frdLabel: frd,
      frdValue: option.governing_frd_kn,
      governingHtml,
      governingLabel,
      key,
      sizeLabel,
      sizeValue: option.pile_size_mm,
      statusClassName: status.className,
      statusLabel: status.label,
      symbolHtml: renderPileSymbol(style.shape, style.color),
      symbolLabel: `${sizeLabel} ${tipLabel}`,
      tipLabel,
      tipValue: option.pile_tip_level_m,
      useLabel: utilization,
      useValue: option.utilization,
    };
  });
}

function renderPileOptionRows(selectedLoadPoints: LoadPoint[]): string {
  const chosenKey = getChosenPileOptionKeyForSelection(selectedLoadPoints);
  const rows = getPileOptionTableRows(getRenderablePileOptionRows(selectedLoadPoints), pileOptionFilters, pileOptionSort);

  if (rows.length === 0) {
    return `<tr><td colspan="${PILE_OPTION_COLUMNS.length}" class="empty-table-cell">No pile options match the filters.</td></tr>`;
  }

  return rows
    .map((row) => {
      return `
        <tr class="pile-option-row${row.key === chosenKey ? " is-chosen" : ""}" data-pile-option-key="${row.key}">
          <td class="pile-option-symbol-cell">${row.symbolHtml}</td>
          <td>${row.sizeLabel}</td>
          <td>${row.tipLabel}</td>
          <td><span class="status-pill ${row.statusClassName}">${row.statusLabel}</span></td>
          <td>${row.costLabel}</td>
          <td>${row.useLabel}</td>
          <td>${row.governingHtml}</td>
          <td>${row.frdLabel}</td>
        </tr>
      `;
    })
    .join("");
}

function isSortablePileOptionColumn(column: PileOptionTableColumn): column is SortablePileOptionTableColumn {
  return column !== "symbol";
}

function getPileOptionsForSelection(selectedLoadPoints: LoadPoint[]): PileConfigurationOption[] {
  const options = selectedLoadPoints.length <= 1
    ? selectedLoadPoints[0] ? getPileOptions(selectedLoadPoints[0]) : []
    : aggregatePileOptionsForLoadPoints(selectedLoadPoints.map((loadPoint) => getPileOptions(loadPoint)));

  return filterActivePileOptions(options, getActivePileConfigurations());
}

function getChosenPileOptionKeyForSelection(selectedLoadPoints: LoadPoint[]): string {
  const selectedKeys = selectedLoadPoints.map((loadPoint) => {
    const chosenOption = getChosenPileOption(loadPoint);
    return selectedPileOptions.get(loadPoint.id) ?? (chosenOption ? optionKey(chosenOption) : "");
  });
  const firstKey = selectedKeys[0] ?? "";

  return selectedKeys.every((key) => key === firstKey) ? firstKey : "";
}

function getOptimizationTargetLoadPointIds(): number[] {
  if (optimizationSettings.targetScope === "selected") {
    return [...selectedLoadPointIds];
  }

  return loadPoints.map((loadPoint) => loadPoint.id);
}

function getPileOptionsByLoadPointIds(loadPointIds: number[]): Map<number, PileConfigurationOption[]> {
  return new Map(
    loadPointIds.map((loadPointId) => [
      loadPointId,
      pileOptionsByLoadPointId.get(loadPointId) ?? [],
    ]),
  );
}

function renderSymbolLegend(): string {
  const shapeItems = legendItems.pileSizes
    .map((item) => {
      const isActive = activePileSizes.includes(item.value);
      const isSelectionFilter = legendSelectionFilter.pileSizes.includes(item.value);
      const disabled = shouldDisableActivePileConfigurationToggle(getActivePileConfigurations(), "size", item.value);
      return `
        <button
          class="symbol-legend-item legend-toggle${isActive ? " is-active" : " is-inactive"}${isSelectionFilter ? " is-selection-filter" : ""}"
          type="button"
          data-legend-toggle="size"
          data-legend-value="${item.value}"
          aria-pressed="${isActive}"
          ${disabled ? "disabled" : ""}
        >
          ${renderPileSymbol(item.shape, "#ffffff")}
          ${formatNumber(item.value)} mm
        </button>
      `;
    })
    .join("");
  const colorItems = legendItems.pileTipLevels
    .map((item) => {
      const isActive = activePileTipLevels.includes(item.value);
      const isSelectionFilter = legendSelectionFilter.pileTipLevels.includes(item.value);
      const disabled = shouldDisableActivePileConfigurationToggle(getActivePileConfigurations(), "tip", item.value);
      return `
        <button
          class="symbol-legend-item legend-toggle${isActive ? " is-active" : " is-inactive"}${isSelectionFilter ? " is-selection-filter" : ""}"
          type="button"
          data-legend-toggle="tip"
          data-legend-value="${item.value}"
          aria-pressed="${isActive}"
          ${disabled ? "disabled" : ""}
        >
          <i class="color-swatch" style="--pile-color: ${item.color}"></i>
          ${formatNumber(item.value)} m
        </button>
      `;
    })
    .join("");

  return `
    <div class="symbol-legend" aria-label="Pile symbol legend">
      <div class="symbol-legend-actions">
        <button class="secondary-action compact-action" type="button" data-legend-action="all-on">All On</button>
        <button class="secondary-action compact-action" type="button" data-legend-action="all-off">All Off</button>
      </div>
      <div>
        <strong>Size</strong>
        ${shapeItems}
      </div>
      <div>
        <strong>Tip</strong>
        ${colorItems}
      </div>
    </div>
  `;
}

function renderProjectCostSummary(): string {
  const costs = loadPoints.map((loadPoint) => {
    const chosenOption = getChosenPileOption(loadPoint);
    return chosenOption ? pileCostByOptionKey.get(optionKey(chosenOption)) : null;
  });
  const summary = summarizeProjectCosts(costs);
  const missingText =
    summary.missingCount > 0 ? `<span>${summary.missingCount} load point${summary.missingCount === 1 ? "" : "s"} without cost</span>` : "";

  return `
    <div class="project-cost-summary" aria-label="Total project cost">
      <strong>Total Cost</strong>
      <span>${formatCurrency(summary.totalCost)}</span>
      ${missingText}
    </div>
  `;
}

function createCurrentIfcppProject() {
  const currentPileChoices = new Map(
    loadPoints.map((loadPoint) => {
      const chosenOption = getChosenPileOption(loadPoint);
      return [loadPoint.id, chosenOption ? optionKey(chosenOption) : NO_PILE_OPTION_KEY] as const;
    }),
  );

  return createIfcppProject({
    name: projectData.name,
    loadPoints,
    cpts,
    bearingCapacities,
    globalCptSelectionSettings,
    cptSelectionSettingsByLoadPoint,
    pileCostSettings,
    optimizationSettings: buildGreedyOptimizationSettings({
      activePileSizes,
      activePileTipLevels,
      uiSettings: optimizationSettings,
      baselineOptions: [],
    }),
    activePileSizes,
    activePileTipLevels,
    selectedPileOptionKeysByLoadPoint: currentPileChoices,
    manualCptIdsByLoadPoint,
  });
}

async function importProjectFiles(assignments: ImportFileAssignments<File>): Promise<void> {
  const loadPointsFile = assignments["load-points"];
  const cptsFile = assignments.cpts;
  const bearingCapacitiesFile = assignments["bearing-capacities"];

  if (!loadPointsFile || !cptsFile || !bearingCapacitiesFile) {
    throw new Error("Choose a load points file, CPT coordinates file and bearing capacities file.");
  }

  const project = await importProjectFromFilesCore({
    projectName: "Imported Project",
    loadPointsCsv: await loadPointsFile.text(),
    cptsXlsx: new Uint8Array(await cptsFile.arrayBuffer()),
    bearingCapacitiesXlsx: new Uint8Array(await bearingCapacitiesFile.arrayBuffer()),
  });

  await loadProjectData(loadIfcppProjectData(applyDefaultPileCostSettings(project, pileCostSettings)));
}

function downloadCurrentIfcppProject(): void {
  const ifcppText = JSON.stringify(createCurrentIfcppProject(), null, 2);
  const blob = new Blob([ifcppText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${projectData.name.trim().replace(/[^a-z0-9-_]+/gi, "-") || "pile-plan-project"}.ifcpp`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderImportDialog(): string {
  if (!isImportDialogOpen) {
    return "";
  }

  return `
    <div class="modal-backdrop" role="presentation">
      <section class="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
        <div class="panel-heading">
          <h2 id="import-dialog-title">Import Project</h2>
          <button class="secondary-action compact-action" type="button" data-import-dialog-action="close">Close</button>
        </div>
        <p class="supporting-text">
          Select three files at once to auto-fill the roles, or choose each file separately.
        </p>
        <div class="settings-actions">
          <button class="secondary-action" type="button" data-import-dialog-action="choose-all">Choose Files</button>
          <input class="visually-hidden" type="file" accept=".csv,.xlsx" multiple data-import-file-input="all">
        </div>
        <div class="import-file-list">
          ${renderImportFileRow("load-points", "Load points", "CSV with id, x, y and FED")}
          ${renderImportFileRow("cpts", "CPT coordinates", "Excel with CPT id, x and y")}
          ${renderImportFileRow("bearing-capacities", "Bearing capacities", "Excel with CPT, tip, size and FRD")}
        </div>
        <div class="settings-actions">
          <button
            class="primary-action"
            type="button"
            data-import-dialog-action="import"
            ${areImportFileAssignmentsComplete(importFileAssignments) ? "" : "disabled"}
          >Import</button>
        </div>
      </section>
    </div>
  `;
}

function renderImportFileRow(role: ImportFileRole, label: string, description: string): string {
  const file = importFileAssignments[role];

  return `
    <div class="import-file-row">
      <div>
        <strong>${label}</strong>
        <span>${description}</span>
        <em>${file ? escapeHtml(file.name) : "No file selected"}</em>
      </div>
      <div class="import-file-actions">
        <button class="secondary-action compact-action" type="button" data-import-file-role="${role}">Choose</button>
        <button class="secondary-action compact-action" type="button" data-import-clear-role="${role}" ${file ? "" : "disabled"}>Clear</button>
        <input class="visually-hidden" type="file" accept="${role === "load-points" ? ".csv" : ".xlsx"}" data-import-file-input="${role}">
      </div>
    </div>
  `;
}

function isImportFileRole(value: string | undefined): value is ImportFileRole {
  return value === "load-points" || value === "cpts" || value === "bearing-capacities";
}

function renderRightPanel(selectedLoadPoints: LoadPoint[]): string {
  const view = getRightPanelView({
    rightPanelMode,
  });
  const content =
    view === "cpt-settings"
      ? renderCptSettingsPanel()
      : view === "cost-settings"
        ? renderCostSettingsPanel()
        : view === "optimization-settings"
          ? renderOptimizationSettingsPanel()
        : view === "cpts"
          ? renderCptsPanel(selectedLoadPoints)
          : renderLoadPointPanel(selectedLoadPoints);

  return `
    <div class="right-panel-shell">
      ${renderRightPanelTabs()}
      <div class="right-panel-content">
        ${content}
      </div>
    </div>
  `;
}

function renderRightPanelTabs(): string {
  return `
    <div class="right-panel-tabs" role="tablist" aria-label="Right panel view">
      ${renderRightPanelTab("load-point", "Load Point")}
      ${renderRightPanelTab("cpts", "CPTs")}
      ${renderRightPanelTab("cpt-settings", "CPT Settings")}
      ${renderRightPanelTab("cost-settings", "Cost Settings")}
      ${renderRightPanelTab("optimization-settings", "Optimization")}
    </div>
  `;
}

function renderRightPanelTab(mode: RightPanelMode, label: string): string {
  return `
    <button
      class="${rightPanelMode === mode ? "is-selected" : ""}"
      type="button"
      data-panel-mode="${mode}"
      role="tab"
      aria-selected="${rightPanelMode === mode}"
    >${label}</button>
  `;
}

function renderNoSelectionPanel(title = "No Load Point Selected", body = "Select a load point in the viewer to inspect pile options."): string {
  return `
    <div class="empty-panel">
      <h2>${title}</h2>
      <p>${body}</p>
    </div>
  `;
}

function renderCptsPanel(selectedLoadPoints: LoadPoint[]): string {
  const cpt = cpts.find((item) => item.id === selectedCptId) ?? null;

  if (cpt) {
    return renderCptFrdPanel(cpt);
  }

  if (selectedLoadPoints.length === 0) {
    return renderNoSelectionPanel("No CPTs Selected", "Select a load point to see its selected CPTs, or click a CPT in the viewer.");
  }

  return renderSelectedCptsPanel(selectedLoadPoints);
}

function renderSelectedCptsPanel(selectedLoadPoints: LoadPoint[]): string {
  const tableModel = getSelectedCptTableModel(
    selectedLoadPoints.map((loadPoint) => ({
      loadPoint,
      selectedCpts: getSelectedCptsForLoadPoint(loadPoint),
    })),
  );

  if (tableModel.rows.length === 0) {
    return renderNoSelectionPanel("No CPTs Available", "No selected CPTs are available for the current load point selection.");
  }

  const columns = [...tableModel.columns, "FRd range"];
  const rows = tableModel.rows
    .map((row) => {
      const cptRows = cptFrdRowsByCptId.get(row.cpt.id) ?? [];
      const frds = cptRows.map((cptRow) => cptRow.frd_kn);
      const frdRange = frds.length
        ? `${formatNumber(Math.min(...frds))}-${formatNumber(Math.max(...frds))} kN`
        : "-";
      const cells = row.values.map((value, index) => {
        const column = tableModel.columns[index];

        if (column === "CPT") {
          return `<td>${renderCptLink(row.cpt)}</td>`;
        }

        return `<td>${escapeHtml(value)}</td>`;
      });

      return `
        <tr>
          ${cells.join("")}
          <td>${frdRange}</td>
        </tr>
      `;
    })
    .join("");
  const headerCells = columns.map((column) => `<th>${column}</th>`).join("");

  return `
    <div class="panel-heading">
      <h2>${selectedLoadPoints.length > 1 ? "Selected - CPTs" : `${selectedLoadPoints[0].name} - CPTs`}</h2>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderCptFrdPanel(cpt: Cpt): string {
  const rows = cptFrdRowsByCptId.get(cpt.id) ?? [];
  const rowHtml = rows
    .map(
      (row) => `
        <tr>
          <td>${formatNumber(row.pile_size_mm)} mm</td>
          <td>${formatNumber(row.pile_tip_level_m)} m</td>
          <td>${formatNumber(row.frd_kn)} kN</td>
        </tr>
      `,
    )
    .join("");

  return `
    <div class="panel-heading">
      <h2>${cpt.name}</h2>
    </div>

    <dl class="detail-grid">
      <div>
        <dt>X</dt>
        <dd>${formatNumber(cpt.x_mm)} mm</dd>
      </div>
      <div>
        <dt>Y</dt>
        <dd>${formatNumber(cpt.y_mm)} mm</dd>
      </div>
    </dl>

    <h3>FRD Values</h3>
    <div class="table-wrap cpt-frd-wrap">
      <table>
        <thead>
          <tr>
            <th>Size</th>
            <th>Tip</th>
            <th>FRD</th>
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
    </div>
  `;
}

function renderCptLink(cpt: Cpt): string {
  return `<button class="text-link" type="button" data-open-cpt-id="${cpt.id}">${cpt.name}</button>`;
}

function renderPileOptionTableHeaders(selectedLoadPoints: LoadPoint[]): string {
  const tableRows = getRenderablePileOptionRows(selectedLoadPoints);
  const headerCells = PILE_OPTION_COLUMNS.map((column) => {
    if (column.key === "symbol") {
      return `<th class="symbol-header" aria-label="Symbol"></th>`;
    }

    const label = column.key === "use" ? getUseColumnLabel(selectedLoadPoints.length) : column.label;
    const sortMark = pileOptionSort?.column === column.key ? (pileOptionSort.direction === "asc" ? "↑" : "↓") : "";
    const filterValues = getPileOptionFilterValues(tableRows, column.key);
    const selectedFilters = pileOptionFilters[column.key];
    const hasActiveFilter = selectedFilters.length > 0;

    return `
      <th class="filterable-header">
        <button class="table-sort-button" type="button" data-pile-option-sort="${column.key}" aria-label="Sort by ${label}">
          <span>${label}</span>
          <span aria-hidden="true">${sortMark}</span>
        </button>
        <button
          class="table-filter-button${hasActiveFilter ? " is-active" : ""}"
          type="button"
          data-pile-option-filter-menu="${column.key}"
          aria-label="Filter ${label}"
          aria-expanded="${openPileOptionFilterColumn === column.key}"
        >▾</button>
        ${
          openPileOptionFilterColumn === column.key
            ? renderPileOptionFilterMenu(column.key, filterValues, selectedFilters)
            : ""
        }
      </th>
    `;
  }).join("");

  return `<tr>${headerCells}</tr>`;
}

function renderPileOptionFilterMenu(
  column: SortablePileOptionTableColumn,
  filterValues: string[],
  selectedFilters: string[],
): string {
  return `
    <div class="table-filter-menu" data-pile-option-filter-panel="${column}">
      <div class="table-filter-menu-actions">
        <button type="button" data-pile-option-filter-select-all="${column}">All</button>
        <button type="button" data-pile-option-filter-clear="${column}">Clear</button>
      </div>
      <div class="table-filter-menu-options">
        ${filterValues
          .map((value) => {
            const checked = selectedFilters.includes(value);
            return `
              <label>
                <input
                  type="checkbox"
                  ${checked ? "checked" : ""}
                  data-pile-option-filter-value="${column}"
                  value="${escapeHtmlAttribute(value)}"
                >
                <span>${escapeHtml(value)}</span>
              </label>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderLoadPointPanel(selectedLoadPoints: LoadPoint[]): string {
  if (selectedLoadPoints.length === 0) {
    return renderNoSelectionPanel();
  }

  const selectedLoadPoint = selectedLoadPoints[0];
  const hasMultipleLoadPoints = selectedLoadPoints.length > 1;

  return `
    <div class="load-point-panel">
      <div class="panel-heading">
        <h2>${hasMultipleLoadPoints ? `${selectedLoadPoints.length} Load Points Selected` : selectedLoadPoint.name}</h2>
      </div>

      ${
        hasMultipleLoadPoints
          ? `<p class="supporting-text">Pile options are OK only when every selected load point allows the same configuration.</p>`
          : `
            <dl class="detail-grid">
              <div class="fed-detail">
                <dt>FED</dt>
                <dd>${formatNumber(selectedLoadPoint.design_load_kn)} kN</dd>
              </div>
              <div>
                <dt>X</dt>
                <dd>${formatNumber(selectedLoadPoint.x_mm)} mm</dd>
              </div>
              <div>
                <dt>Y</dt>
                <dd>${formatNumber(selectedLoadPoint.y_mm)} mm</dd>
              </div>
            </dl>

          `
      }

      <h3>Pile Options</h3>
      <div class="table-wrap pile-options-wrap">
        <table>
          <thead>
            ${renderPileOptionTableHeaders(selectedLoadPoints)}
          </thead>
          <tbody>${renderPileOptionRows(selectedLoadPoints)}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCptSettingsPanel(): string {
  const selectedLoadPoint = loadPoints.find((loadPoint) => loadPoint.id === selectedLoadPointId) ?? loadPoints[0];
  const activeSettings = getActiveCptSelectionSettings();
  const hasLocalSettings = cptSelectionSettingsByLoadPoint.has(selectedLoadPoint.id);
  const manualCptIds = manualCptIdsByLoadPoint.get(selectedLoadPoint.id);
  const isEditingSelection = cptSelectionEditDraft?.loadPointId === selectedLoadPoint.id;
  const draftCount = cptSelectionEditDraft?.cptIds.size ?? 0;

  return `
    <div class="panel-heading">
      <h2>CPT Settings</h2>
    </div>

    <div class="settings-group">
      <h3>Apply Settings To</h3>
      <div class="segmented-control" role="group" aria-label="CPT settings scope">
        <button class="${cptSettingsScope === "all" ? "is-selected" : ""}" type="button" data-cpt-settings-scope="all">All load points</button>
        <button class="${cptSettingsScope === "current" ? "is-selected" : ""}" type="button" data-cpt-settings-scope="current">This load point</button>
      </div>
      <p class="supporting-text">
        ${hasLocalSettings ? "This load point has its own algorithm settings." : "This load point uses the global algorithm settings."}
      </p>
    </div>

    <div class="settings-group">
      <label class="field-label" for="max-cpt-distance">Maximum CPT distance</label>
      <div class="number-field">
        <input id="max-cpt-distance" type="number" min="0" step="1" value="${activeSettings.maxDistanceM}" data-cpt-setting="maxDistanceM">
        <span>m</span>
      </div>
    </div>

    <div class="settings-group">
      <h3>Algorithm</h3>
      <div class="algorithm-grid" role="radiogroup" aria-label="CPT selection algorithm">
        ${renderAlgorithmOption("quadrants", "Four Quadrants", renderQuadrantSketch())}
        ${renderAlgorithmOption("maximum-angle", "Maximum Angle", renderMaximumAngleSketch())}
      </div>
    </div>

    <div class="settings-group${activeSettings.algorithm === "maximum-angle" ? "" : " is-muted"}">
      <label class="field-label" for="max-cpt-angle">Maximum angle</label>
      <div class="number-field">
        <input
          id="max-cpt-angle"
          type="number"
          min="1"
          max="360"
          step="1"
          value="${activeSettings.maxAngleDegrees}"
          data-cpt-setting="maxAngleDegrees"
          ${activeSettings.algorithm === "maximum-angle" ? "" : "disabled"}
        >
        <span>deg</span>
      </div>
    </div>

    <div class="settings-group">
      <h3>Manual Selection</h3>
      <p class="supporting-text">
        ${
          isEditingSelection
            ? `${draftCount} CPTs selected. Click CPTs in the viewer to add or remove them.`
            : manualCptIds
              ? `${manualCptIds.length} CPTs are manually selected for this load point.`
              : "This load point currently uses the algorithmic CPT selection."
        }
      </p>
      <div class="selection-actions">
        ${
          isEditingSelection
            ? `
              <button class="secondary-action compact-action" type="button" data-cpt-selection-action="save">Save</button>
              <button class="secondary-action compact-action" type="button" data-cpt-selection-action="cancel">Cancel</button>
            `
            : `
              <button class="secondary-action compact-action" type="button" data-cpt-selection-action="edit">Edit Selection</button>
              ${manualCptIds ? `<button class="secondary-action compact-action" type="button" data-cpt-selection-action="clear">Use Algorithm</button>` : ""}
            `
        }
      </div>
    </div>
  `;
}

function renderCostSettingsPanel(): string {
  const rows = pileCostSettings.items
    .map(
      (item) => `
        <tr>
          <td>${formatNumber(item.pile_size_mm)} mm</td>
          <td>
            <select data-cost-size="${item.pile_size_mm}" data-cost-setting="shape">
              <option value="square"${item.shape === "square" ? " selected" : ""}>Square</option>
              <option value="round"${item.shape === "round" ? " selected" : ""}>Round</option>
            </select>
          </td>
          <td>
            <input
              class="table-number-input"
              type="number"
              min="0"
              step="1"
              value="${item.cost_per_m3_eur}"
              data-cost-size="${item.pile_size_mm}"
              data-cost-setting="cost_per_m3_eur"
            >
          </td>
        </tr>
      `,
    )
    .join("");

  return `
    <div class="panel-heading">
      <h2>Cost Settings</h2>
    </div>

    <div class="settings-group">
      <label class="field-label" for="pile-head-level">Pile head level</label>
      <div class="number-field">
        <input id="pile-head-level" type="number" step="0.1" value="${pileCostSettings.pile_head_level_m}" data-cost-global-setting="pile_head_level_m">
        <span>m</span>
      </div>
    </div>

    <h3>Pile Size Costs</h3>
    <div class="table-wrap cost-settings-wrap">
      <table>
        <thead>
          <tr>
            <th>Size</th>
            <th>Shape</th>
            <th>Cost per m3</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderOptimizationSettingsPanel(): string {
  const effectiveSettings = clampOptimizationUiSettingsToActiveConfigurations(optimizationSettings, getActivePileConfigurations());
  const maxDifferentSizeLimit = activePileSizes.length;
  const maxDifferentTipLimit = activePileTipLevels.length;
  const maxConfigurationLimit = effectiveSettings.maxDifferentSizes * effectiveSettings.maxDifferentTips;
  const minimumSizeLimit = maxDifferentSizeLimit === 0 ? 0 : 1;
  const minimumTipLimit = maxDifferentTipLimit === 0 ? 0 : 1;
  const minimumConfigurationLimit = maxConfigurationLimit === 0 ? 0 : 1;
  const selectedCount = selectedLoadPointIds.length;
  return `
    <div class="panel-heading">
      <h2>Optimization Settings</h2>
    </div>

    <div class="settings-group">
      <p class="supporting-text">
        The greedy optimizer adds pile configurations one by one. Each step chooses the configuration that gives the best
        coverage and cost improvement within the active legend toggles and the limits below.
      </p>
    </div>

    <div class="settings-group">
      <h3>Optimize</h3>
      <div class="segmented-control" role="group" aria-label="Optimization target">
        <button class="${optimizationSettings.targetScope === "all" ? "is-selected" : ""}" type="button" data-optimization-choice="targetScope" data-optimization-value="all">All load points</button>
        <button class="${optimizationSettings.targetScope === "selected" ? "is-selected" : ""}" type="button" data-optimization-choice="targetScope" data-optimization-value="selected">Selected (${selectedCount})</button>
      </div>
    </div>

    <div class="settings-group${optimizationSettings.targetScope === "selected" ? "" : " is-muted"}">
      <h3>Limits Apply To</h3>
      <div class="segmented-control" role="group" aria-label="Optimization limit scope">
        <button class="${optimizationSettings.limitScope === "target" ? "is-selected" : ""}" type="button" data-optimization-choice="limitScope" data-optimization-value="target" ${optimizationSettings.targetScope === "selected" ? "" : "disabled"}>Optimized points</button>
        <button class="${optimizationSettings.limitScope === "whole-plan" ? "is-selected" : ""}" type="button" data-optimization-choice="limitScope" data-optimization-value="whole-plan" ${optimizationSettings.targetScope === "selected" ? "" : "disabled"}>Whole plan</button>
      </div>
    </div>

    <div class="settings-group">
      <label class="field-label slider-label" for="max-pile-sizes">
        <span>Max different sizes</span>
        <strong data-optimization-slider-value="maxDifferentSizes">${effectiveSettings.maxDifferentSizes}</strong>
      </label>
      <div class="slider-field">
        <input
          id="max-pile-sizes"
          type="range"
          min="${minimumSizeLimit}"
          max="${maxDifferentSizeLimit}"
          step="any"
          value="${effectiveSettings.maxDifferentSizes}"
          data-optimization-number="maxDifferentSizes"
          ${maxDifferentSizeLimit === 0 ? "disabled" : ""}
        >
      </div>
    </div>

    <div class="settings-group">
      <label class="field-label slider-label" for="max-pile-tip-levels">
        <span>Max different tips</span>
        <strong data-optimization-slider-value="maxDifferentTips">${effectiveSettings.maxDifferentTips}</strong>
      </label>
      <div class="slider-field">
        <input
          id="max-pile-tip-levels"
          type="range"
          min="${minimumTipLimit}"
          max="${maxDifferentTipLimit}"
          step="any"
          value="${effectiveSettings.maxDifferentTips}"
          data-optimization-number="maxDifferentTips"
          ${maxDifferentTipLimit === 0 ? "disabled" : ""}
        >
      </div>
    </div>

    <div class="settings-group">
      <label class="field-label slider-label" for="max-pile-configurations">
        <span>Max different configurations</span>
        <strong data-optimization-slider-value="maxDifferentConfigurations">${effectiveSettings.maxDifferentConfigurations}</strong>
      </label>
      <div class="slider-field">
        <input
          id="max-pile-configurations"
          type="range"
          min="${minimumConfigurationLimit}"
          max="${maxConfigurationLimit}"
          step="any"
          value="${effectiveSettings.maxDifferentConfigurations}"
          data-optimization-number="maxDifferentConfigurations"
          ${maxConfigurationLimit === 0 ? "disabled" : ""}
        >
      </div>
    </div>

    <div class="settings-group">
      <h3>Active Configurations</h3>
      <p class="supporting-text">
        Uses ${activePileSizes.length} active size${activePileSizes.length === 1 ? "" : "s"} and ${activePileTipLevels.length}
        active tip level${activePileTipLevels.length === 1 ? "" : "s"} from the legend.
      </p>
    </div>

    <div class="settings-actions">
      <button class="primary-action" type="button" data-optimization-action="run">Run Greedy Optimization</button>
    </div>

    ${renderOptimizationRunSummary()}
  `;
}

function renderOptimizationRunSummary(): string {
  if (!lastOptimizationSummary) {
    return "";
  }

  const unchangedMessage =
    lastOptimizationSummary.changedCount === 0
      ? "<p>Current pile choices already match these optimization settings.</p>"
      : "";

  return `
    <div class="optimization-summary">
      <strong>Applied to ${lastOptimizationSummary.appliedCount} load points.</strong>
      <p>${lastOptimizationSummary.changedCount} changed.</p>
      ${unchangedMessage}
    </div>
  `;
}

function renderAlgorithmOption(algorithm: CptSelectionAlgorithm, title: string, sketch: string): string {
  const isSelected = getActiveCptSelectionSettings().algorithm === algorithm;

  return `
    <button
      class="algorithm-option${isSelected ? " is-selected" : ""}"
      type="button"
      data-cpt-algorithm="${algorithm}"
      aria-pressed="${isSelected}"
    >
      ${sketch}
      <span>${title}</span>
    </button>
  `;
}

function renderQuadrantSketch(): string {
  return `
    <svg class="algorithm-sketch" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
      <line x1="60" y1="8" x2="60" y2="72"></line>
      <line x1="18" y1="40" x2="102" y2="40"></line>
      <circle class="sketch-load" cx="60" cy="40" r="4"></circle>
      <circle cx="84" cy="18" r="5"></circle>
      <circle cx="88" cy="62" r="5"></circle>
      <circle cx="34" cy="20" r="5"></circle>
      <circle cx="30" cy="60" r="5"></circle>
    </svg>
  `;
}

function renderMaximumAngleSketch(): string {
  return `
    <svg class="algorithm-sketch" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
      <path class="sketch-arc" d="M 76 24 A 24 24 0 0 1 76 56"></path>
      <line x1="60" y1="40" x2="96" y2="40"></line>
      <line x1="60" y1="40" x2="78" y2="15"></line>
      <line x1="60" y1="40" x2="78" y2="65"></line>
      <circle class="sketch-load" cx="60" cy="40" r="4"></circle>
      <circle cx="96" cy="40" r="5"></circle>
      <circle cx="78" cy="15" r="5"></circle>
      <circle cx="78" cy="65" r="5"></circle>
    </svg>
  `;
}

function render(): void {
  const selectedLoadPoints = getSelectedLoadPoints();

  appRoot.innerHTML = `
    <section class="workspace">
      <header class="top-bar">
        <div>
          <p class="eyebrow">OpenAEC concept</p>
          <h1>Pile Plan Studio</h1>
        </div>
        <div class="project-actions">
          <span class="project-name">${escapeHtml(projectData.name)}</span>
          <button class="secondary-action" type="button" data-project-action="import">Import Project</button>
          <button class="secondary-action" type="button" data-project-action="download">Download IFCPP</button>
        </div>
      </header>
      ${projectImportMessage ? `<div class="project-message">${escapeHtml(projectImportMessage)}</div>` : ""}
      ${renderImportDialog()}

      <section class="layout" style="--right-panel-width: ${rightPanelWidth}px">
        <section class="canvas-area" aria-label="Project data map">
          <div class="canvas-header">
            ${renderProjectCostSummary()}
            <div class="zoom-controls" aria-label="Map zoom controls">
              <button type="button" data-zoom-action="out" aria-label="Zoom out">-</button>
              <span data-zoom-value>${Math.round(viewport.scale * 100)}%</span>
              <button type="button" data-zoom-action="in" aria-label="Zoom in">+</button>
            </div>
          </div>
          ${renderSymbolLegend()}
          ${renderMap(selectedLoadPoints)}
        </section>

        <div class="layout-resizer" role="separator" aria-label="Resize right panel" aria-orientation="vertical"></div>

        <aside class="panel right-panel">
          ${renderRightPanel(selectedLoadPoints)}
        </aside>
      </section>
    </section>
  `;

  appRoot.querySelectorAll<HTMLButtonElement>("[data-load-point-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (cptSelectionEditDraft) {
        return;
      }

      const loadPointId = Number(button.dataset.loadPointId);
      setSelectionState(
        event.shiftKey
          ? addLoadPointsToSelection(getSelectionState(), [loadPointId], { toggle: true })
          : selectLoadPoint(getSelectionState(), loadPointId),
      );
      legendSelectionFilter = { pileSizes: [], pileTipLevels: [] };
      syncActiveConfigurationsToUsedPileChoices();
      cptSelectionEditDraft = null;
      render();
    });
  });

  appRoot.querySelector<HTMLButtonElement>("[data-project-action='import']")?.addEventListener("click", () => {
    isImportDialogOpen = true;
    projectImportMessage = null;
    render();
  });
  appRoot.querySelector<HTMLButtonElement>("[data-project-action='download']")?.addEventListener("click", () => {
    try {
      projectImportMessage = null;
      downloadCurrentIfcppProject();
    } catch (error) {
      projectImportMessage = error instanceof Error ? error.message : "Could not download IFCPP project.";
      render();
    }
  });

  appRoot.querySelector<HTMLButtonElement>("[data-import-dialog-action='close']")?.addEventListener("click", () => {
    isImportDialogOpen = false;
    render();
  });
  appRoot.querySelector<HTMLButtonElement>("[data-import-dialog-action='choose-all']")?.addEventListener("click", () => {
    appRoot.querySelector<HTMLInputElement>("[data-import-file-input='all']")?.click();
  });
  appRoot.querySelector<HTMLInputElement>("[data-import-file-input='all']")?.addEventListener("change", (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement) || !input.files || input.files.length === 0) {
      return;
    }
    importFileAssignments = inferImportFileAssignments([...input.files], importFileAssignments);
    input.value = "";
    render();
  });
  appRoot.querySelectorAll<HTMLButtonElement>("[data-import-file-role]").forEach((button) => {
    button.addEventListener("click", () => {
      const role = button.dataset.importFileRole;
      if (isImportFileRole(role)) {
        appRoot.querySelector<HTMLInputElement>(`[data-import-file-input="${role}"]`)?.click();
      }
    });
  });
  appRoot.querySelectorAll<HTMLInputElement>("[data-import-file-input]").forEach((input) => {
    input.addEventListener("change", () => {
      const role = input.dataset.importFileInput;
      if (!isImportFileRole(role) || !input.files?.[0]) {
        return;
      }
      importFileAssignments = { ...importFileAssignments, [role]: input.files[0] };
      input.value = "";
      render();
    });
  });
  appRoot.querySelectorAll<HTMLButtonElement>("[data-import-clear-role]").forEach((button) => {
    button.addEventListener("click", () => {
      const role = button.dataset.importClearRole;
      if (!isImportFileRole(role)) {
        return;
      }
      importFileAssignments = { ...importFileAssignments, [role]: null };
      render();
    });
  });
  appRoot.querySelector<HTMLButtonElement>("[data-import-dialog-action='import']")?.addEventListener("click", async () => {
    if (!areImportFileAssignmentsComplete(importFileAssignments)) {
      projectImportMessage = "Choose all three import files before importing.";
      render();
      return;
    }

    try {
      projectImportMessage = "Importing project...";
      render();
      await importProjectFiles(importFileAssignments);
      projectImportMessage = "Project imported.";
      isImportDialogOpen = false;
      importFileAssignments = emptyImportFileAssignments<File>();
    } catch (error) {
      projectImportMessage = error instanceof Error ? error.message : "Could not import project files.";
    } finally {
      render();
    }
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-panel-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPanelMode =
        button.dataset.panelMode === "cpt-settings"
          ? "cpt-settings"
          : button.dataset.panelMode === "cost-settings"
            ? "cost-settings"
            : button.dataset.panelMode === "optimization-settings"
              ? "optimization-settings"
              : button.dataset.panelMode === "cpts"
                ? "cpts"
            : "load-point";
      setSelectionState(switchRightPanelMode(getSelectionState(), nextPanelMode));
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-open-cpt-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setSelectionState(openCpt(getSelectionState(), Number(button.dataset.openCptId)));
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-pile-option-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const column = button.dataset.pileOptionSort as PileOptionTableColumn | undefined;

      if (!column || !isSortablePileOptionColumn(column)) {
        return;
      }

      pileOptionSort = getNextPileOptionSortState(pileOptionSort, column);
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-pile-option-filter-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const column = button.dataset.pileOptionFilterMenu as PileOptionTableColumn | undefined;

      if (!column || !isSortablePileOptionColumn(column)) {
        return;
      }

      openPileOptionFilterColumn = openPileOptionFilterColumn === column ? null : column;
      render();
    });
  });

  appRoot.querySelectorAll<HTMLInputElement>("[data-pile-option-filter-value]").forEach((input) => {
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    input.addEventListener("change", () => {
      const column = input.dataset.pileOptionFilterValue as PileOptionTableColumn | undefined;

      if (!column || !isSortablePileOptionColumn(column)) {
        return;
      }

      const selectedValues = new Set(pileOptionFilters[column]);
      if (input.checked) {
        selectedValues.add(input.value);
      } else {
        selectedValues.delete(input.value);
      }
      pileOptionFilters = { ...pileOptionFilters, [column]: [...selectedValues] };
      openPileOptionFilterColumn = column;
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-pile-option-filter-clear]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const column = button.dataset.pileOptionFilterClear as PileOptionTableColumn | undefined;

      if (!column || !isSortablePileOptionColumn(column)) {
        return;
      }

      pileOptionFilters = { ...pileOptionFilters, [column]: [] };
      openPileOptionFilterColumn = column;
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-pile-option-filter-select-all]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const column = button.dataset.pileOptionFilterSelectAll as PileOptionTableColumn | undefined;

      if (!column || !isSortablePileOptionColumn(column)) {
        return;
      }

      pileOptionFilters = {
        ...pileOptionFilters,
        [column]: getPileOptionFilterValues(getRenderablePileOptionRows(selectedLoadPoints), column),
      };
      openPileOptionFilterColumn = column;
      render();
    });
  });

  appRoot.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-cost-global-setting]").forEach((input) => {
    input.addEventListener("change", async () => {
      const value = Number(input.value);

      if (!Number.isFinite(value)) {
        render();
        return;
      }

      await updatePileCostSettings({
        ...pileCostSettings,
        pile_head_level_m: value,
      });
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-legend-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const value = Number(button.dataset.legendValue);
      const kind = button.dataset.legendToggle;

      if (!Number.isFinite(value)) {
        return;
      }

      if ((event.shiftKey || isShiftKeyPressed) && (kind === "size" || kind === "tip")) {
        legendSelectionFilter = toggleLegendSelectionFilter(legendSelectionFilter, kind, value);
        const selectedIds = getLoadPointIdsForLegendSelection(
          new Map(loadPoints.map((loadPoint) => [loadPoint.id, getChosenPileOption(loadPoint)])),
          legendSelectionFilter,
        );

        setSelectionState(
          selectedIds.length > 0
            ? {
              ...getSelectionState(),
              selectedLoadPointId: selectedIds[0] ?? null,
              selectedLoadPointIds: selectedIds,
              selectedCptId: null,
            }
            : clearSelection(getSelectionState()),
        );
        cptSelectionEditDraft = null;
        render();
        return;
      }

      if (kind === "size") {
        const nextActive = toggleActivePileConfiguration(getActivePileConfigurations(), "size", value);
        activePileSizes = nextActive.pileSizes;
      }

      if (kind === "tip") {
        const nextActive = toggleActivePileConfiguration(getActivePileConfigurations(), "tip", value);
        activePileTipLevels = nextActive.pileTipLevels;
      }

      syncOptimizationLimitsToActiveConfigurations();
      lastOptimizationSummary = null;
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-legend-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.legendAction === "all-on") {
        activePileSizes = availablePileSizes;
        activePileTipLevels = availablePileTipLevels;
      }

      if (button.dataset.legendAction === "all-off") {
        activePileSizes = [];
        activePileTipLevels = [];
      }

      legendSelectionFilter = { pileSizes: [], pileTipLevels: [] };
      syncOptimizationLimitsToActiveConfigurations();
      lastOptimizationSummary = null;
      render();
    });
  });

  appRoot.querySelectorAll<HTMLInputElement>("[data-optimization-number]").forEach((input) => {
    const updateOptimizationNumber = (shouldRender: boolean) => {
      const rawValue = Number(input.value);

      if (!Number.isFinite(rawValue)) {
        if (shouldRender) {
          render();
        }
        return;
      }

      if (input.dataset.optimizationNumber === "maxDifferentSizes") {
        optimizationLimitAutoState = { ...optimizationLimitAutoState, maxDifferentSizes: false };
        const maxDifferentSizes = snapSliderValueToInteger(
          rawValue,
          activePileSizes.length === 0 ? 0 : 1,
          activePileSizes.length,
        );
        optimizationSettings = {
          ...optimizationSettings,
          maxDifferentSizes,
          maxDifferentConfigurations: clampMaxDifferentConfigurations(
            optimizationSettings.maxDifferentConfigurations,
            activePileSizes.length * activePileTipLevels.length,
            1,
          ),
        };
        syncOptimizationLimitsToActiveConfigurations();
        lastOptimizationSummary = null;
        updateOptimizationSliderValue("maxDifferentSizes", optimizationSettings.maxDifferentSizes);
      }

      if (input.dataset.optimizationNumber === "maxDifferentTips") {
        optimizationLimitAutoState = { ...optimizationLimitAutoState, maxDifferentTips: false };
        const maxDifferentTips = snapSliderValueToInteger(
          rawValue,
          activePileTipLevels.length === 0 ? 0 : 1,
          activePileTipLevels.length,
        );
        optimizationSettings = {
          ...optimizationSettings,
          maxDifferentTips,
          maxDifferentConfigurations: clampMaxDifferentConfigurations(
            optimizationSettings.maxDifferentConfigurations,
            activePileSizes.length * activePileTipLevels.length,
            1,
          ),
        };
        syncOptimizationLimitsToActiveConfigurations();
        lastOptimizationSummary = null;
        updateOptimizationSliderValue("maxDifferentTips", optimizationSettings.maxDifferentTips);
      }

      if (input.dataset.optimizationNumber === "maxDifferentConfigurations") {
        optimizationLimitAutoState = { ...optimizationLimitAutoState, maxDifferentConfigurations: false };
        const maxDifferentConfigurations = snapSliderValueToInteger(
          rawValue,
          activePileSizes.length * activePileTipLevels.length === 0 ? 0 : 1,
          activePileSizes.length * activePileTipLevels.length,
        );
        optimizationSettings = {
          ...optimizationSettings,
          maxDifferentConfigurations: clampMaxDifferentConfigurations(
            maxDifferentConfigurations,
            activePileSizes.length * activePileTipLevels.length,
            1,
          ),
        };
        syncOptimizationLimitsToActiveConfigurations();
        lastOptimizationSummary = null;
        updateOptimizationSliderValue("maxDifferentConfigurations", optimizationSettings.maxDifferentConfigurations);
      }

      if (shouldRender) {
        render();
      }
    };
    input.addEventListener("input", () => updateOptimizationNumber(false));
    input.addEventListener("change", () => updateOptimizationNumber(true));
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-optimization-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const choice = button.dataset.optimizationChoice;
      const value = button.dataset.optimizationValue;

      if (choice === "targetScope") {
        optimizationSettings = {
          ...optimizationSettings,
          targetScope: value === "selected" ? "selected" : "all",
          limitScope: value === "selected" ? optimizationSettings.limitScope : "target",
        };
        lastOptimizationSummary = null;
      }

      if (choice === "limitScope" && optimizationSettings.targetScope === "selected") {
        optimizationSettings = {
          ...optimizationSettings,
          limitScope: value === "whole-plan" ? "whole-plan" : "target",
        };
        lastOptimizationSummary = null;
      }

      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-optimization-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.optimizationAction !== "run") {
        return;
      }

      syncOptimizationLimitsToActiveConfigurations();
      const previousChoiceKeys = new Map(
        loadPoints.map((loadPoint) => {
          const chosenOption = getChosenPileOption(loadPoint);
          return [loadPoint.id, chosenOption ? optionKey(chosenOption) : ""];
        }),
      );
      const optimizedLoadPointIds = getOptimizationTargetLoadPointIds();
      const choices = await greedyOptimizeCore({
        optionsByLoadPoint: getPileOptionsByLoadPointIds(optimizedLoadPointIds),
        costSettings: pileCostSettings,
        settings: buildGreedyOptimizationSettings({
          activePileSizes,
          activePileTipLevels,
          uiSettings: optimizationSettings,
          baselineOptions: optimizationSettings.targetScope === "selected" && optimizationSettings.limitScope === "whole-plan"
            ? loadPoints
              .filter((loadPoint) => !optimizedLoadPointIds.includes(loadPoint.id))
              .map(getChosenPileOption)
            : [],
        }),
      });

      const choiceLoadPointIds = new Set(choices.map((choice) => choice.load_point_id));
      const clearedLoadPointIds: number[] = [];
      optimizedLoadPointIds.forEach((loadPointId) => {
        if (!choiceLoadPointIds.has(loadPointId)) {
          selectedPileOptions.set(loadPointId, NO_PILE_OPTION_KEY);
          chosenPileOptionByLoadPointId.delete(loadPointId);
          clearedLoadPointIds.push(loadPointId);
        }
      });
      lastOptimizationSummary = summarizeOptimizationRun(previousChoiceKeys, choices, clearedLoadPointIds);
      choices.forEach((choice) => {
        selectedPileOptions.set(choice.load_point_id, `${choice.pile_size_mm}|${choice.pile_tip_level_m}`);
        chosenPileOptionByLoadPointId.delete(choice.load_point_id);
      });
      syncActiveConfigurationsToUsedPileChoices();
      legendSelectionFilter = { pileSizes: [], pileTipLevels: [] };
      render();
    });
  });

  appRoot.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-cost-size]").forEach((input) => {
    input.addEventListener("change", async () => {
      const pileSizeMm = Number(input.dataset.costSize);
      const setting = input.dataset.costSetting;

      await updatePileCostSettings({
        ...pileCostSettings,
        items: pileCostSettings.items.map((item) => {
          if (item.pile_size_mm !== pileSizeMm) {
            return item;
          }

          if (setting === "shape") {
            return { ...item, shape: input.value === "round" ? "round" : "square" };
          }

          const costPerM3 = Number(input.value);
          return { ...item, cost_per_m3_eur: Number.isFinite(costPerM3) ? Math.max(0, costPerM3) : item.cost_per_m3_eur };
        }),
      });
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-cpt-settings-scope]").forEach((button) => {
    button.addEventListener("click", async () => {
      cptSettingsScope = button.dataset.cptSettingsScope === "current" ? "current" : "all";
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-cpt-algorithm]").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateCptSelectionSettings({
        ...getActiveCptSelectionSettings(),
        algorithm: button.dataset.cptAlgorithm === "maximum-angle" ? "maximum-angle" : "quadrants",
      });
      render();
    });
  });

  appRoot.querySelectorAll<HTMLInputElement>("[data-cpt-setting]").forEach((input) => {
    input.addEventListener("change", async () => {
      const value = Number(input.value);

      if (!Number.isFinite(value)) {
        render();
        return;
      }

      if (input.dataset.cptSetting === "maxDistanceM") {
        await updateCptSelectionSettings({
          ...getActiveCptSelectionSettings(),
          maxDistanceM: Math.max(0, value),
        });
      }

      if (input.dataset.cptSetting === "maxAngleDegrees") {
        await updateCptSelectionSettings({
          ...getActiveCptSelectionSettings(),
          maxAngleDegrees: Math.min(360, Math.max(1, value)),
        });
      }

      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-cpt-selection-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.cptSelectionAction;

      if (action === "edit") {
        if (selectedLoadPointId === null) {
          render();
          return;
        }
        const selectedLoadPoint = loadPoints.find((loadPoint) => loadPoint.id === selectedLoadPointId) ?? loadPoints[0];
        const selectedCptIds = manualCptIdsByLoadPoint.get(selectedLoadPointId)
          ?? getSelectedCptsForLoadPoint(selectedLoadPoint).map((selection) => selection.cpt.id);
        cptSelectionEditDraft = {
          loadPointId: selectedLoadPointId,
          cptIds: new Set(selectedCptIds),
        };
      }

      if (
        action === "save"
        && selectedLoadPointId !== null
        && cptSelectionEditDraft?.loadPointId === selectedLoadPointId
      ) {
        manualCptIdsByLoadPoint.set(selectedLoadPointId, [...cptSelectionEditDraft.cptIds]);
        cptSelectionEditDraft = null;
        await rebuildPileOptionCache();
      }

      if (action === "cancel") {
        cptSelectionEditDraft = null;
      }

      if (action === "clear" && selectedLoadPointId !== null) {
        manualCptIdsByLoadPoint.delete(selectedLoadPointId);
        cptSelectionEditDraft = null;
        await rebuildPileOptionCache();
      }

      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-cpt-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!cptSelectionEditDraft || cptSelectionEditDraft.loadPointId !== selectedLoadPointId) {
        setSelectionState(openCpt(getSelectionState(), Number(button.dataset.cptId)));
        render();
        return;
      }

      const cptId = Number(button.dataset.cptId);

      if (cptSelectionEditDraft.cptIds.has(cptId)) {
        cptSelectionEditDraft.cptIds.delete(cptId);
      } else {
        cptSelectionEditDraft.cptIds.add(cptId);
      }

      render();
    });
  });

  appRoot.querySelectorAll<HTMLTableRowElement>("[data-pile-option-key]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("button, input")) {
        return;
      }

      const key = row.dataset.pileOptionKey;
      if (!key || selectedLoadPointIds.length === 0) {
        return;
      }
      selectedLoadPointIds.forEach((loadPointId) => {
        selectedPileOptions.set(loadPointId, key);
        chosenPileOptionByLoadPointId.delete(loadPointId);
      });
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-zoom-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const mapShell = appRoot.querySelector<HTMLElement>(".map-shell");
      const rect = mapShell?.getBoundingClientRect();
      const direction = button.dataset.zoomAction === "in" ? 0.2 : -0.2;
      const nextScale = clampScale(viewport.scale + direction);

      viewport = zoomViewportAtPoint(viewport, {
        cursorX: rect ? rect.width / 2 : 0,
        cursorY: rect ? rect.height / 2 : 0,
        nextScale,
      });
      updateViewportDisplay();
    });
  });

  const mapShell = appRoot.querySelector<HTMLElement>(".map-shell");
  const layoutResizer = appRoot.querySelector<HTMLElement>(".layout-resizer");

  layoutResizer?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    panelResizeState = { startX: event.clientX, startWidth: rightPanelWidth };
    layoutResizer.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-panel");
  });

  layoutResizer?.addEventListener("pointermove", (event) => {
    if (!panelResizeState) {
      return;
    }

    rightPanelWidth = resizeRightPanelWidth({
      startWidth: panelResizeState.startWidth,
      startX: panelResizeState.startX,
      currentX: event.clientX,
    });
    updateLayoutDisplay();
  });

  layoutResizer?.addEventListener("pointerup", (event) => {
    panelResizeState = null;
    layoutResizer.releasePointerCapture(event.pointerId);
    document.body.classList.remove("is-resizing-panel");
  });

  layoutResizer?.addEventListener("pointercancel", () => {
    panelResizeState = null;
    document.body.classList.remove("is-resizing-panel");
  });

  mapShell?.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = mapShell.getBoundingClientRect();
    const direction = event.deltaY < 0 ? 0.12 : -0.12;
    const nextScale = clampScale(viewport.scale + direction);

    viewport = zoomViewportAtPoint(viewport, {
      cursorX: event.clientX - rect.left,
      cursorY: event.clientY - rect.top,
      nextScale,
    });
    updateViewportDisplay();
  });

  mapShell?.addEventListener("pointerdown", (event) => {
    if (isMapLassoPointerDown(event)) {
      event.preventDefault();
      const rect = mapShell.getBoundingClientRect();
      const startX = event.clientX - rect.left;
      const startY = event.clientY - rect.top;
      const box = document.createElement("div");
      box.className = "lasso-box";
      mapShell.appendChild(box);
      dragState = { mode: "lasso", startX, startY, endX: startX, endY: startY, hasMoved: false, box };
      updateLassoBox(dragState);
      mapShell.setPointerCapture(event.pointerId);
      return;
    }

    if (!isMapPanPointerDown(event)) {
      return;
    }
    event.preventDefault();
    dragState = { mode: "pan", x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, hasMoved: false };
    mapShell.setPointerCapture(event.pointerId);
    mapShell.classList.add("is-panning");
  });

  mapShell?.addEventListener("pointermove", (event) => {
    if (!dragState) {
      return;
    }

    if (dragState.mode === "lasso") {
      const rect = mapShell.getBoundingClientRect();
      dragState.endX = event.clientX - rect.left;
      dragState.endY = event.clientY - rect.top;
      dragState.hasMoved =
        dragState.hasMoved || Math.hypot(dragState.endX - dragState.startX, dragState.endY - dragState.startY) > 4;
      updateLassoBox(dragState);
      return;
    }

    viewport = panViewport(viewport, {
      deltaX: event.clientX - dragState.x,
      deltaY: event.clientY - dragState.y,
    });
    const movedDistance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    dragState = {
      ...dragState,
      x: event.clientX,
      y: event.clientY,
      hasMoved: dragState.hasMoved || movedDistance > 4,
    };
    updateViewportDisplay();
  });

  mapShell?.addEventListener("pointerup", (event) => {
    if (dragState?.mode === "lasso") {
      const selectedIds = dragState.hasMoved ? getLoadPointIdsInLasso(mapShell, dragState) : [];
      dragState.box.remove();
      dragState = null;
      mapShell.releasePointerCapture(event.pointerId);
      if (selectedIds.length > 0) {
        setSelectionState(addLoadPointsToSelection(getSelectionState(), selectedIds));
        legendSelectionFilter = { pileSizes: [], pileTipLevels: [] };
        syncActiveConfigurationsToUsedPileChoices();
        cptSelectionEditDraft = null;
        render();
      }
      return;
    }

    const shouldClearSelection = dragState !== null && !dragState.hasMoved && event.button === 0;
    dragState = null;
    mapShell.releasePointerCapture(event.pointerId);
    mapShell.classList.remove("is-panning");
    if (shouldClearSelection) {
      legendSelectionFilter = { pileSizes: [], pileTipLevels: [] };
      setSelectionState(clearSelection(getSelectionState()));
      syncActiveConfigurationsToUsedPileChoices();
      cptSelectionEditDraft = null;
      render();
    }
  });

  mapShell?.addEventListener("pointercancel", () => {
    if (dragState?.mode === "lasso") {
      dragState.box.remove();
    }
    dragState = null;
    mapShell.classList.remove("is-panning");
  });

  document.onkeydown = (event) => {
    if (event.key === "Shift") {
      isShiftKeyPressed = true;
      return;
    }

    if (event.key !== "Escape") {
      return;
    }

    legendSelectionFilter = { pileSizes: [], pileTipLevels: [] };
    setSelectionState(clearSelection(getSelectionState()));
    syncActiveConfigurationsToUsedPileChoices();
    cptSelectionEditDraft = null;
    render();
  };

  document.onkeyup = (event) => {
    if (event.key === "Shift") {
      isShiftKeyPressed = false;
    }
  };

  appRoot.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.closest(".table-filter-menu, .table-filter-button")) {
      return;
    }

    if (openPileOptionFilterColumn !== null) {
      openPileOptionFilterColumn = null;
      render();
    }
  });
}

function isMapPanPointerDown(event: PointerEvent): boolean {
  return shouldStartMapPan({
    button: event.button,
    targetIsInteractive: event.shiftKey || isMapInteractionTarget(event.target),
  });
}

function isMapLassoPointerDown(event: PointerEvent): boolean {
  return event.button === 0 && event.shiftKey && !isMapInteractionTarget(event.target);
}

function isMapInteractionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".map-marker, button, input, select, textarea") !== null;
}

function updateViewportDisplay(): void {
  const mapStage = appRoot.querySelector<HTMLElement>(".map-stage");
  const zoomValue = appRoot.querySelector<HTMLElement>("[data-zoom-value]");

  if (mapStage) {
    mapStage.style.transform = `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`;
  }

  if (zoomValue) {
    zoomValue.textContent = `${Math.round(viewport.scale * 100)}%`;
  }
}

function updateLayoutDisplay(): void {
  const layout = appRoot.querySelector<HTMLElement>(".layout");

  if (layout) {
    layout.style.setProperty("--right-panel-width", `${rightPanelWidth}px`);
  }
}

function updateOptimizationSliderValue(setting: keyof OptimizationUiSettings, value: number): void {
  const label = appRoot.querySelector<HTMLElement>(`[data-optimization-slider-value="${setting}"]`);

  if (label) {
    label.textContent = String(value);
  }
}

function updateLassoBox(lasso: Extract<NonNullable<typeof dragState>, { mode: "lasso" }>): void {
  const left = Math.min(lasso.startX, lasso.endX);
  const top = Math.min(lasso.startY, lasso.endY);
  const width = Math.abs(lasso.endX - lasso.startX);
  const height = Math.abs(lasso.endY - lasso.startY);

  lasso.box.style.left = `${left}px`;
  lasso.box.style.top = `${top}px`;
  lasso.box.style.width = `${width}px`;
  lasso.box.style.height = `${height}px`;
}

function getLoadPointIdsInLasso(
  mapShell: HTMLElement,
  lasso: Extract<NonNullable<typeof dragState>, { mode: "lasso" }>,
): number[] {
  const shellRect = mapShell.getBoundingClientRect();
  const points = [...mapShell.querySelectorAll<HTMLElement>("[data-load-point-id]")].map((marker) => {
    const rect = marker.getBoundingClientRect();
    return {
      id: Number(marker.dataset.loadPointId),
      x: rect.left + rect.width / 2 - shellRect.left,
      y: rect.top + rect.height / 2 - shellRect.top,
    };
  });

  return getPointIdsInRectangle(points, lasso);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "EUR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function initialize(): Promise<void> {
  appRoot.innerHTML = `
    <section class="workspace">
      <div class="empty-panel">
        <h2>Loading Project</h2>
        <p>${isTauriRuntime() ? "Starting Rust analysis core." : "Starting browser preview core."}</p>
      </div>
    </section>
  `;
  await rebuildCoreAnalysis();
  syncActiveConfigurationsToUsedPileChoices();
  render();
}

initialize().catch((error: unknown) => {
  console.error(error);
  appRoot.innerHTML = `
    <section class="workspace">
      <div class="empty-panel">
        <h2>Project Could Not Load</h2>
        <p>The analysis core returned an error. Check the developer console for details.</p>
      </div>
    </section>
  `;
});
