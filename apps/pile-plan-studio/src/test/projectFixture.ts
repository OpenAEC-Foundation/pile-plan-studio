import sample from "../../../../sample_project/sample_project.ifcpp?raw";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../core/projectTestSupport.ts";
import { createInitialProjectState } from "../domain/project/projectState.ts";

export function projectFixture() {
  const project = canonicalProjectForTest(sample);
  return createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
}
