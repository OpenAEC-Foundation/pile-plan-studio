import {
  ProjectDocumentReadError,
  type ProjectDocumentOutcome,
} from "../core/projectDocumentContract.ts";
import { createInitialProjectState, type ProjectState } from "./projectState.ts";

export type OpenedProjectValidators = {
  readProjectDocument(text: string): Promise<ProjectDocumentOutcome>;
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
): Promise<Extract<ProjectDocumentOutcome, { status: "valid" }>> {
  const outcome = await validators.readProjectDocument(text);
  if (outcome.status === "invalid") {
    throw new ProjectDocumentReadError(outcome.error);
  }
  return outcome;
}
