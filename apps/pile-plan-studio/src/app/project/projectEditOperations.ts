import { evaluateProjectDocumentEditCore, type ProjectDocumentEdit } from "../../core/mcpProjectEditCoreClient.ts";
import { captureProjectContent, restoreProjectContent } from "../../domain/project/projectContent.ts";
import { createInitialProjectState, type ProjectState } from "../../domain/project/projectState.ts";
import type { LegendEditorDraft } from "../../domain/legend/legendEditorModel.ts";
import { projectDraftFromState, projectStateSignature } from "./projectLifecycleController.ts";
import { evaluatePileCostCatalogEditCore, type CostCatalogAction, type CostCatalogEditResult } from "../../core/settingsEditCoreClient.ts";
import type { PileCostSettings } from "../../core/projectTypes.ts";
import { applyPileCostCatalogDefault, mergePileCostCatalog } from "../../domain/pile-plans/pileCostCatalog.ts";

export type PreparedProjectDocumentEdit = {
  changed: boolean;
  next: ProjectState;
  update: (current: ProjectState) => ProjectState;
};

export class PileCostCatalogEditError extends Error {
  readonly result: Extract<CostCatalogEditResult, { status: "blocked" }>;
  constructor(result: Extract<CostCatalogEditResult, { status: "blocked" }>) {
    super(result.reason);
    this.result = result;
  }
}

/** Both interface and MCP cost edits use Rust validation before entering project history. */
export async function preparePileCostCatalogEdit(
  state: ProjectState, actions: CostCatalogAction[],
): Promise<PreparedProjectDocumentEdit & { changedSizesMm: number[] }> {
  const result = await evaluatePileCostCatalogEditCore({
    settings: state.pileCostSettings,
    usedPileSizesMm: [...new Set(state.bearingCapacities.map((row) => row.pile_size_mm))],
    actions,
  });
  if (result.status === "blocked") throw new PileCostCatalogEditError(result);
  const update = (current: ProjectState): ProjectState => result.changed
    ? { ...current, pileCostSettings: result.settings } : current;
  return { changed: result.changed, next: update(state), update, changedSizesMm: result.changed_sizes_mm };
}

export async function preparePileCostCatalogDefaultEdit(
  state: ProjectState, preferred: PileCostSettings,
): Promise<PreparedProjectDocumentEdit> {
  const used = new Set(state.bearingCapacities.map((row) => row.pile_size_mm));
  const proposed = applyPileCostCatalogDefault(state.pileCostSettings, preferred, used).catalog;
  return preparePileCostCatalogReplacement(state, proposed);
}

export async function prepareMergedPileCostCatalogEdit(
  state: ProjectState, preferred: PileCostSettings | null, builtIn: PileCostSettings | null,
): Promise<PreparedProjectDocumentEdit> {
  const used = new Set(state.bearingCapacities.map((row) => row.pile_size_mm));
  const proposed = mergePileCostCatalog(state.pileCostSettings, preferred, builtIn, used).catalog;
  return preparePileCostCatalogReplacement(state, proposed);
}

function preparePileCostCatalogReplacement(
  state: ProjectState, proposed: PileCostSettings,
): Promise<PreparedProjectDocumentEdit> {
  const currentBySize = new Map(state.pileCostSettings.items.map((item) => [item.pile_size_mm, item]));
  const proposedSizes = new Set(proposed.items.map((item) => item.pile_size_mm));
  const actions: CostCatalogAction[] = [];
  for (const item of proposed.items) {
    const current = currentBySize.get(item.pile_size_mm);
    if (!current) actions.push({ action: "add", item });
    else if (current.shape !== item.shape || current.cost_per_m3 !== item.cost_per_m3) {
      actions.push({ action: "update", pile_size_mm: item.pile_size_mm,
        shape: item.shape, cost_per_m3: item.cost_per_m3 });
    }
  }
  for (const item of state.pileCostSettings.items) {
    if (!proposedSizes.has(item.pile_size_mm)) actions.push({ action: "remove", pile_size_mm: item.pile_size_mm });
  }
  return actions.length > 0 ? preparePileCostCatalogEdit(state, actions)
    : Promise.resolve({ changed: false, next: state, update: (current: ProjectState) => current });
}

const sourceEdits = new Set(["load_points", "cpts", "bearing_capacities"]);

/** Apply a validated Rust project edit to the application state, independent of its caller. */
export async function prepareProjectDocumentEdit(
  state: ProjectState, edit: ProjectDocumentEdit,
): Promise<PreparedProjectDocumentEdit> {
  const result = await evaluateProjectDocumentEditCore(projectDraftFromState(state), edit);
  if (result.status === "blocked") {
    const error = new Error(result.reason) as Error & { actionIndex?: number | null };
    error.actionIndex = result.action_index;
    throw error;
  }
  const next = createInitialProjectState(result.document.project,
    { initializeDefaultPiles: false }, result.document.keys);
  const update = (current: ProjectState): ProjectState => {
    if (!result.changed) return current;
    if (sourceEdits.has(edit.kind)) {
      const restored = restoreProjectContent(current, captureProjectContent(next)).state;
      return { ...restored, analysisRequest: {
        revision: current.analysisRequest.revision + 1, loadPointIds: null,
      } };
    }
    if (edit.kind === "optimization_settings") return {
      ...current, ilpOptimizationSettings: next.ilpOptimizationSettings,
    };
    if (edit.kind === "active_configurations") return {
      ...current, pilePlans: current.pilePlans.map((plan) => plan.id === edit.plan_id
        ? { ...plan, activePileSizes: next.pilePlans.find((item) => item.id === plan.id)!.activePileSizes,
          activePileTipLevelMms: next.pilePlans.find((item) => item.id === plan.id)!.activePileTipLevelMms }
        : plan),
    };
    if (edit.kind === "legend_settings") return { ...current, pileLegend: next.pileLegend,
      showTipLevelRegions: next.showTipLevelRegions, legendImportWarnings: next.legendImportWarnings };
    if (edit.kind === "project_properties") return {
      ...current, name: next.name, metadata: next.metadata, pileHeadLevelM: next.pileHeadLevelM,
      currencyCode: next.currencyCode, units: next.units,
    };
    return current;
  };
  const changed = result.changed && projectStateSignature(update(state)) !== projectStateSignature(state);
  return { changed, next, update: changed ? update : (current) => current };
}

/** The legend editor changes visual settings and the active plan in one user action. */
export async function prepareLegendEditorEdit(
  state: ProjectState, draft: LegendEditorDraft, enableTipLevelRegions: boolean,
): Promise<PreparedProjectDocumentEdit> {
  const legend = projectDraftFromState({ ...state, pileLegend: draft.legend }).settings.pile_legend;
  if (!legend) throw new Error("invalid_legend");
  const visual = await prepareProjectDocumentEdit(state, {
    kind: "legend_settings", legend,
    show_tip_level_regions: enableTipLevelRegions ? true : state.showTipLevelRegions,
  });
  const active = await prepareProjectDocumentEdit(visual.update(state), {
    kind: "active_configurations", plan_id: state.activePilePlanId,
    pile_sizes_mm: draft.active.pileSizes,
    pile_tip_levels_mm: draft.active.pileTipLevelMms,
  });
  const update = (current: ProjectState) => active.update(visual.update(current));
  return { changed: visual.changed || active.changed, next: active.next, update };
}
