import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalProjectForTest,
  projectTipLevelKeysForTest,
} from "../../core/projectTestSupport.ts";
import { readFileSync } from "node:fs";
import { createInitialProjectState } from "../project/projectState.ts";
import {
  captureProjectContent,
  projectDocumentDraftFromContent,
} from "../project/projectContent.ts";
import {
  installPileCapProposals,
  findSelectedPileCapGroup,
} from "./pileCapProposals.ts";

test("proposal edits belong to one plan and are included in the project draft", () => {
  const project = canonicalProjectForTest(
    readFileSync("../../sample_project/sample_project.ifcpp", "utf8"),
  );
  const state = createInitialProjectState(
    project,
    { initializeDefaultPiles: false },
    projectTipLevelKeysForTest(project),
  );
  const first = state.pilePlans[0];
  const other = { ...first, id: "other", pileCapProposals: [] };
  const source = { ...state, pilePlans: [first, other] };
  const proposal = {
    load_point_ids: [17, 45],
    pile_count: 3,
    quarter_turns: 0,
    configuration: null,
  };
  const next = installPileCapProposals(source, first.id, [proposal]);
  assert.equal(source.pilePlans[0], first);
  assert.equal(next.pilePlans[1], other);
  assert.equal(
    next.selectedPileConfigurationsByLoadPoint,
    source.selectedPileConfigurationsByLoadPoint,
  );
  assert.deepEqual(next.pilePlans[0].pileCapProposals, [proposal]);
  const draft = projectDocumentDraftFromContent(
    captureProjectContent(next),
    first.id,
  );
  assert.deepEqual(draft.user_state.pile_plans[0].pile_cap_proposals, [
    proposal,
  ]);
});

test("only a whole core-derived group or singleton exposes cap controls", () => {
  const groups = [
    { load_point_ids: [1, 2], origin: "automatic" as const },
    { load_point_ids: [3], origin: "automatic" as const },
  ];
  assert.deepEqual(findSelectedPileCapGroup([2, 1], groups), [1, 2]);
  assert.equal(findSelectedPileCapGroup([1], groups), null);
  assert.deepEqual(findSelectedPileCapGroup([3], groups), [3]);
  assert.equal(findSelectedPileCapGroup([1, 2, 3], groups), null);
});
