import { readFileSync } from "node:fs";
import { it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createProjectMarker } from "./projectMarker.ts";

it("advances only for observed content changes and resets for a new project", () => {
  const source = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");
  const project = canonicalProjectForTest(source);
  const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
  const marker = createProjectMarker();
  const first = marker.observe(state);
  assert.deepEqual(marker.observe({ ...state, selectedLoadPointIds: [] }), first);
  const changed = marker.observe({ ...state, name: "Changed" });
  assert.ok(changed.project_revision > first.project_revision);
  assert.ok(marker.observe(state).project_revision > changed.project_revision);
  assert.notEqual(marker.reset().project_instance_id, first.project_instance_id);
});
