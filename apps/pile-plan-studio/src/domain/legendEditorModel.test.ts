import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyLegendEditorBulkAction,
  createLegendEditorDraft,
  toggleLegendEditorItem,
} from "./legendEditorModel.ts";

describe("legend editor model", () => {
  it("copies active values into an isolated draft", () => {
    const active = { pileSizes: [290], pileTipLevels: [-18] };
    const draft = createLegendEditorDraft(active);

    draft.pileSizes.push(320);

    assert.deepEqual(active.pileSizes, [290]);
    assert.deepEqual(draft.pileSizes, [290, 320]);
  });

  it("moves sizes and tips independently between enabled and disabled", () => {
    const start = { pileSizes: [290], pileTipLevels: [-18] };

    assert.deepEqual(toggleLegendEditorItem(start, "size", 320), {
      pileSizes: [290, 320],
      pileTipLevels: [-18],
    });
    assert.deepEqual(toggleLegendEditorItem(start, "tip", -18), {
      pileSizes: [290],
      pileTipLevels: [],
    });
  });

  it("supports all, used-only, and empty enabled sets", () => {
    const available = { pileSizes: [290, 320], pileTipLevels: [-18, -19] };
    const used = { pileSizes: [320], pileTipLevels: [-19] };

    assert.deepEqual(applyLegendEditorBulkAction("enable-all", available, used), available);
    assert.deepEqual(applyLegendEditorBulkAction("enable-used", available, used), used);
    assert.deepEqual(applyLegendEditorBulkAction("disable-all", available, used), {
      pileSizes: [],
      pileTipLevels: [],
    });
  });

  it("returns copies from bulk actions", () => {
    const available = { pileSizes: [290], pileTipLevels: [-18] };
    const used = { pileSizes: [290], pileTipLevels: [-18] };
    const result = applyLegendEditorBulkAction("enable-all", available, used);

    result.pileSizes.length = 0;

    assert.deepEqual(available.pileSizes, [290]);
  });
});
