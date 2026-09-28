import { readFileSync } from "node:fs";
import { it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../project/projectState.ts";
import { applyValidatedCptSettingsEdit } from "./cptSettingsModel.ts";

it("applies distinct validated CPT settings with one analysis request", () => {
  const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
  const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
  const id = state.loadPoints[0].id;
  const next = applyValidatedCptSettingsEdit(state, {
    status: "applied", changed: true, globalChanged: false, changedLoadPointIds: [id],
    globalSettings: state.globalCptSelectionSettings,
    settingsByLoadPoint: new Map([[id, { ...state.globalCptSelectionSettings, maxDistanceM: 18 }]]),
    manualCptIdsByLoadPoint: state.manualCptIdsByLoadPoint,
  });
  assert.equal(next.analysisRequest.revision, state.analysisRequest.revision + 1);
  assert.deepEqual(next.analysisRequest.loadPointIds, [id]);
  assert.equal(next.cptSelectionSettingsByLoadPoint.get(id)?.maxDistanceM, 18);
});
