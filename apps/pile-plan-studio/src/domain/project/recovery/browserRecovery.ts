export const BROWSER_RECOVERY_FORMAT_VERSION = 1 as const;

export type BrowserRecoveryRecord = {
  formatVersion: typeof BROWSER_RECOVERY_FORMAT_VERSION;
  appVersion: string;
  projectName: string;
  updatedAt: string;
  ifcppText: string;
  savedProjectSignature: string;
  isDirty: boolean;
  isSample?: boolean;
  recentProjectKey?: string;
};

type CreateBrowserRecoveryRecordInput = {
  appVersion: string;
  projectName: string;
  updatedAt: string;
  ifcppText: string;
  savedProjectSignature: string;
  isDirty: boolean;
  isSample?: boolean;
  recentProjectKey?: string;
};

export function createBrowserRecoveryRecord(
  input: CreateBrowserRecoveryRecordInput,
): BrowserRecoveryRecord {
  return {
    formatVersion: BROWSER_RECOVERY_FORMAT_VERSION,
    appVersion: input.appVersion,
    projectName: input.projectName,
    updatedAt: input.updatedAt,
    ifcppText: input.ifcppText,
    savedProjectSignature: input.savedProjectSignature,
    isDirty: input.isDirty,
    ...(input.isSample ? { isSample: true } : {}),
    ...(input.recentProjectKey ? { recentProjectKey: input.recentProjectKey } : {}),
  };
}

export function parseBrowserRecoveryRecord(value: unknown): BrowserRecoveryRecord | null {
  if (!isRecord(value)) return null;
  if (value.formatVersion !== BROWSER_RECOVERY_FORMAT_VERSION) return null;
  if (typeof value.appVersion !== "string" || value.appVersion.length === 0) return null;
  if (typeof value.projectName !== "string" || value.projectName.length === 0) return null;
  if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return null;
  if (typeof value.ifcppText !== "string" || value.ifcppText.length === 0) return null;
  if (typeof value.savedProjectSignature !== "string") return null;
  if (typeof value.isDirty !== "boolean") return null;
  if (value.isSample !== undefined && typeof value.isSample !== "boolean") return null;

  if (value.recentProjectKey !== undefined
    && (typeof value.recentProjectKey !== "string" || !value.recentProjectKey.startsWith("browser:"))) {
    const { recentProjectKey: _ignored, ...record } = value;
    return record as BrowserRecoveryRecord;
  }
  return value as BrowserRecoveryRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
