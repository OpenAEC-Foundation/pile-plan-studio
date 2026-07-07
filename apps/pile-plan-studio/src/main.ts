import "./styles.css";

import bearingCapacitiesJson from "../../../sample_project/bearing_capacities.json";
import cptsJson from "../../../sample_project/cpts.json";
import loadPointsJson from "../../../sample_project/load_points.json";
import pileCostSettingsJson from "../../../sample_project/pile_cost_settings.json";

import {
  buildPileOptionsByLoadPoint,
  calculatePileCost,
  chooseDefaultPileOption,
  createBearingCapacityIndex,
  formatNumber,
  getBearingCapacityRowsForCpt,
  getConfigurationStyle,
  getLegendItems,
  getBearingCapacitySummary,
  getProjectBounds,
  getSelectedCpts,
  projectPoint,
  type BearingCapacity,
  type Cpt,
  type CptSelectionAlgorithm,
  type CptSelectionSettings,
  type JsonList,
  type PileConfigurationOption,
  type PileCostSettings,
  type PileCostShape,
  type LoadPoint,
} from "./projectData";
import { renderPileSymbol } from "./pileSymbols";
import { DEFAULT_RIGHT_PANEL_WIDTH, resizeRightPanelWidth } from "./panelLayout";
import { clampScale, panViewport, zoomViewportAtPoint, type Viewport } from "./viewport";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

const appRoot = app;
const loadPoints = (loadPointsJson as JsonList<LoadPoint>).items;
const cpts = (cptsJson as JsonList<Cpt>).items;
const bearingCapacities = (bearingCapacitiesJson as JsonList<BearingCapacity>).items;
const bearingCapacityIndex = createBearingCapacityIndex(bearingCapacities);
const bounds = getProjectBounds(loadPoints, cpts);
const legendItems = getLegendItems(bearingCapacities);
const DEFAULT_CPT_SELECTION_SETTINGS: CptSelectionSettings = {
  algorithm: "quadrants",
  maxDistanceM: 25,
  maxAngleDegrees: 120,
};

type RightPanelMode = "load-point" | "cpt-settings" | "cost-settings" | "cpt-frds";
type CptSettingsScope = "all" | "current";
type CptSelectionEditDraft = {
  loadPointId: number;
  cptIds: Set<number>;
};

let globalCptSelectionSettings: CptSelectionSettings = { ...DEFAULT_CPT_SELECTION_SETTINGS };
let pileCostSettings: PileCostSettings = structuredClone(pileCostSettingsJson as PileCostSettings);
let cptSettingsScope: CptSettingsScope = "all";
let cptSelectionEditDraft: CptSelectionEditDraft | null = null;
const cptSelectionSettingsByLoadPoint = new Map<number, CptSelectionSettings>();
const manualCptIdsByLoadPoint = new Map<number, number[]>();
let pileOptionsByLoadPointId = buildPileOptions();
let selectedLoadPointId = loadPoints[0]?.id ?? 0;
let selectedCptId: number | null = null;
let rightPanelMode: RightPanelMode = "load-point";
let viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
let dragState: { x: number; y: number } | null = null;
let rightPanelWidth = DEFAULT_RIGHT_PANEL_WIDTH;
let panelResizeState: { startX: number; startWidth: number } | null = null;
const selectedPileOptions = new Map<number, string>();
const chosenPileOptionByLoadPointId = new Map<number, PileConfigurationOption | null>();

function buildPileOptions(): Map<number, PileConfigurationOption[]> {
  return buildPileOptionsByLoadPoint({
    loadPoints,
    cpts,
    bearingCapacities,
    bearingCapacityIndex,
    cptSelectionSettings: getCptSelectionSettingsForLoadPoint,
    manualCptIdsByLoadPoint,
  });
}

function updateCptSelectionSettings(nextSettings: CptSelectionSettings): void {
  if (cptSettingsScope === "all") {
    globalCptSelectionSettings = nextSettings;
    cptSelectionSettingsByLoadPoint.clear();
  } else {
    cptSelectionSettingsByLoadPoint.set(selectedLoadPointId, nextSettings);
  }

  pileOptionsByLoadPointId = buildPileOptions();
  chosenPileOptionByLoadPointId.clear();
}

