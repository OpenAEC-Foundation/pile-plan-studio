import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSymbolScaleHistory } from "./symbolScaleHistory.ts";
import { createManagedProjectState, projectHistoryReducer } from "../../domain/project/history/projectHistoryReducer.ts";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";

function fixture() {
  const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
  let managed = createManagedProjectState(createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project)));
  const controller = createSymbolScaleHistory({
    commit: update => { managed = projectHistoryReducer(managed, { type: "commit", update }); },
    amend: update => { managed = projectHistoryReducer(managed, { type: "amend", update }); },
  });
  return { controller, state: () => managed, undo: () => { managed = projectHistoryReducer(managed, { type: "undo" }); } };
}

describe("symbol-scale gesture history", () => {
  it("coalesces repeated changes and repeated starts into one undoable gesture", () => {
    const f = fixture(), initial = f.state().present.symbolScalePercent;
    f.controller.begin(); f.controller.change(120); f.controller.begin(); f.controller.change(140); f.controller.end();
    assert.equal(f.state().history.past.length, 1); assert.equal(f.state().present.symbolScalePercent, 140);
    f.undo(); assert.equal(f.state().present.symbolScalePercent, initial);
  });
  it("keeps separate gestures and standalone changes as separate undo entries", () => {
    const f = fixture();
    f.controller.begin(); f.controller.change(120); f.controller.end();
    f.controller.begin(); f.controller.change(140); f.controller.end(); f.controller.change(160);
    assert.equal(f.state().history.past.length, 3);
    f.undo(); assert.equal(f.state().present.symbolScalePercent, 140);
    f.undo(); assert.equal(f.state().present.symbolScalePercent, 120);
  });
  it("an empty gesture does not create a history entry", () => {
    const f = fixture(); f.controller.begin(); f.controller.end(); assert.equal(f.state().history.past.length, 0);
  });
});
