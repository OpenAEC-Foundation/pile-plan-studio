import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyLoadPointLockDraft,
  setLassoLoadPointLocks,
  startLoadPointLockDraft,
  toggleLoadPointLock,
} from "./loadPointLocking.ts";
import type { PilePlanData } from "../core/projectFile.ts";

function plan(id: string, lockedLoadPointIds: number[]): PilePlanData {
  return {
    id,
    name: id,
    selectedPileConfigurationsByLoadPoint: new Map(),
    externalReferencesByLoadPoint: new Map(),
    lockedLoadPointIds,
    optimizationUnassignedByLoadPoint: new Map(),
  };
}

describe("load-point locking", () => {
  it("starts a detached draft from the active pile plan", () => {
    const plans = [plan("a", [1, 2]), plan("b", [3])];
    const draft = startLoadPointLockDraft(plans, "a");

    assert.deepEqual([...draft], [1, 2]);
    draft.add(4);
    assert.deepEqual(plans[0].lockedLoadPointIds, [1, 2]);
  });

  it("adds the current selection to the detached lock draft", () => {
    const plans = [plan("a", [1]), plan("b", [4])];
    const selectedLoadPointIds = [2, 3];

    const draft = startLoadPointLockDraft(plans, "a", selectedLoadPointIds);

    assert.deepEqual([...draft], [1, 2, 3]);
    assert.deepEqual(plans[0].lockedLoadPointIds, [1]);
    assert.deepEqual(selectedLoadPointIds, [2, 3]);
  });

  it("toggles one load point without mutating the previous draft", () => {
    const draft = new Set([1]);
    assert.deepEqual([...toggleLoadPointLock(draft, 1)], []);
    assert.deepEqual([...toggleLoadPointLock(draft, 2)], [1, 2]);
    assert.deepEqual([...draft], [1]);
  });

  it("locks a mixed lasso and unlocks a fully locked lasso", () => {
    assert.deepEqual([...setLassoLoadPointLocks(new Set([1]), [1, 2])], [1, 2]);
    assert.deepEqual([...setLassoLoadPointLocks(new Set([1, 2, 3]), [1, 2])], [3]);
  });

  it("applies the draft only to the active pile plan", () => {
    const plans = [plan("a", [1]), plan("b", [3])];
    const next = applyLoadPointLockDraft(plans, "a", new Set([2]));

    assert.deepEqual(next[0].lockedLoadPointIds, [2]);
    assert.deepEqual(next[1].lockedLoadPointIds, [3]);
    assert.deepEqual(plans[0].lockedLoadPointIds, [1]);
  });
});