function rebuildPileOptionCache(): void {
  pileOptionsByLoadPointId = buildPileOptions();
  chosenPileOptionByLoadPointId.clear();
}

function updatePileCostSettings(nextSettings: PileCostSettings): void {
  pileCostSettings = nextSettings;
  chosenPileOptionByLoadPointId.clear();
}

function getCptSelectionSettingsForLoadPoint(loadPoint: LoadPoint): CptSelectionSettings {
  return cptSelectionSettingsByLoadPoint.get(loadPoint.id) ?? globalCptSelectionSettings;
}

function getActiveCptSelectionSettings(): CptSelectionSettings {
  const selectedLoadPoint = loadPoints.find((loadPoint) => loadPoint.id === selectedLoadPointId) ?? loadPoints[0];

  return getCptSelectionSettingsForLoadPoint(selectedLoadPoint);
}

function getSelectedCptsForLoadPoint(loadPoint: LoadPoint) {
  return getSelectedCpts(
    loadPoint,
    cpts,
    getCptSelectionSettingsForLoadPoint(loadPoint),
    manualCptIdsByLoadPoint.get(loadPoint.id),
  );
}

function getPileOptions(loadPoint: LoadPoint): PileConfigurationOption[] {
  return pileOptionsByLoadPointId.get(loadPoint.id) ?? [];
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
  const selectedOption = selectedKey ? options.find((option) => optionKey(option) === selectedKey) : undefined;
  const fallbackOption = chooseDefaultPileOption(options, pileCostSettings);

  const chosenOption = selectedOption ?? fallbackOption ?? null;
  chosenPileOptionByLoadPointId.set(loadPoint.id, chosenOption);

  return chosenOption;
}

