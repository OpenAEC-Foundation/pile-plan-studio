import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getPointIdsInRectangle } from "./lassoSelection.ts";

describe("lasso selection", () => {
  it("selects points inside a screen-space rectangle", () => {
    const selected = getPointIdsInRectangle(
      [
        { id: 1, x: 10, y: 10 },
        { id: 2, x: 30, y: 30 },
        { id: 3, x: 60, y: 60 },
      ],
      { startX: 40, startY: 40, endX: 0, endY: 0 },
    );

    assert.deepEqual(selected, [1, 2]);
  });
});
