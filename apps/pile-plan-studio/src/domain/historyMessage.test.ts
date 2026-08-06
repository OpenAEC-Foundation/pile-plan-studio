import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeHistoryAction, describeHistoryResult } from "./historyMessage.ts";

const translate = (key: string, options?: Record<string, unknown>) => (
  `${key}:${JSON.stringify(options ?? {})}`
);

describe("history messages", () => {
  it("describes a bulk pile change with its plan name", () => {
    assert.equal(
      describeHistoryAction(translate, {
        kind: "pile-change",
        count: 15,
        pilePlanName: "Variant 2",
      }),
      'history.actions.pile-change:{"count":15,"pilePlanName":"Variant 2"}',
    );
  });

  it("wraps an action as an Undo result", () => {
    assert.equal(
      describeHistoryResult(translate, {
        id: 1,
        direction: "undo",
        action: { kind: "cost-settings" },
      }),
      'history.result.undo:{"action":"history.actions.cost-settings:{}"}',
    );
  });
});
