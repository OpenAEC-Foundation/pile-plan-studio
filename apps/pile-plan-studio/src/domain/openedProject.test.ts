import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ProjectDocumentReadError } from "../core/projectDocumentContract.ts";
import type { IfcppProject } from "../core/projectFile.ts";
import {
  canonicalProjectForTest,
  projectTipLevelKeysForTest,
} from "../core/projectTestSupport.ts";
import { prepareOpenedProject } from "./openedProject.ts";

const sampleProjectText = readFileSync(
  new URL("../../../../sample_project/sample_project.ifcpp", import.meta.url),
  "utf8",
);

function canonicalProject(): IfcppProject {
  const project = canonicalProjectForTest(sampleProjectText);
  project.settings.load_point_grouping ??= {
    automatic: true,
    max_edge_distance_mm: 1_200,
  };
  return project;
}

function validProjectOutcome() {
  const project = canonicalProject();
  return {
    status: "valid" as const,
    project,
    keys: projectTipLevelKeysForTest(project),
  };
}

describe("opened project preparation", () => {
  it("constructs replacement state from one canonical read result", async () => {
    let readCount = 0;
    const project = await prepareOpenedProject(
      sampleProjectText,
      { initializeDefaultPiles: false },
      {
        readProjectDocument: async () => {
          readCount += 1;
          return validProjectOutcome();
        },
      },
    );

    assert.equal(project.name, "Sample Project");
    assert.equal(readCount, 1);
  });

  it("rejects a structured core error before replacing project state", async () => {
    await assert.rejects(
      prepareOpenedProject(
        sampleProjectText,
        { initializeDefaultPiles: false },
        {
          readProjectDocument: async () => ({
            status: "invalid",
            error: {
              code: "duplicate-load-point-positions",
              positions: [{
                xMm: 10,
                yMm: 20,
                loadPoints: [{ id: 1, name: "A" }, { id: 2, name: "B" }],
              }],
            },
          }),
        },
      ),
      (error: unknown) => (
        error instanceof ProjectDocumentReadError
        && error.details.code === "duplicate-load-point-positions"
      ),
    );
  });
});
