import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DuplicateLoadPointPositionError } from "../core/loadPointPositionContract.ts";
import { prepareOpenedProject } from "./openedProject.ts";

const sampleProjectText = readFileSync(
  new URL("../../../../sample_project/sample_project.ifcpp", import.meta.url),
  "utf8",
);

describe("opened project preparation", () => {
  it("validates positions before constructing replacement state", async () => {
    let validatedCount = 0;

    await assert.rejects(
      prepareOpenedProject(
        sampleProjectText,
        { initializeDefaultPiles: false },
        async (loadPoints) => {
          validatedCount = loadPoints.length;
          return [{
            x_mm: loadPoints[0].x_mm,
            y_mm: loadPoints[0].y_mm,
            loadPoints: [
              { id: loadPoints[0].id, name: loadPoints[0].name },
              { id: loadPoints[1].id, name: loadPoints[1].name },
            ],
          }];
        },
      ),
      DuplicateLoadPointPositionError,
    );

    assert.ok(validatedCount > 1);
  });

  it("returns project state after successful validation", async () => {
    const project = await prepareOpenedProject(
      sampleProjectText,
      { initializeDefaultPiles: false },
      async () => [],
    );

    assert.equal(project.name, "Sample Project");
  });
});
