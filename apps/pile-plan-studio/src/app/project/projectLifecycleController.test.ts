import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { captureProjectContent, normalizeProjectContentState, projectDocumentDraftFromContent } from "../../domain/project/projectContent.ts";
import { createProjectPersistenceSelector, openedProjectLifecycleState, projectStateSignature } from "./projectLifecycleController.ts";

const sampleProjectText = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");

describe("project lifecycle controller", () => {
  it("reuses persistence work for transient updates and invalidates content, active plan and undo", () => {
    const project = canonicalProjectForTest(sampleProjectText);
    const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
    const select = createProjectPersistenceSelector();
    const first = select(state);
    assert.equal(first.signature, projectStateSignature(state));
    assert.equal(select({ ...state, selectedLoadPointIds: [], selectedCptId: 99,
      viewport: {scale:2,offsetX:100,offsetY:50}, pileOptionsByLoadPointId:new Map() }), first);
    const changed = {...state, name: "Changed project", bearingCapacities:state.bearingCapacities.slice(1)};
    const next = select(changed);
    assert.notEqual(next, first);
    assert.equal(next.signature, projectStateSignature(changed));
    assert.notEqual(next.signature, first.signature);
    assert.equal(select(state).signature, first.signature);
    const otherPlan = {...state.pilePlans[0],id:"another-plan",name:"Another"};
    const plans = {...state,pilePlans:[...state.pilePlans,otherPlan]};
    const beforeSwitch = select(plans);
    const switched = {...plans,activePilePlanId:otherPlan.id};
    assert.notEqual(select(switched).signature,beforeSwitch.signature);
    assert.equal(select(switched).signature,projectStateSignature(switched));
    const assignmentEdit = {...state,selectedPileConfigurationsByLoadPoint:new Map(state.selectedPileConfigurationsByLoadPoint)};
    assignmentEdit.selectedPileConfigurationsByLoadPoint.delete(state.loadPoints[0].id);
    assert.notEqual(select(assignmentEdit).signature,first.signature);
    assert.equal(select(assignmentEdit).signature,projectStateSignature(assignmentEdit));
  });

  it("marks an opened project clean and records its exact persisted signature", () => {
    const project = canonicalProjectForTest(sampleProjectText);
    const state = createInitialProjectState(
      project,
      { initializeDefaultPiles: false },
      projectTipLevelKeysForTest(project),
    );
    const normalized = normalizeProjectContentState(state);
    const expectedSignature = JSON.stringify(projectDocumentDraftFromContent(
      captureProjectContent(normalized),
      normalized.activePilePlanId,
    ));

    assert.deepEqual(openedProjectLifecycleState(state, "C:/projects/example.ifcpp"), {
      projectPath: "C:/projects/example.ifcpp",
      savedSignature: expectedSignature,
      isDirty: false,
    });
    assert.equal(projectStateSignature(state), expectedSignature);
  });
});
