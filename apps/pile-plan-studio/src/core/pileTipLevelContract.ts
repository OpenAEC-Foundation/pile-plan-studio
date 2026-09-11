import type { IfcppProject } from "./projectFile.ts";

export type PileTipLevelPrecisionReason = "non-finite" | "out-of-range" | "submillimetre";

export type InvalidProjectPileTipLevel = {
  value: string;
  reason: PileTipLevelPrecisionReason;
  context:
    | { kind: "bearing-capacity"; index: number; cptId: number; pileSizeMm: number }
    | { kind: "pile-plan-active"; planId: string; index: number }
    | { kind: "legend"; index: number };
};

export type ProjectTipLevelKeys = {
  bearingCapacities: number[];
  pilePlans: Array<{ id: string; active: number[] }>;
  legend: number[];
};

export type ValidatedIfcppProjectOutcome =
  | { status: "valid"; project: IfcppProject; keys: ProjectTipLevelKeys }
  | { status: "invalid"; errors: InvalidProjectPileTipLevel[] };

export type ValidatedProject = Extract<ValidatedIfcppProjectOutcome, { status: "valid" }>;

type CoreInvalidProjectPileTipLevel = {
  value: string;
  reason: PileTipLevelPrecisionReason;
  context:
    | { kind: "bearing-capacity"; index: number; cpt_id: number; pile_size_mm: number }
    | { kind: "pile-plan-active"; plan_id: string; index: number }
    | { kind: "legend"; index: number };
};

export type CoreValidatedIfcppProjectOutcome =
  | {
      status: "valid";
      project: IfcppProject;
      keys: {
        bearing_capacities: number[];
        pile_plans: Array<{ id: string; active: number[] }>;
        legend: number[];
      };
    }
  | { status: "invalid"; errors: CoreInvalidProjectPileTipLevel[] };

export type CoreValidatedProject = Omit<
  Extract<CoreValidatedIfcppProjectOutcome, { status: "valid" }>,
  "status"
>;

export class InvalidPileTipLevelError extends Error {
  readonly errors: InvalidProjectPileTipLevel[];

  constructor(errors: InvalidProjectPileTipLevel[]) {
    super(`${errors.length} invalid pile tip level(s)`);
    this.name = "InvalidPileTipLevelError";
    this.errors = errors;
  }
}

export function validatedIfcppProjectOutcomeFromCore(
  outcome: CoreValidatedIfcppProjectOutcome,
): ValidatedIfcppProjectOutcome {
  if (outcome.status === "invalid") {
    return {
      status: "invalid",
      errors: outcome.errors.map((error) => ({
        value: error.value,
        reason: error.reason,
        context: mapContext(error.context),
      })),
    };
  }
  return {
    status: "valid",
    project: outcome.project,
    keys: {
      bearingCapacities: [...outcome.keys.bearing_capacities],
      pilePlans: outcome.keys.pile_plans.map((plan) => ({
        id: plan.id,
        active: [...plan.active],
      })),
      legend: [...outcome.keys.legend],
    },
  };
}

export function validatedProjectFromCore(
  result: CoreValidatedProject,
): ValidatedProject {
  const outcome = validatedIfcppProjectOutcomeFromCore({ status: "valid", ...result });
  assertValidIfcppProjectOutcome(outcome);
  return outcome;
}

export function assertValidIfcppProjectOutcome(
  outcome: ValidatedIfcppProjectOutcome,
): asserts outcome is Extract<ValidatedIfcppProjectOutcome, { status: "valid" }> {
  if (outcome.status === "invalid") {
    throw new InvalidPileTipLevelError(outcome.errors);
  }
}

function mapContext(
  context: CoreInvalidProjectPileTipLevel["context"],
): InvalidProjectPileTipLevel["context"] {
  switch (context.kind) {
    case "bearing-capacity":
      return {
        kind: context.kind,
        index: context.index,
        cptId: context.cpt_id,
        pileSizeMm: context.pile_size_mm,
      };
    case "pile-plan-active":
      return {
        kind: context.kind,
        planId: context.plan_id,
        index: context.index,
      };
    case "legend":
      return { kind: context.kind, index: context.index };
  }
}
