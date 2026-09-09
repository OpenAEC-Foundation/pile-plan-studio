import { loadIfcppProjectData } from "../core/projectFile.ts";
import {
  assertUniqueLoadPointPositions,
  type DuplicateLoadPointPosition,
} from "../core/loadPointPositionContract.ts";
import type { LoadPoint } from "../core/projectTypes.ts";
import { createInitialProjectState, type ProjectState } from "./projectState.ts";

export async function prepareOpenedProject(
  text: string,
  options: Parameters<typeof createInitialProjectState>[1],
  validatePositions: (loadPoints: LoadPoint[]) => Promise<DuplicateLoadPointPosition[]>,
): Promise<ProjectState> {
  await validateOpenedProject(text, validatePositions);
  return createInitialProjectState(text, options);
}

export async function validateOpenedProject(
  text: string,
  validatePositions: (loadPoints: LoadPoint[]) => Promise<DuplicateLoadPointPosition[]>,
): Promise<void> {
  const { loadPoints } = loadIfcppProjectData(text);
  await assertUniqueLoadPointPositions(loadPoints, validatePositions);
}
