import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const sourceRoot = resolve(import.meta.dirname, "..");

describe("frontend module boundaries", () => {
  it("keeps feature-owned components out of the shared domain root", () => {
    for (const path of [
      "components/domain/right-panel/CostSettingsPanel.tsx",
      "components/domain/right-panel/MissingCptPopover.tsx",
      "components/domain/right-panel/pileOptionAggregationController.ts",
      "components/domain/pile-plan-viewer/tip-level-regions/TipLevelRegionOverlay.tsx",
      "components/domain/pile-plan-viewer/tip-level-regions/tipLevelRegionTopologyController.ts",
      "components/domain/shared/CoordinateReadout.ts",
      "components/domain/pile-plan-viewer/viewer.css",
    ]) {
      assert.equal(existsSync(resolve(sourceRoot, path)), true, `${path} should exist`);
    }

    for (const path of [
      "components/domain/CostSettingsPanel.tsx",
      "components/domain/TipLevelRegionOverlay.tsx",
      "components/domain/CoordinateReadout.ts",
      "components/domain/viewer.css",
    ]) {
      assert.equal(existsSync(resolve(sourceRoot, path)), false, `${path} should be removed`);
    }
  });

  it("groups asynchronous derived state and project lifecycle orchestration", () => {
    for (const path of [
      "app/derived-state/pileOptionAnalysisController.ts",
      "app/derived-state/loadPointGroupController.ts",
      "app/derived-state/technicalAssignmentController.ts",
      "app/project/projectLifecycleController.ts",
    ]) {
      assert.equal(existsSync(resolve(sourceRoot, path)), true, `${path} should exist`);
    }

    for (const path of [
      "app/analysisPipelineController.ts",
      "app/projectLifecycleController.ts",
      "components/domain/loadPointGroupController.ts",
      "components/domain/technicalAssignmentController.ts",
    ]) {
      assert.equal(existsSync(resolve(sourceRoot, path)), false, `${path} should be removed`);
    }
  });

  it("groups pure domain modules by feature", () => {
    for (const path of [
      "domain/project/projectState.ts",
      "domain/project/history/projectHistoryReducer.ts",
      "domain/project/recovery/browserRecovery.ts",
      "domain/pile-plans/optimization/optimizationSettings.ts",
      "domain/legend/legendState.ts",
      "domain/pile-options/pileOptionStatus.ts",
      "domain/cpt-selection/cptSettingsModel.ts",
      "domain/source-data/sourceTableModel.ts",
      "domain/settings/userSettings.ts",
      "domain/workspace/selectionState.ts",
    ]) {
      assert.equal(existsSync(resolve(sourceRoot, path)), true, `${path} should exist`);
    }

    for (const path of [
      "domain/projectState.ts",
      "domain/projectHistoryReducer.ts",
      "domain/browserRecovery.ts",
      "domain/optimizationSettings.ts",
      "domain/legendState.ts",
      "domain/pileOptionStatus.ts",
      "components/domain/cptSettingsModel.ts",
      "domain/sourceTableModel.ts",
      "domain/userSettings.ts",
      "domain/selectionState.ts",
    ]) {
      assert.equal(existsSync(resolve(sourceRoot, path)), false, `${path} should be removed`);
    }
  });
});
