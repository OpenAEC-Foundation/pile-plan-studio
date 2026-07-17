import type {
  PilePlanImportPreview,
  PilePlanImportProfile,
} from "../../core/pilePlanImportContract.ts";

export type PilePlanImportPreviewState =
  | { status: "empty" }
  | { status: "analyzing"; requestId: number }
  | { status: "ready"; requestId: number; preview: PilePlanImportPreview }
  | { status: "failed"; requestId: number; message: string };

export type PilePlanImportDraft<TFile> = {
  file: TFile | null;
  requestedProfile: PilePlanImportProfile;
  coordinateToleranceMm: string;
  importPileAssignments: boolean;
  importCptSelections: boolean;
  previewState: PilePlanImportPreviewState;
};

export function createPilePlanImportDraft<TFile>(): PilePlanImportDraft<TFile> {
  return {
    file: null,
    requestedProfile: "automatic",
    coordinateToleranceMm: "1",
    importPileAssignments: true,
    importCptSelections: true,
    previewState: { status: "empty" },
  };
}

export function setPilePlanImportFile<TFile>(
  draft: PilePlanImportDraft<TFile>,
  file: TFile | null,
): PilePlanImportDraft<TFile> {
  return { ...draft, file, previewState: { status: "empty" } };
}

export function setPilePlanImportProfile<TFile>(
  draft: PilePlanImportDraft<TFile>,
  requestedProfile: PilePlanImportProfile,
): PilePlanImportDraft<TFile> {
  const cptSelectionsWereUnavailable = !canImportCptSelections(draft);
  return {
    ...draft,
    requestedProfile,
    importCptSelections: requestedProfile === "legacy"
      ? false
      : cptSelectionsWereUnavailable
        ? true
        : draft.importCptSelections,
    previewState: { status: "empty" },
  };
}

export function setPilePlanImportTolerance<TFile>(
  draft: PilePlanImportDraft<TFile>,
  coordinateToleranceMm: string,
): PilePlanImportDraft<TFile> {
  return { ...draft, coordinateToleranceMm, previewState: { status: "empty" } };
}

export function setPilePlanImportCategory<TFile>(
  draft: PilePlanImportDraft<TFile>,
  category: "piles" | "cpts",
  enabled: boolean,
): PilePlanImportDraft<TFile> {
  return {
    ...draft,
    importPileAssignments: category === "piles" ? enabled : draft.importPileAssignments,
    importCptSelections: category === "cpts" ? enabled : draft.importCptSelections,
    previewState: { status: "empty" },
  };
}

export function beginPilePlanImportPreview<TFile>(
  draft: PilePlanImportDraft<TFile>,
  requestId: number,
): PilePlanImportDraft<TFile> {
  return { ...draft, previewState: { status: "analyzing", requestId } };
}

export function applyPilePlanImportPreview<TFile>(
  draft: PilePlanImportDraft<TFile>,
  requestId: number,
  preview: PilePlanImportPreview,
): PilePlanImportDraft<TFile> {
  if (draft.previewState.status !== "analyzing" || draft.previewState.requestId !== requestId) {
    return draft;
  }
  return {
    ...draft,
    importCptSelections: preview.supportsCptSelections ? draft.importCptSelections : false,
    previewState: { status: "ready", requestId, preview },
  };
}

export function failPilePlanImportPreview<TFile>(
  draft: PilePlanImportDraft<TFile>,
  requestId: number,
  message: string,
): PilePlanImportDraft<TFile> {
  if (draft.previewState.status !== "analyzing" || draft.previewState.requestId !== requestId) {
    return draft;
  }
  return { ...draft, previewState: { status: "failed", requestId, message } };
}

export function canImportCptSelections<TFile>(draft: PilePlanImportDraft<TFile>): boolean {
  if (draft.requestedProfile === "legacy") return false;
  return draft.previewState.status !== "ready" || draft.previewState.preview.supportsCptSelections;
}

export function pilePlanImportTolerance(draft: PilePlanImportDraft<unknown>): number | null {
  if (draft.coordinateToleranceMm.trim() === "") return null;
  const value = Number(draft.coordinateToleranceMm);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function canApplyPilePlanImport<TFile>(draft: PilePlanImportDraft<TFile>): boolean {
  return draft.file !== null &&
    pilePlanImportTolerance(draft) !== null &&
    (draft.importPileAssignments || draft.importCptSelections) &&
    draft.previewState.status === "ready" &&
    draft.previewState.preview.canApply;
}
