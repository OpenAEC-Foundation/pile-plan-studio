import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildLoadPointGroupEditButtonModel,
  getLoadPointGroupEditAction,
} from "./loadPointGroupEditModel.ts";

describe("load-point group edit controls", () => {
  it("offers ungroup for one complete group and group for another multi-selection", () => {
    const groups = [{ load_point_ids: [1, 2] }, { load_point_ids: [3] }];

    assert.equal(getLoadPointGroupEditAction([2, 1], groups), "ungroup");
    assert.equal(getLoadPointGroupEditAction([1, 3], groups), "group");
    assert.equal(getLoadPointGroupEditAction([3], groups), null);
  });

  it("exposes a blocked preview reason as the disabled-button tooltip", () => {
    assert.deepEqual(buildLoadPointGroupEditButtonModel({
      action: "group",
      editPending: false,
      previewPending: false,
      preview: { allowed: false, reason: "disconnected_selection" },
    }), {
      disabled: true,
      tooltipReason: "disconnected_selection",
    });
  });

  it("does not present a validation tooltip while an allowed edit is pending", () => {
    assert.deepEqual(buildLoadPointGroupEditButtonModel({
      action: "group",
      editPending: true,
      previewPending: false,
      preview: { allowed: true, reason: null },
    }), {
      disabled: true,
      tooltipReason: null,
    });
  });
});
