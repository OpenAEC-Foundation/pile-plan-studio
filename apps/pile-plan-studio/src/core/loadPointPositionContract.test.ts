import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DuplicateLoadPointPositionError,
  assertUniqueLoadPointPositions,
  duplicateLoadPointPositionsFromCore,
} from "./loadPointPositionContract.ts";
import type { LoadPoint } from "./projectTypes.ts";

const loadPoints: LoadPoint[] = [
  { id: 1, name: "L1", x_mm: 100, y_mm: 200, design_load_kn: 300 },
  { id: 2, name: "L2", x_mm: 100, y_mm: 200, design_load_kn: 400 },
];

describe("load point position contract", () => {
  it("copies duplicate positions returned by the core", () => {
    const core = [{
      x_mm: 100,
      y_mm: 200,
      load_points: [{ id: 1, name: "L1" }, { id: 2, name: "L2" }],
    }];

    const converted = duplicateLoadPointPositionsFromCore(core);
    core[0].load_points[0].name = "changed";

    assert.deepEqual(converted, [{
      x_mm: 100,
      y_mm: 200,
      loadPoints: [{ id: 1, name: "L1" }, { id: 2, name: "L2" }],
    }]);
  });

  it("accepts unique positions", async () => {
    await assert.doesNotReject(assertUniqueLoadPointPositions(loadPoints, async () => []));
  });

  it("throws a structured error containing every conflict", async () => {
    const conflicts = [{
      x_mm: 100,
      y_mm: 200,
      loadPoints: [{ id: 1, name: "L1" }, { id: 2, name: "L2" }],
    }];

    await assert.rejects(
      assertUniqueLoadPointPositions(loadPoints, async (received) => {
        assert.equal(received, loadPoints);
        return conflicts;
      }),
      (error: unknown) => error instanceof DuplicateLoadPointPositionError
        && error.positions === conflicts,
    );
  });
});
