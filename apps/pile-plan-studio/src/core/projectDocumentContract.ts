import type {
  IfcppImportLogEntry,
  IfcppPilePlan,
  IfcppProject,
} from "./projectFile.ts";
import type { PileConfigurationKey } from "./projectTypes.ts";
import type { ProjectTipLevelKeys } from "./pileTipLevelContract.ts";

type NumericCollection<T> = Map<number, T> | Record<string, T>;
type StringCollection<T> = Map<string, T> | Record<string, T>;

type CoreProjectImportLogEntry = IfcppImportLogEntry & {
  source_file: string;
  imported_at: string | null;
  sheet_name: string | null;
  mapped_columns: StringCollection<string>;
  schema_version: string | null;
  profile_details: StringCollection<string>;
};

type ProjectImportLogEntry = Omit<CoreProjectImportLogEntry, "mapped_columns" | "profile_details"> & {
  mapped_columns: Record<string, string>;
  profile_details: Record<string, string>;
};

type CorePilePlan = Omit<IfcppPilePlan, "selected_piles" | "optimization_unassigned"> & {
  selected_piles: NumericCollection<IfcppPilePlan["selected_piles"][string]>;
  optimization_unassigned: NumericCollection<unknown>;
};

type CoreCanonicalProject = Omit<IfcppProject, "settings" | "user_state" | "import_log"> & {
  settings: Omit<IfcppProject["settings"], "cpt_selection_by_load_point"> & {
    cpt_selection_by_load_point: NumericCollection<
      IfcppProject["settings"]["cpt_selection_by_load_point"][string]
    >;
  };
  user_state: {
    pile_plans: CorePilePlan[];
    active_pile_plan_id: string;
    manual_cpt_selections: NumericCollection<number[]>;
  };
  import_log: CoreProjectImportLogEntry[];
};

export type CoreProjectDocumentError =
  | { code: "invalid-json"; message: string }
  | { code: "invalid-schema"; schema: string }
  | { code: "unsupported-schema-version"; schema_version: number }
  | { code: "duplicate-pile-plan-id"; pile_plan_id: string }
  | {
      code: "duplicate-load-point-positions";
      positions: Array<{
        x_mm: number;
        y_mm: number;
        load_points: Array<{ id: number; name: string }>;
      }>;
    }
  | {
      code: "invalid-pile-tip-levels";
      errors: CoreInvalidProjectPileTipLevel[];
    };

type CoreInvalidProjectPileTipLevel = {
  value: string;
  reason: "non-finite" | "out-of-range" | "submillimetre";
  context:
    | { kind: "bearing-capacity"; index: number; cpt_id: number; pile_size_mm: number }
    | { kind: "pile-plan-active"; plan_id: string; index: number }
    | { kind: "legend"; index: number };
};

export type ProjectDocumentError =
  | Extract<CoreProjectDocumentError, { code: "invalid-json" | "invalid-schema" }>
  | { code: "unsupported-schema-version"; schemaVersion: number }
  | { code: "duplicate-pile-plan-id"; pilePlanId: string }
  | {
      code: "duplicate-load-point-positions";
      positions: Array<{
        xMm: number;
        yMm: number;
        loadPoints: Array<{ id: number; name: string }>;
      }>;
    }
  | {
      code: "invalid-pile-tip-levels";
      errors: Array<{
        value: string;
        reason: CoreInvalidProjectPileTipLevel["reason"];
        context:
          | { kind: "bearing-capacity"; index: number; cptId: number; pileSizeMm: number }
          | { kind: "pile-plan-active"; planId: string; index: number }
          | { kind: "legend"; index: number };
      }>;
    };

export type CoreProjectDocumentOutcome =
  | {
      status: "valid";
      project: CoreCanonicalProject;
      keys: {
        bearing_capacities: number[];
        pile_plans: Array<{ id: string; active: number[] }>;
        legend: number[];
      };
    }
  | { status: "invalid"; error: CoreProjectDocumentError };

export type CoreValidatedProjectDocument = Omit<
  Extract<CoreProjectDocumentOutcome, { status: "valid" }>,
  "status"
>;

export type ProjectDocumentOutcome =
  | { status: "valid"; project: IfcppProject; keys: ProjectTipLevelKeys }
  | { status: "invalid"; error: ProjectDocumentError };

