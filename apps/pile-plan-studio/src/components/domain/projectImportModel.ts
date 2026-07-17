import type {
  ImportProfile,
  ImportProfileOptions,
  ImportSourcePreview,
} from "../../core/coreImportContract.ts";
import type { ImportFileRole, NamedImportFile } from "../../core/importFiles.ts";

export type ImportPreviewState =
  | { status: "empty" }
  | { status: "analyzing"; requestId: number }
  | { status: "ready"; requestId: number; preview: ImportSourcePreview }
  | { status: "failed"; requestId: number; message: string };

export type ImportRoleDraft<TFile extends NamedImportFile> = {
  role: ImportFileRole;
  file: TFile | null;
  requestedProfile: ImportProfile;
  profileOptions: ImportProfileOptions;
  previewState: ImportPreviewState;
};

export type ImportDrafts<TFile extends NamedImportFile> = Record<
  ImportFileRole,
  ImportRoleDraft<TFile>
>;

export type ProjectImportMode = "new-project" | "refresh";

const ROLES: ImportFileRole[] = ["load-points", "cpts", "bearing-capacities"];
const EMPTY_OPTIONS: ImportProfileOptions = {
  coordinateSheet: null,
  reactionSheet: null,
};

export function createEmptyImportDrafts<TFile extends NamedImportFile>(): ImportDrafts<TFile> {
  return Object.fromEntries(ROLES.map((role) => [role, emptyDraft<TFile>(role)])) as ImportDrafts<TFile>;
}

export function setImportFile<TFile extends NamedImportFile>(
  drafts: ImportDrafts<TFile>,
  role: ImportFileRole,
  file: TFile | null,
): ImportDrafts<TFile> {
  return updateDraft(drafts, role, {
    ...emptyDraft<TFile>(role),
    file,
  });
}

export function setImportProfile<TFile extends NamedImportFile>(
  drafts: ImportDrafts<TFile>,
  role: ImportFileRole,
  profile: ImportProfile,
): ImportDrafts<TFile> {
  return updateDraft(drafts, role, {
    ...drafts[role],
    requestedProfile: profile,
    profileOptions: { ...EMPTY_OPTIONS },
    previewState: { status: "empty" },
  });
}

export function setImportProfileOptions<TFile extends NamedImportFile>(
  drafts: ImportDrafts<TFile>,
  role: ImportFileRole,
  profileOptions: ImportProfileOptions,
): ImportDrafts<TFile> {
  return updateDraft(drafts, role, {
    ...drafts[role],
    profileOptions,
    previewState: { status: "empty" },
  });
}

export function beginImportPreview<TFile extends NamedImportFile>(
  drafts: ImportDrafts<TFile>,
  role: ImportFileRole,
  requestId: number,
): ImportDrafts<TFile> {
  return updateDraft(drafts, role, {
    ...drafts[role],
    previewState: { status: "analyzing", requestId },
  });
}

export function applyImportPreview<TFile extends NamedImportFile>(
  drafts: ImportDrafts<TFile>,
  role: ImportFileRole,
  requestId: number,
  preview: ImportSourcePreview,
): ImportDrafts<TFile> {
  const current = drafts[role].previewState;
  if (current.status !== "analyzing" || current.requestId !== requestId) {
    return drafts;
  }
  return updateDraft(drafts, role, {
    ...drafts[role],
    profileOptions: preview.resolvedOptions,
    previewState: { status: "ready", requestId, preview },
  });
}

export function failImportPreview<TFile extends NamedImportFile>(
  drafts: ImportDrafts<TFile>,
  role: ImportFileRole,
  requestId: number,
  message: string,
): ImportDrafts<TFile> {
  const current = drafts[role].previewState;
  if (current.status !== "analyzing" || current.requestId !== requestId) {
    return drafts;
  }
  return updateDraft(drafts, role, {
    ...drafts[role],
    previewState: { status: "failed", requestId, message },
  });
}

export function canSubmitProjectImport(
  drafts: ImportDrafts<NamedImportFile>,
  mode: ProjectImportMode,
): boolean {
  const roles = mode === "new-project"
    ? ROLES
    : ROLES.filter((role) => drafts[role].file !== null);
  return roles.length > 0 && roles.every((role) => isReady(drafts[role]));
}

export function shouldWarnAboutMissingFoundationAdvice(
  drafts: ImportDrafts<NamedImportFile>,
  mode: ProjectImportMode,
): boolean {
  return mode === "refresh"
    && drafts.cpts.file !== null
    && drafts["bearing-capacities"].file === null;
}

export function canImportProject(drafts: ImportDrafts<NamedImportFile>): boolean {
  return canSubmitProjectImport(drafts, "new-project");
}

function isReady<TFile extends NamedImportFile>(draft: ImportRoleDraft<TFile>): boolean {
  if (!draft.file || draft.previewState.status !== "ready") return false;
  const preview = draft.previewState.preview;
  return preview.resolvedProfile !== null
    && !preview.diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function emptyDraft<TFile extends NamedImportFile>(role: ImportFileRole): ImportRoleDraft<TFile> {
  return {
    role,
    file: null,
    requestedProfile: "auto",
    profileOptions: { ...EMPTY_OPTIONS },
    previewState: { status: "empty" },
  };
}

function updateDraft<TFile extends NamedImportFile>(
  drafts: ImportDrafts<TFile>,
  role: ImportFileRole,
  draft: ImportRoleDraft<TFile>,
): ImportDrafts<TFile> {
  return { ...drafts, [role]: draft };
}
