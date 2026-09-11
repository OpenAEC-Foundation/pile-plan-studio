import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DuplicateLoadPointPositionError } from "../core/loadPointPositionContract.ts";
import { InvalidPileTipLevelError } from "../core/pileTipLevelContract.ts";
import { prepareOpenedProject } from "./openedProject.ts";

const sampleProjectText = readFileSync(
  new URL("../../../../sample_project/sample_project.ifcpp", import.meta.url),
  "utf8",
);

function validProjectOutcome() {
  const project = JSON.parse(sampleProjectText);
  return {
    status: "valid" as const,
    project,
    keys: {
      bearingCapacities: project.inputs.bearing_capacities.map(
        (capacity: { pile_tip_level_m: number }) => capacity.pile_tip_level_m * 1_000,
      ),
      pilePlans: project.user_state.pile_plans.map(
        (plan: { id: string; active_pile_tip_levels?: number[] }) => ({
          id: plan.id,
          active: (plan.active_pile_tip_levels ?? project.settings.active_pile_tip_levels ?? [])
            .map((value: number) => value * 1_000),
        }),
      ),
      legend: (project.settings.pile_legend?.pile_tip_levels ?? []).map(
        (item: { value: number }) => item.value * 1_000,
      ),
    },
  };
}

describe("opened project preparation", () => {
  it("validates positions before constructing replacement state", async () => {
    let validatedCount = 0;

    await assert.rejects(
      prepareOpenedProject(
        sampleProjectText,
        { initializeDefaultPiles: false },
        {
          readValidatedProject: async () => validProjectOutcome(),
          validatePositions: async (loadPoints) => {
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
      {
        readValidatedProject: async () => validProjectOutcome(),
        validatePositions: async () => [],
      },
    );

    assert.equal(project.name, "Sample Project");
  });

  it("rejects invalid tip levels before position validation or replacement state", async () => {
    let positionValidationCalled = false;

    await assert.rejects(
      prepareOpenedProject(
        sampleProjectText,
        { initializeDefaultPiles: false },
        {
          readValidatedProject: async () => ({
            status: "invalid",
            errors: [{
              value: "-18.5004",
              reason: "submillimetre",
              context: { kind: "legend", index: 0 },
            }],
          }),
          validatePositions: async () => {
            positionValidationCalled = true;
            return [];
          },
        },
      ),
      InvalidPileTipLevelError,
    );

    assert.equal(positionValidationCalled, false);
  });
});
