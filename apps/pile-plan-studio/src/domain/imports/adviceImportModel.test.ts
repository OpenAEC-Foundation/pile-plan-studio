import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyAdviceDraft, addAdviceSource, removeAdviceSource, setAdviceSheetSelection, applyAdviceDiscovery, beginAdviceDiscovery } from "./adviceImportModel.ts";

test("same-name sources remain distinct and selection changes invalidate preview", () => {
  const empty = createEmptyAdviceDraft<{ name: string }>();
  const a = addAdviceSource(empty, "a", { name: "advice.xlsx" });
  const b = addAdviceSource(a, "b", { name: "advice.xlsx" });
  const selected = setAdviceSheetSelection(b, "a", []);
  assert.equal(selected.sources.length, 2);
  assert.equal(selected.generation, 3);
  assert.deepEqual(selected.sources[0].sheetSelection, []);
  assert.equal(removeAdviceSource(selected, "a").sources[0].id, "b");
  assert.equal(b.sources[0].sheetSelection, null);
});
test("late discovery cannot undo an explicit empty selection", () => {
  const draft = setAdviceSheetSelection(beginAdviceDiscovery(addAdviceSource(createEmptyAdviceDraft(), "a", { name: "x.xlsx" }), "a", 1), "a", []);
  const result = applyAdviceDiscovery(draft, "a", 1, { sourceId: "a", diagnostics: [], sheets: [],
    suggestedSelection: [{ sheetName: "diep", profile: "capacity-columns" }] });
  assert.deepEqual(result.sources[0].sheetSelection, []);
});
