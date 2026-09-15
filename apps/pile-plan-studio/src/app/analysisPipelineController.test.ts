import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createAnalysisPipelineController } from "./analysisPipelineController.ts";

describe("analysis pipeline controller", () => {
  it("rejects superseded and explicitly invalidated results", async () => {
    const pending = new Map<number, (value: string) => void>();
    const controller = createAnalysisPipelineController<number, string>((request) => (
      new Promise((resolve) => pending.set(request, resolve))
    ));

    const first = controller.run(1);
    const second = controller.run(2);
    pending.get(1)!("old");
    pending.get(2)!("current");

    assert.deepEqual(await first, { status: "stale" });
    assert.deepEqual(await second, { status: "applied", result: "current" });

    const invalidated = controller.run(3);
    controller.invalidate();
    pending.get(3)!("late");
    assert.deepEqual(await invalidated, { status: "stale" });
  });

  it("returns only the current failure", async () => {
    const failure = new Error("analysis failed");
    const controller = createAnalysisPipelineController(async () => {
      throw failure;
    });

    assert.deepEqual(await controller.run(undefined), { status: "failed", error: failure });
  });
});
