import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import type { LoadPointGroupSnapshot } from "./loadPointGroupController.ts";
import type { TechnicalAssignmentSnapshot } from "./technicalAssignmentController.ts";
import { prepareProjectTechnicalInput, presentProjectTechnicalAssignment } from "./projectTechnicalAssignment.ts";

const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const groups: LoadPointGroupSnapshot = { groups: [{ load_point_ids: state.loadPoints.map(point => point.id) }],
  pending: false, error: null, topology: null };
const options = new Map(state.loadPoints.map(point => [point.id, []]));
const assessment: TechnicalAssignmentSnapshot = { status: "ready", assessment: null, issuesByLoadPointId: new Map(), error: null };

test("technical input stays unavailable until groups and all options exist", () => {
  assert.equal(prepareProjectTechnicalInput(state, { ...groups, groups: [] }, options), null);
  assert.equal(prepareProjectTechnicalInput(state, groups, new Map()), null);
  const input = prepareProjectTechnicalInput(state, groups, options);
  assert.equal(input?.optionsByLoadPoint, options);
});
test("upstream analysis failure takes precedence over a completed assessment", () => {
  const failed = { ...state, analysisError: "capacity unavailable" };
  assert.equal(prepareProjectTechnicalInput(failed, groups, options), null);
  const result = presentProjectTechnicalAssignment(failed, groups, null, assessment);
  assert.equal(result.status, "error");
  assert.equal(result.error?.message, "capacity unavailable");
  assert.equal(result.issuesByLoadPointId.size, 0);
});
test("a failed obsolete CPT preview does not hide a current assessment", () => {
  const draft = { loadPointIds: [state.loadPoints[0].id], cptIdsByLoadPoint: new Map<number, Set<number>>() };
  const editing = { ...state, cptSelectionEditDraft: draft,
    cptSelectionPreview: { status: "failed" as const, draft: { ...draft }, error: "old failure" } };
  const input = prepareProjectTechnicalInput(editing, groups, options);
  assert.ok(input);
  assert.equal(presentProjectTechnicalAssignment(editing, groups, input, assessment), assessment);
});
test("a current failed CPT preview reports its error", () => {
  const draft = { loadPointIds: [state.loadPoints[0].id], cptIdsByLoadPoint: new Map<number, Set<number>>() };
  const editing = { ...state, cptSelectionEditDraft: draft,
    cptSelectionPreview: { status: "failed" as const, draft, error: "preview failed" } };
  const input = prepareProjectTechnicalInput(editing, groups, options);
  assert.equal(input, null);
  assert.equal(presentProjectTechnicalAssignment(editing, groups, input, assessment).error?.message, "preview failed");
});

test("a current pending CPT preview keeps assessment loading without exposing old issues", () => {
  const draft = { loadPointIds: [state.loadPoints[0].id], cptIdsByLoadPoint: new Map<number, Set<number>>() };
  const editing = { ...state, cptSelectionEditDraft: draft,
    cptSelectionPreview: { status: "analyzing" as const, draft } };
  const input = prepareProjectTechnicalInput(editing, groups, options);
  assert.equal(input, null);
  const result = presentProjectTechnicalAssignment(editing, groups, input, assessment);
  assert.equal(result.status, "loading");
  assert.equal(result.assessment, null);
  assert.equal(result.issuesByLoadPointId.size, 0);
  assert.equal(result.error, null);
});

test("group failure is shown only while the effective partition is unavailable", () => {
  const failed = { ...groups, groups: [], error: new Error("partition unavailable") };
  const input = prepareProjectTechnicalInput(state, failed, options);
  assert.equal(input, null);
  assert.equal(presentProjectTechnicalAssignment(state, failed, input, assessment).error, failed.error);
  const completed = { ...groups, error: failed.error };
  const currentInput = prepareProjectTechnicalInput(state, completed, options);
  assert.ok(currentInput);
  assert.equal(presentProjectTechnicalAssignment(state, completed, currentInput, assessment), assessment);
});
