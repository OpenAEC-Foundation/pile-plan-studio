export const BROWSER_RECOVERY_FORMAT_VERSION = 1 as const;
export const SUPPORTED_IFCPP_SCHEMA_VERSIONS = [1, 2, 3] as const;

export type BrowserRecoveryRecord = {
  formatVersion: typeof BROWSER_RECOVERY_FORMAT_VERSION;
  appVersion: string;
  schemaVersion: number;
  projectName: string;
  updatedAt: string;
  ifcppText: string;
  savedProjectSignature: string;
  isDirty: boolean;
};

type CreateBrowserRecoveryRecordInput = {
  appVersion: string;
  projectName: string;
  updatedAt: string;
  ifcppText: string;
  savedProjectSignature: string;
  isDirty: boolean;
};

type IfcppRecoveryMetadata = {
  schema?: unknown;
  schema_version?: unknown;
  metadata?: { name?: unknown };
};

export function createBrowserRecoveryRecord(
  input: CreateBrowserRecoveryRecordInput,
): BrowserRecoveryRecord {
  const project = parseIfcppMetadata(input.ifcppText);
  if (!project) throw new Error("Cannot create browser recovery from invalid IFCPP data.");
  if (project.projectName !== input.projectName) {
    throw new Error("Browser recovery project metadata does not match the IFCPP project.");
  }

  return {
    formatVersion: BROWSER_RECOVERY_FORMAT_VERSION,
    appVersion: input.appVersion,
    schemaVersion: project.schemaVersion,
    projectName: input.projectName,
    updatedAt: input.updatedAt,
    ifcppText: input.ifcppText,
    savedProjectSignature: input.savedProjectSignature,
    isDirty: input.isDirty,
  };
}

export function parseBrowserRecoveryRecord(value: unknown): BrowserRecoveryRecord | null {
  if (!isRecord(value)) return null;
  if (value.formatVersion !== BROWSER_RECOVERY_FORMAT_VERSION) return null;
  if (typeof value.appVersion !== "string" || value.appVersion.length === 0) return null;
  if (typeof value.schemaVersion !== "number" || !isSupportedSchemaVersion(value.schemaVersion)) return null;
  if (typeof value.projectName !== "string" || value.projectName.length === 0) return null;
  if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return null;
  if (typeof value.ifcppText !== "string" || value.ifcppText.length === 0) return null;
  if (typeof value.savedProjectSignature !== "string") return null;
  if (typeof value.isDirty !== "boolean") return null;

  const project = parseIfcppMetadata(value.ifcppText);
  if (!project) return null;
  if (project.schemaVersion !== value.schemaVersion || project.projectName !== value.projectName) return null;

  return value as BrowserRecoveryRecord;
}

function parseIfcppMetadata(ifcppText: string): { schemaVersion: number; projectName: string } | null {
  try {
    const value = JSON.parse(ifcppText) as IfcppRecoveryMetadata;
    if (value.schema !== "IFCPP") return null;
    if (typeof value.schema_version !== "number" || !isSupportedSchemaVersion(value.schema_version)) return null;
    const projectName = value.metadata?.name;
    if (typeof projectName !== "string" || projectName.length === 0) return null;
    return { schemaVersion: value.schema_version, projectName };
  } catch {
    return null;
  }
}

function isSupportedSchemaVersion(value: number): boolean {
  return SUPPORTED_IFCPP_SCHEMA_VERSIONS.some((version) => version === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