function renderMap(selectedLoadPoint: LoadPoint): string {
  const selectedCpts = getSelectedCptsForLoadPoint(selectedLoadPoint);
  const chosenOption = getChosenPileOption(selectedLoadPoint);
  const activeCptSelectionDraft =
    cptSelectionEditDraft?.loadPointId === selectedLoadPoint.id ? cptSelectionEditDraft : null;
  const isEditingCptSelection = activeCptSelectionDraft !== null;
  const selectedCptIds = isEditingCptSelection
    ? activeCptSelectionDraft.cptIds
    : new Set(selectedCpts.map((item) => item.cpt.id));
  const loadPointMarkers = loadPoints
    .map((loadPoint) => {
      const point = projectPoint(loadPoint, bounds);
      const isSelected = loadPoint.id === selectedLoadPoint.id;
      const chosenOption = getChosenPileOption(loadPoint);
      const style = chosenOption ? getConfigurationStyle(chosenOption, legendItems) : null;
      return `
        <button
          class="map-marker load-point-marker${isSelected ? " is-selected" : ""}${chosenOption?.isOption === false ? " is-invalid" : ""}"
          data-load-point-id="${loadPoint.id}"
          style="left: ${point.x}%; top: ${point.y}%"
          title="${loadPoint.name}"
          aria-label="${loadPoint.name}, ${loadPoint.design_load_kn} kN"
        >${renderPileSymbol(style?.shape ?? "circle", style?.color ?? "#ffffff")}</button>
      `;
    })
    .join("");

  const cptMarkers = cpts
    .map((cpt) => {
      const point = projectPoint(cpt, bounds);
      const isSelected = selectedCptIds.has(cpt.id);
      const isGoverning = chosenOption?.governing_cpt_id === cpt.id;
      return `
        <button
          class="map-marker cpt-marker${isSelected ? " is-selected" : ""}${isEditingCptSelection ? " is-editable" : ""}${isGoverning ? " is-governing" : ""}${selectedCptId === cpt.id ? " is-open" : ""}"
          type="button"
          data-cpt-id="${cpt.id}"
          style="left: ${point.x}%; top: ${point.y}%"
          title="${cpt.name}"
        >${cpt.id}</button>
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

function renderSelectedCptDetails(selectedLoadPoint: LoadPoint): string {
  const selectedCpts = getSelectedCptsForLoadPoint(selectedLoadPoint);

  if (selectedCpts.length === 0) {
    return `<p>No CPTs available around this load point.</p>`;
  }

  return selectedCpts
    .map((selection) => {
      const summary = getBearingCapacitySummary(bearingCapacities, selection.cpt.id);
      const distanceM = selection.distance_mm / 1000;

      return `
        <tr>
          <td>${selection.label}</td>
          <td>${renderCptLink(selection.cpt)}</td>
          <td>${formatNumber(distanceM)} m</td>
          <td>${formatNumber(summary.minFrdKn)}-${formatNumber(summary.maxFrdKn)} kN</td>
        </tr>
      `;
    })
    .join("");
}

function renderPileOptionRows(selectedLoadPoint: LoadPoint): string {
  const options = getPileOptions(selectedLoadPoint);
  const chosenOption = getChosenPileOption(selectedLoadPoint);
  const chosenKey = selectedPileOptions.get(selectedLoadPoint.id) ?? (chosenOption ? optionKey(chosenOption) : "");

  return options
    .map((option) => {
      const status = option.isOption ? "OK" : "Not OK";
      const missing = option.missing_cpt_ids.length ? `Missing CPT ${option.missing_cpt_ids.join(", ")}` : "";
      const governingCpt = option.governing_cpt_id
        ? cpts.find((cpt) => cpt.id === option.governing_cpt_id) ?? null
        : null;
      const governing = governingCpt ? renderCptLink(governingCpt) : "-";
      const utilization = option.utilization === null ? "-" : `${formatNumber(option.utilization * 100)}%`;
      const frd = option.governing_frd_kn === null ? "-" : `${formatNumber(option.governing_frd_kn)} kN`;
      const cost = calculatePileCost(option, pileCostSettings);
      const key = optionKey(option);

      return `
        <tr class="pile-option-row${key === chosenKey ? " is-chosen" : ""}" data-pile-option-key="${key}">
          <td>${formatNumber(option.pile_size_mm)} mm</td>
          <td>${formatNumber(option.pile_tip_level_m)} m</td>
          <td><span class="status-pill ${option.isOption ? "is-ok" : "is-not-ok"}">${status}</span></td>
          <td>${governing}</td>
          <td>${frd}</td>
          <td>${utilization}</td>
          <td>${cost === null ? "-" : formatCurrency(cost)}</td>
          <td>${missing}</td>
        </tr>
      `;
    })
    .join("");
}

function renderSymbolLegend(): string {
  const shapeItems = legendItems.pileSizes
    .map(
      (item) => `
        <span class="symbol-legend-item">
          ${renderPileSymbol(item.shape, "#ffffff")}
          ${formatNumber(item.value)} mm
        </span>
      `,
    )
    .join("");
  const colorItems = legendItems.pileTipLevels
    .map(
      (item) => `
        <span class="symbol-legend-item">
          <i class="color-swatch" style="--pile-color: ${item.color}"></i>
          ${formatNumber(item.value)} m
        </span>
      `,
    )
    .join("");

  return `
    <div class="symbol-legend" aria-label="Pile symbol legend">
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

function renderRightPanel(selectedLoadPoint: LoadPoint): string {
  if (rightPanelMode === "cpt-settings") {
    return renderCptSettingsPanel();
  }
  if (rightPanelMode === "cost-settings") {
    return renderCostSettingsPanel();
  }
  if (rightPanelMode === "cpt-frds") {
    return renderCptFrdPanel(selectedLoadPoint);
  }

  return renderLoadPointPanel(selectedLoadPoint);
}

function renderCptFrdPanel(selectedLoadPoint: LoadPoint): string {
  const cpt = cpts.find((item) => item.id === selectedCptId) ?? null;

  if (!cpt) {
    return `
      <div class="panel-heading">
        <h2>CPT</h2>
        <button class="secondary-action compact-action" type="button" data-panel-mode="load-point">Load Point Information</button>
      </div>
      <p>No CPT selected.</p>
    `;
  }

  const selectedCptIds = new Set(getSelectedCptsForLoadPoint(selectedLoadPoint).map((selection) => selection.cpt.id));
  const rows = getBearingCapacityRowsForCpt(bearingCapacities, cpt.id);
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
      ${
        selectedCptIds.has(cpt.id)
          ? `<button class="secondary-action compact-action" type="button" data-panel-mode="load-point">Back to Load Point</button>`
          : `<button class="secondary-action compact-action" type="button" data-panel-mode="load-point">Load Point Information</button>`
      }
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

function renderLoadPointPanel(selectedLoadPoint: LoadPoint): string {
  const activeSettings = getCptSelectionSettingsForLoadPoint(selectedLoadPoint);

  return `
    <div class="load-point-panel">
      <div class="panel-heading">
        <h2>${selectedLoadPoint.name}</h2>
        <div class="panel-actions">
          <button class="secondary-action compact-action" type="button" data-panel-mode="cpt-settings">CPT Settings</button>
          <button class="secondary-action compact-action" type="button" data-panel-mode="cost-settings">Cost Settings</button>
        </div>
      </div>

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

      <h3>Selected CPTs</h3>
      <p class="supporting-text">Maximum selection distance: ${formatNumber(activeSettings.maxDistanceM)} m.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Selection</th>
              <th>CPT</th>
              <th>Distance</th>
              <th>FRd range</th>
            </tr>
          </thead>
          <tbody>${renderSelectedCptDetails(selectedLoadPoint)}</tbody>
        </table>
      </div>

      <h3>Pile Options</h3>
      <div class="table-wrap pile-options-wrap">
        <table>
          <thead>
            <tr>
              <th>Size</th>
              <th>Tip</th>
              <th>Status</th>
              <th>Governing</th>
              <th>FRd min</th>
              <th>Use</th>
              <th>Cost</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>${renderPileOptionRows(selectedLoadPoint)}</tbody>
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
      <button class="secondary-action compact-action" type="button" data-panel-mode="load-point">Load Point Information</button>
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
      <button class="secondary-action compact-action" type="button" data-panel-mode="load-point">Load Point Information</button>
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
  const selectedLoadPoint = loadPoints.find((loadPoint) => loadPoint.id === selectedLoadPointId) ?? loadPoints[0];

  appRoot.innerHTML = `
    <section class="workspace">
      <header class="top-bar">
        <div>
          <p class="eyebrow">OpenAEC concept</p>
          <h1>Pile Plan Studio</h1>
        </div>
        <button class="secondary-action" type="button">Sample Project</button>
      </header>

      <section class="layout" style="--right-panel-width: ${rightPanelWidth}px">
        <section class="canvas-area" aria-label="Project data map">
          <div class="canvas-header">
            <div class="zoom-controls" aria-label="Map zoom controls">
              <button type="button" data-zoom-action="out" aria-label="Zoom out">-</button>
              <span data-zoom-value>${Math.round(viewport.scale * 100)}%</span>
              <button type="button" data-zoom-action="in" aria-label="Zoom in">+</button>
            </div>
          </div>
          ${renderSymbolLegend()}
          ${renderMap(selectedLoadPoint)}
        </section>

        <div class="layout-resizer" role="separator" aria-label="Resize right panel" aria-orientation="vertical"></div>

        <aside class="panel right-panel">
          ${renderRightPanel(selectedLoadPoint)}
        </aside>
      </section>
    </section>
  `;

  appRoot.querySelectorAll<HTMLButtonElement>("[data-load-point-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (cptSelectionEditDraft) {
        return;
      }

      selectedLoadPointId = Number(button.dataset.loadPointId);
      cptSelectionEditDraft = null;
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-panel-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      rightPanelMode =
        button.dataset.panelMode === "cpt-settings"
          ? "cpt-settings"
          : button.dataset.panelMode === "cost-settings"
            ? "cost-settings"
            : button.dataset.panelMode === "cpt-frds"
              ? "cpt-frds"
            : "load-point";
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-open-cpt-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedCptId = Number(button.dataset.openCptId);
      rightPanelMode = "cpt-frds";
      render();
    });
  });

  appRoot.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-cost-global-setting]").forEach((input) => {
    input.addEventListener("change", () => {
      const value = Number(input.value);

      if (!Number.isFinite(value)) {
        render();
        return;
      }

      updatePileCostSettings({
        ...pileCostSettings,
        pile_head_level_m: value,
      });
      render();
    });
  });

  appRoot.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-cost-size]").forEach((input) => {
    input.addEventListener("change", () => {
      const pileSizeMm = Number(input.dataset.costSize);
      const setting = input.dataset.costSetting;

      updatePileCostSettings({
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
    button.addEventListener("click", () => {
      cptSettingsScope = button.dataset.cptSettingsScope === "current" ? "current" : "all";
      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-cpt-algorithm]").forEach((button) => {
    button.addEventListener("click", () => {
      updateCptSelectionSettings({
        ...getActiveCptSelectionSettings(),
        algorithm: button.dataset.cptAlgorithm === "maximum-angle" ? "maximum-angle" : "quadrants",
      });
      render();
    });
  });

  appRoot.querySelectorAll<HTMLInputElement>("[data-cpt-setting]").forEach((input) => {
    input.addEventListener("change", () => {
      const value = Number(input.value);

      if (!Number.isFinite(value)) {
        render();
        return;
      }

      if (input.dataset.cptSetting === "maxDistanceM") {
        updateCptSelectionSettings({
          ...getActiveCptSelectionSettings(),
          maxDistanceM: Math.max(0, value),
        });
      }

      if (input.dataset.cptSetting === "maxAngleDegrees") {
        updateCptSelectionSettings({
          ...getActiveCptSelectionSettings(),
          maxAngleDegrees: Math.min(360, Math.max(1, value)),
        });
      }

      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-cpt-selection-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.cptSelectionAction;

      if (action === "edit") {
        const selectedLoadPoint = loadPoints.find((loadPoint) => loadPoint.id === selectedLoadPointId) ?? loadPoints[0];
        const selectedCptIds = manualCptIdsByLoadPoint.get(selectedLoadPointId)
          ?? getSelectedCptsForLoadPoint(selectedLoadPoint).map((selection) => selection.cpt.id);
        cptSelectionEditDraft = {
          loadPointId: selectedLoadPointId,
          cptIds: new Set(selectedCptIds),
        };
      }

      if (action === "save" && cptSelectionEditDraft?.loadPointId === selectedLoadPointId) {
        manualCptIdsByLoadPoint.set(selectedLoadPointId, [...cptSelectionEditDraft.cptIds]);
        cptSelectionEditDraft = null;
        rebuildPileOptionCache();
      }

      if (action === "cancel") {
        cptSelectionEditDraft = null;
      }

      if (action === "clear") {
        manualCptIdsByLoadPoint.delete(selectedLoadPointId);
        cptSelectionEditDraft = null;
        rebuildPileOptionCache();
      }

      render();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>("[data-cpt-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!cptSelectionEditDraft || cptSelectionEditDraft.loadPointId !== selectedLoadPointId) {
        selectedCptId = Number(button.dataset.cptId);
        rightPanelMode = "cpt-frds";
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
    row.addEventListener("click", () => {
      const key = row.dataset.pileOptionKey;
      if (!key) {
        return;
      }
      selectedPileOptions.set(selectedLoadPointId, key);
      chosenPileOptionByLoadPointId.delete(selectedLoadPointId);
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
    if (!isMapPanPointerDown(event)) {
      return;
    }
    event.preventDefault();
    dragState = { x: event.clientX, y: event.clientY };
    mapShell.setPointerCapture(event.pointerId);
    mapShell.classList.add("is-panning");
  });

  mapShell?.addEventListener("pointermove", (event) => {
    if (!dragState) {
      return;
    }

    viewport = panViewport(viewport, {
      deltaX: event.clientX - dragState.x,
      deltaY: event.clientY - dragState.y,
    });
    dragState = { x: event.clientX, y: event.clientY };
    updateViewportDisplay();
  });

  mapShell?.addEventListener("pointerup", (event) => {
    dragState = null;
    mapShell.releasePointerCapture(event.pointerId);
    mapShell.classList.remove("is-panning");
  });

  mapShell?.addEventListener("pointercancel", () => {
    dragState = null;
    mapShell.classList.remove("is-panning");
  });

  mapShell?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}

function isMapPanPointerDown(event: PointerEvent): boolean {
  if (event.button === 2) {
    return true;
  }

  if (event.button !== 0) {
    return false;
  }

  const target = event.target;

  if (!(target instanceof Element)) {
    return true;
  }

  return !target.closest(".map-marker, button, input, select, textarea");
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "EUR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

render();
