import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../core/projectTestSupport.ts";
import { createInitialProjectState } from "../domain/projectState.ts";
import { captureProjectContent, normalizeProjectContentState, projectDocumentDraftFromContent } from "../domain/projectContent.ts";
import { openedProjectLifecycleState, projectStateSignature } from "./projectLifecycleController.ts";

const sampleProjectText = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");

describe("project lifecycle controller", () => {
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
