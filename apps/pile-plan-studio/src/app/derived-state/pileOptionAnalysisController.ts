export type PileOptionAnalysisOutcome<Result> =
  | { status: "applied"; result: Result }
  | { status: "failed"; error: unknown }
  | { status: "stale" };

export type PileOptionAnalysisController<Request, Result> = {
  run: (request: Request) => Promise<PileOptionAnalysisOutcome<Result>>;
  invalidate: () => void;
};

export function createPileOptionAnalysisController<Request, Result>(
  execute: (request: Request) => Promise<Result>,
): PileOptionAnalysisController<Request, Result> {
  let generation = 0;

  return {
    async run(request) {
      const requestGeneration = ++generation;
      try {
        const result = await execute(request);
        return requestGeneration === generation
          ? { status: "applied", result }
          : { status: "stale" };
      } catch (error) {
        return requestGeneration === generation
          ? { status: "failed", error }
          : { status: "stale" };
      }
    },
    invalidate() {
      generation += 1;
    },
  };
}