export type ProjectDocumentDraft = {
  metadata: IfcppProject["metadata"];
  units: NonNullable<IfcppProject["units"]>;
  inputs: IfcppProject["inputs"];
  settings: IfcppProject["settings"];
  user_state: {
    pile_plans: IfcppPilePlan[];
    active_pile_plan_id: string;
    manual_cpt_selections: Record<string, number[]>;
  };
  active_selected_piles: Record<string, PileConfigurationKey>;
  import_log: ProjectImportLogEntry[];
};

type BrowserProjectDocumentDraft = Omit<
  ProjectDocumentDraft,
  "settings" | "user_state" | "active_selected_piles" | "import_log"
> & {
  settings: Omit<ProjectDocumentDraft["settings"], "cpt_selection_by_load_point"> & {
    cpt_selection_by_load_point: Map<
      number,
      ProjectDocumentDraft["settings"]["cpt_selection_by_load_point"][string]
    >;
  };
  user_state: {
    pile_plans: Array<Omit<IfcppPilePlan, "selected_piles" | "optimization_unassigned"> & {
      selected_piles: Map<number, IfcppPilePlan["selected_piles"][string]>;
      optimization_unassigned: Map<number, unknown>;
    }>;
    active_pile_plan_id: string;
    manual_cpt_selections: Map<number, number[]>;
  };
  active_selected_piles: Map<number, PileConfigurationKey>;
  import_log: Array<Omit<ProjectImportLogEntry, "mapped_columns" | "profile_details"> & {
    mapped_columns: Map<string, string>;
    profile_details: Map<string, string>;
  }>;
};

