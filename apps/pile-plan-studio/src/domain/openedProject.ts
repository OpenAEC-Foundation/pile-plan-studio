import { loadIfcppProjectData } from "../core/projectFile.ts";
import {
  assertUniqueLoadPointPositions,
  type DuplicateLoadPointPosition,
} from "../core/loadPointPositionContract.ts";
import type { LoadPoint } from "../core/projectTypes.ts";
import {
  assertValidIfcppProjectOutcome,
  type ValidatedIfcppProjectOutcome,
} from "../core/pileTipLevelContract.ts";
import { createInitialProjectState, type ProjectState } from "./projectState.ts";

export type OpenedProjectValidators = {
  readValidatedProject(text: string): Promise<ValidatedIfcppProjectOutcome>;
  validatePositions(loadPoints: LoadPoint[]): Promise<DuplicateLoadPointPosition[]>;
};

export async function prepareOpenedProject(
  text: string,
  options: Parameters<typeof createInitialProjectState>[1],
  validators: OpenedProjectValidators,
): Promise<ProjectState> {
  const validated = await validateOpenedProject(text, validators);
  return createInitialProjectState(validated.project, options, validated.keys);
}

export async function validateOpenedProject(
  text: string,
  validators: OpenedProjectValidators,
): Promise<Extract<ValidatedIfcppProjectOutcome, { status: "valid" }>> {
  const outcome = await validators.readValidatedProject(text);
  assertValidIfcppProjectOutcome(outcome);
  const { loadPoints } = loadIfcppProjectData(outcome.project, outcome.keys);
  await assertUniqueLoadPointPositions(loadPoints, validators.validatePositions);
  return outcome;
}
