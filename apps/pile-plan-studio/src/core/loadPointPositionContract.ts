import type { LoadPoint } from "./projectTypes.ts";

export type DuplicateLoadPointPositionMember = {
  id: number;
  name: string;
};

export type DuplicateLoadPointPosition = {
  x_mm: number;
  y_mm: number;
  loadPoints: DuplicateLoadPointPositionMember[];
};

export type CoreDuplicateLoadPointPosition = {
  x_mm: number;
  y_mm: number;
  load_points: DuplicateLoadPointPositionMember[];
};

export class DuplicateLoadPointPositionError extends Error {
  readonly positions: DuplicateLoadPointPosition[];

  constructor(positions: DuplicateLoadPointPosition[]) {
    super("Load points must have unique positions.");
    this.name = "DuplicateLoadPointPositionError";
    this.positions = positions;
  }
}

export function duplicateLoadPointPositionsFromCore(
  positions: CoreDuplicateLoadPointPosition[],
): DuplicateLoadPointPosition[] {
  return positions.map((position) => ({
    x_mm: position.x_mm,
    y_mm: position.y_mm,
    loadPoints: position.load_points.map((loadPoint) => ({ ...loadPoint })),
  }));
}

export async function assertUniqueLoadPointPositions(
  loadPoints: LoadPoint[],
  validate: (loadPoints: LoadPoint[]) => Promise<DuplicateLoadPointPosition[]>,
): Promise<void> {
  const positions = await validate(loadPoints);
  if (positions.length > 0) throw new DuplicateLoadPointPositionError(positions);
}