export function projectDocumentOutcomeFromCore(
  outcome: CoreProjectDocumentOutcome,
): ProjectDocumentOutcome {
  if (outcome.status === "invalid") {
    return { status: "invalid", error: projectDocumentErrorFromCore(outcome.error) };
  }

  return {
    status: "valid",
    project: projectFromCore(outcome.project),
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

export function projectDocumentErrorFromCore(
  error: CoreProjectDocumentError,
): ProjectDocumentError {
  switch (error.code) {
    case "invalid-json":
    case "invalid-schema":
      return { ...error };
    case "unsupported-schema-version":
      return { code: error.code, schemaVersion: error.schema_version };
    case "duplicate-pile-plan-id":
      return { code: error.code, pilePlanId: error.pile_plan_id };
    case "duplicate-load-point-positions":
      return {
        code: error.code,
        positions: error.positions.map((position) => ({
          xMm: position.x_mm,
          yMm: position.y_mm,
          loadPoints: position.load_points.map((member) => ({ ...member })),
        })),
      };
    case "invalid-pile-tip-levels":
      return {
        code: error.code,
        errors: error.errors.map((item) => ({
          value: item.value,
          reason: item.reason,
          context: projectPileTipLevelContextFromCore(item.context),
        })),
      };
  }
}

export function projectDocumentErrorFromUnknown(error: unknown): ProjectDocumentError | null {
  return isCoreProjectDocumentError(error)
    ? projectDocumentErrorFromCore(error)
    : null;
}

export function toBrowserProjectDocumentDraft(
  draft: ProjectDocumentDraft,
): BrowserProjectDocumentDraft {
  return {
    ...draft,
    settings: {
      ...draft.settings,
      cpt_selection_by_load_point: numericMap(draft.settings.cpt_selection_by_load_point),
    },
    user_state: {
      ...draft.user_state,
      pile_plans: draft.user_state.pile_plans.map((plan) => ({
        ...plan,
        selected_piles: numericMap(plan.selected_piles),
        optimization_unassigned: numericMap(plan.optimization_unassigned ?? {}),
      })),
      manual_cpt_selections: numericMap(draft.user_state.manual_cpt_selections),
    },
    active_selected_piles: numericMap(draft.active_selected_piles),
    import_log: draft.import_log.map((entry) => ({
      ...entry,
      mapped_columns: stringMap(entry.mapped_columns),
      profile_details: stringMap(entry.profile_details),
    })),
  };
}

export function toDesktopProjectDocumentDraft(
  draft: ProjectDocumentDraft,
): ProjectDocumentDraft {
  return {
    ...draft,
    settings: {
      ...draft.settings,
      cpt_selection_by_load_point: { ...draft.settings.cpt_selection_by_load_point },
    },
    user_state: {
      ...draft.user_state,
      pile_plans: draft.user_state.pile_plans.map((plan) => ({
        ...plan,
        selected_piles: { ...plan.selected_piles },
        optimization_unassigned: { ...(plan.optimization_unassigned ?? {}) },
      })),
      manual_cpt_selections: { ...draft.user_state.manual_cpt_selections },
    },
    active_selected_piles: { ...draft.active_selected_piles },
    import_log: draft.import_log.map((entry) => ({
      ...entry,
      mapped_columns: { ...entry.mapped_columns },
      profile_details: { ...entry.profile_details },
    })),
  };
}

function projectFromCore(project: CoreCanonicalProject): IfcppProject {
  return {
    ...project,
    settings: {
      ...project.settings,
      cpt_selection_by_load_point: numericRecord(
        project.settings.cpt_selection_by_load_point,
      ),
    },
    user_state: {
      ...project.user_state,
      pile_plans: project.user_state.pile_plans.map((plan) => ({
        ...plan,
        selected_piles: numericRecord(plan.selected_piles),
        optimization_unassigned: numericRecord(plan.optimization_unassigned),
      })),
      manual_cpt_selections: numericRecord(project.user_state.manual_cpt_selections),
    },
    import_log: project.import_log.map((entry) => ({
      ...entry,
      mapped_columns: stringRecord(entry.mapped_columns),
      profile_details: stringRecord(entry.profile_details),
    })),
  };
}

function projectPileTipLevelContextFromCore(
  context: CoreInvalidProjectPileTipLevel["context"],
): Extract<ProjectDocumentError, { code: "invalid-pile-tip-levels" }>["errors"][number]["context"] {
  switch (context.kind) {
    case "bearing-capacity":
      return {
        kind: context.kind,
        index: context.index,
        cptId: context.cpt_id,
        pileSizeMm: context.pile_size_mm,
      };
    case "pile-plan-active":
      return { kind: context.kind, planId: context.plan_id, index: context.index };
    case "legend":
      return { kind: context.kind, index: context.index };
  }
}

function numericMap<T>(values: Record<string, T>): Map<number, T> {
  return new Map(Object.entries(values).map(([key, value]) => [numericKey(key), value]));
}

function numericRecord<T>(values: NumericCollection<T>): Record<string, T> {
  return Object.fromEntries(
    [...collectionEntries(values)].map(([key, value]) => [String(numericKey(key)), value]),
  );
}

function stringMap<T>(values: Record<string, T>): Map<string, T> {
  return new Map(Object.entries(values));
}

function stringRecord<T>(values: StringCollection<T>): Record<string, T> {
  return Object.fromEntries(collectionEntries(values));
}

function collectionEntries<K extends string | number, T>(
  values: Map<K, T> | Record<string, T>,
): Array<[K | string, T]> {
  return values instanceof Map
    ? [...values.entries()]
    : Object.entries(values);
}

function numericKey(value: string | number): number {
  const key = Number(value);
  if (!Number.isInteger(key)) {
    throw new Error(`Expected an integer map key, got ${value}`);
  }
  return key;
}

function isCoreProjectDocumentError(value: unknown): value is CoreProjectDocumentError {
  if (!isRecord(value) || typeof value.code !== "string") return false;
  switch (value.code) {
    case "invalid-json":
      return typeof value.message === "string";
    case "invalid-schema":
      return typeof value.schema === "string";
    case "unsupported-schema-version":
      return typeof value.schema_version === "number";
    case "duplicate-pile-plan-id":
      return typeof value.pile_plan_id === "string";
    case "duplicate-load-point-positions":
      return Array.isArray(value.positions) && value.positions.every(isDuplicatePosition);
    case "invalid-pile-tip-levels":
      return Array.isArray(value.errors) && value.errors.every(isInvalidPileTipLevel);
    default:
      return false;
  }
}

function isDuplicatePosition(value: unknown): boolean {
  return isRecord(value)
    && typeof value.x_mm === "number"
    && typeof value.y_mm === "number"
    && Array.isArray(value.load_points)
    && value.load_points.every((member) => (
      isRecord(member)
      && typeof member.id === "number"
      && typeof member.name === "string"
    ));
}

function isInvalidPileTipLevel(value: unknown): boolean {
  if (
    !isRecord(value)
    || typeof value.value !== "string"
    || !["non-finite", "out-of-range", "submillimetre"].includes(String(value.reason))
    || !isRecord(value.context)
    || typeof value.context.kind !== "string"
    || typeof value.context.index !== "number"
  ) return false;

  switch (value.context.kind) {
    case "bearing-capacity":
      return typeof value.context.cpt_id === "number"
        && typeof value.context.pile_size_mm === "number";
    case "pile-plan-active":
      return typeof value.context.plan_id === "string";
    case "legend":
      return true;
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
