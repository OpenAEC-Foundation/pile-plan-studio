import { createSymbolScaleHistory } from "../project/symbolScaleHistory.ts";
import { useCptSelectionPreview } from "../derived-state/useCptSelectionPreview.ts";
import { useNewPilePlan } from "../project/useNewPilePlan.ts";
import { beginLoadPointLockEditing, cancelLoadPointLockEditing, clearLoadPointLockDraft, finishLoadPointLockEditing } from "../../domain/pile-plans/loadPointLockEditing.ts";
import {applyIlpPreviewInteraction} from "../../domain/pile-plans/ilp-optimization/ilpLivePreview.ts";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import sampleProjectText from "../../../../../sample_project/sample_project.ifcpp?raw";
import TitleBar from "../../components/template/TitleBar";
import Ribbon from "../../components/template/ribbon/Ribbon";
import {useIlpOptimization} from "../optimization/useIlpOptimization.ts";
import { createProjectMarker } from "../mcp/projectMarker.ts";
import type { McpSnapshot } from "../mcp/protocol.ts";
import { createSessionMcpDispatcher } from "../mcp/sessionDispatcher.ts";
import { useMcpConnection } from "../mcp/useMcpConnection.ts";
import { useMcpDerivedState } from "../mcp/useMcpDerivedState.ts";
import { createSourceImportSession } from "../mcp/sourceImportSession.ts";
import { createMcpFileOperationSession } from "../mcp/fileOperationSession.ts";
import { createPilePlanImportSession } from "../mcp/pilePlanImportSession.ts";
import { createPilePlanImportOperations } from "../mcp/pilePlanImportOperations.ts";
import { requireCurrentGroups } from "../mcp/projectSettingsSources.ts";
import { createMcpProjectFileOperations } from "../mcp/projectFileOperations.ts";
import { createSourceImportOperations } from "../mcp/sourceImportOperations.ts";
import { prepareLegendEditorEdit, prepareProjectDocumentEdit,
  preparePileCostCatalogEdit, preparePileCostCatalogDefaultEdit, prepareMergedPileCostCatalogEdit,
  type PreparedProjectDocumentEdit } from "../project/projectEditOperations.ts";
import type { CostCatalogAction } from "../../core/settingsEditCoreClient.ts";
import type { LegendEditorDraft } from "../../domain/legend/legendEditorModel.ts";
import IlpOptimizationSettingsPanel from "../../components/domain/pile-plans/ilp-optimization/IlpOptimizationSettingsPanel.tsx";
import IlpOptimizationResultPanel from "../../components/domain/pile-plans/ilp-optimization/IlpOptimizationResultPanel.tsx";
import Backstage from "../../components/template/backstage/Backstage";
import SettingsDialog, { applyTheme } from "../../components/template/settings/SettingsDialog";
import FeedbackDialog from "../../components/template/feedback/FeedbackDialog";
import StatusBar from "../../components/template/StatusBar";
import InterfaceScaleNotice, { type InterfaceScaleNoticeValue } from "../../components/template/InterfaceScaleNotice";
import ActionNotice, { type ActionNoticeTone } from "../../components/viewer/ActionNotice";
import PilePlanWorkspace from "../../components/domain/pile-plans/PilePlanWorkspace";
import RightPanel, { type RightTaskPanel } from "../../components/domain/right-panel/RightPanel";
import { usePileOptionCosts } from "../derived-state/usePileOptionCosts.ts";
import { useLoadPointGroups } from "../derived-state/useLoadPointGroups.ts";
import { useGroupEdit } from "../project/useGroupEdit.ts";
import { usePileAssignment } from "../project/usePileAssignment.ts";
import { useProjectTechnicalAssignment } from "../derived-state/useProjectTechnicalAssignment.ts";
import { useGroupAssignmentAssessment } from "../derived-state/useGroupAssignmentAssessment.ts";
import ProjectInformationDialog from "../../components/domain/project/ProjectInformationDialog";
import UnsavedChangesDialog from "../../components/domain/project/UnsavedChangesDialog.tsx";
import PilePlanExplorer from "../../components/domain/pile-plans/PilePlanExplorer.tsx";
import SourceDataViewer from "../../components/domain/source-data/SourceDataViewer.tsx";
import type { InputSourceKind } from "../../domain/project/projectState.ts";
import type { SourceLoadPointSelection } from "../../domain/source-data/sourceTableModel.ts";
import {
  assessLoadPointGroupAssignmentsCore,
  calculatePileCostCore,
  calculatePileOptionAnalysisCore,
  chooseDefaultPileOptionsCore,
  exportPilePlanCsvCore,
  exportPilePlanXlsxCore,
  importProjectFromFilesCore,
  readProjectDocumentCore,
  refreshProjectFromFilesCore,
  writeProjectDocumentCore,
} from "../../core/coreClient";
import { invokeDesktop, listenDesktop } from "../../core/coreTransport.ts";
import type { PileCostSettings } from "../../core/projectTypes.ts";
import type { ImportSourceInput } from "../../core/coreImportContract";
import type { ProjectImportProperties } from "../../components/domain/imports/ProjectImportPanel.tsx";
import type { ImportFileRole } from "../../core/importFiles.ts";
import { getImportSummary } from "../../core/projectFile";
import { createInitialProjectState, type ProjectState } from "../../domain/project/projectState";
import { prepareOpenedProject } from "../../domain/project/openedProject.ts";
import {
  ProjectDocumentReadError,
  type ProjectDocumentOutcome,
} from "../../core/projectDocumentContract.ts";
import { getSetting } from "../../store";
import { switchRightPanelMode } from "../../domain/workspace/selectionState";
import {
  getProjectFileCommands,
  isDesktopRuntime,
  pilePlanExportFileName,
  projectFileName,
  saveBinaryExport,
  saveGeneratedFile,
  savePreparedFile,
} from "../../domain/project/projectPersistence.ts";
import {
  DEFAULT_EXPLORER_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  snapExplorerWidth,
  snapRightPanelWidth,
} from "../../viewer/panelLayout.ts";
import { buildPilePlanExportInputForPlan } from "../../domain/pile-plans/pilePlanExport.ts";
import {
  applyPilePlanImportAsNewPlan,
  pilePlanNameFromFileName,
} from "../../domain/pile-plans/pilePlanImport.ts";
import type { PilePlanImportPatch } from "../../core/pilePlanImportContract.ts";
import { mergeDefaultPileChoices } from "../../domain/pile-plans/defaultPileChoices.ts";
import { summarizePilePlanCosts } from "../../domain/pile-plans/projectCostSummary.ts";
import {
  deletePilePlan,
  duplicatePilePlan,
  renamePilePlan,
  synchronizeActivePilePlan,
  type PilePlanLanguage,
} from "../../domain/pile-plans/pilePlanManagement.ts";
import { activatePilePlanState } from "../../domain/pile-plans/pilePlanNavigation.ts";
import {
  getAvailablePileConfigurationCatalog,
} from "../../domain/pile-plans/optimization/optimizationCandidates.ts";
import {
  getActiveLockedLoadPointIds,
} from "../../domain/pile-plans/loadPointLocking.ts";
import {
  createManagedProjectState,
  projectHistoryReducer,
} from "../../domain/project/history/projectHistoryReducer.ts";
import {
  openedProjectLifecycleState,
  projectDraftFromState,
  projectStateSignature,
} from "../project/projectLifecycleController.ts";
import { createPileOptionAnalysisController } from "../derived-state/pileOptionAnalysisController.ts";
import { describeHistoryAction, describeHistoryResult } from "../../domain/project/history/historyMessage.ts";
import type { HistoryAction } from "../../domain/project/history/historyAction.ts";
import { createBrowserRecoveryRecord } from "../../domain/project/recovery/browserRecovery.ts";
import {
  createBrowserRecoveryWriter,
  type BrowserRecoveryStore,
} from "../../domain/project/recovery/browserRecoveryStore.ts";
import { createAppShortcutHandler, dispatchHistoryShortcut, releasePointerActivatedControlFocus } from "./sessionShortcuts.ts";
import { DEFAULT_INTERFACE_SCALE, normalizeInterfaceScale, stepInterfaceScale } from "../../domain/settings/interfaceScale.ts";
import { applyDesktopInterfaceScale } from "../../domain/settings/interfaceScaleRuntime.ts";
import {
  DEFAULT_USER_SETTINGS,
  patchPileCostDefaults,
  patchUserSettings,
  patchWorkspaceLayout,
  type UserSettings,
  type WorkspaceLayoutSettings,
} from "../../domain/settings/userSettings.ts";
import {
  createPlatformUserSettingsStore,
  loadUserSettings,
  saveUserSettings,
  type UserSettingsStore,
} from "../../domain/settings/userSettingsStore.ts";
import { changeLanguage } from "../../i18n/config.ts";
import { elementLayoutScale, screenToLocal } from "../../domain/settings/uiBaseline.ts";
import { VIEWER_LAYOUT_CHANGE_EVENT } from "../../viewer/viewerGeometry.ts";
import { transitionLassoSelectionMode } from "../../viewer/lassoSelection.ts";
import {
  addReactViewerLoadPoints,
  clearReactViewerSelection,
  expandInitialReactViewerLoadPointGroup,
  openReactViewerCpt,
  setReactViewerLoadPoints,
  toggleReactViewerLoadPoint,
} from "../../domain/workspace/viewerInteractions.ts";
import {
  describeProjectOpenError,
  getLoadPointGroupEditHistoryAction,
  importRoleForSource,
} from "./appSessionSupport.ts";

const BUILT_IN_PILE_COST_DEFAULTS = (
  JSON.parse(sampleProjectText) as { settings: { pile_costs: PileCostSettings } }
).settings.pile_costs;

function requireValidProjectDocument(
  outcome: ProjectDocumentOutcome,
): Extract<ProjectDocumentOutcome, { status: "valid" }> {
  if (outcome.status === "invalid") throw new ProjectDocumentReadError(outcome.error);
  return outcome;
}

export type AppSessionProps = {
  initialProject: Extract<ProjectDocumentOutcome, { status: "valid" }>;
  initializeDefaultPiles: boolean;
  initialSavedProjectSignature?: string;
  initialWasDirty?: boolean;
  initialStatusKey?: string;
  recoveryStore?: BrowserRecoveryStore;
};

type ActionNoticeValue = {
  id: number;
  message: string;
  tone: ActionNoticeTone;
};

export default function AppSession({
  initialProject,
  initializeDefaultPiles,
  initialSavedProjectSignature,
  initialWasDirty = false,
  initialStatusKey,
  recoveryStore,
}: AppSessionProps) {
  const { t, i18n } = useTranslation();
  const [managedProject, dispatchProject] = useReducer(
    projectHistoryReducer,
    initialProject,
    (project) => createManagedProjectState(createInitialProjectState(
      project.project,
      {
        initializeDefaultPiles,
        defaultPilePlanName: i18n.language.startsWith("nl") ? "Basisplan" : "Base plan",
      },
      project.keys,
    )),
  );
  const projectState = managedProject.present;
  const initialGroupSelectionRef = useRef({
    loadPoints: projectState.loadPoints,
    loadPointId: projectState.selectedLoadPointIds.length === 1
      ? projectState.selectedLoadPointId
      : null,
    handled: false,
  });
  const [analysisPipeline] = useState(() => (
    createPileOptionAnalysisController(calculatePileOptionAnalysisCore)
  ));
  const projectStateRef = useRef(projectState);
  projectStateRef.current = projectState;
  const mcpProjectMarkerRef = useRef<ReturnType<typeof createProjectMarker> | null>(null);
  mcpProjectMarkerRef.current ??= createProjectMarker();
  const mcpAnalysisBaselineRef = useRef({
    request: projectState.analysisRequest,
    options: projectState.pileOptionsByLoadPointId,
    selections: projectState.selectedCptsByLoadPointId,
  });
  if (mcpAnalysisBaselineRef.current.request !== projectState.analysisRequest) {
    mcpAnalysisBaselineRef.current = {
      request: projectState.analysisRequest,
      options: projectState.pileOptionsByLoadPointId,
      selections: projectState.selectedCptsByLoadPointId,
    };
  }
  const mcpAnalysisReady = projectState.pileOptionsByLoadPointId !== mcpAnalysisBaselineRef.current.options
    && projectState.selectedCptsByLoadPointId !== mcpAnalysisBaselineRef.current.selections;
  const loadPointGroups = useLoadPointGroups(
    projectState.loadPoints,
    projectState.loadPointGroupingSettings,
  );
  const { hasCompletedLoadPointGroups, technicalPileOptionsByLoadPointId, technicalAssignmentInput, technicalAssignment } =
    useProjectTechnicalAssignment(projectState, loadPointGroups);
  const loadPointGroupsRef = useRef(loadPointGroups.groups);
  loadPointGroupsRef.current = loadPointGroups.groups;
  const { pending: pileAssignmentPending, apply: applyGroupedPileConfiguration, invalidate: invalidatePileAssignmentRequests } =
    usePileAssignment({
      currentState: () => projectStateRef.current,
      currentGroups: () => loadPointGroupsRef.current,
      groupsReady: () => hasCompletedLoadPointGroups,
      commit: (update) => commitProjectState(update),
      blocked: (names) => showActionNotice(t("loadPointGroups.assignmentBlocked", { names: names.join(", ") }), "error"),
      failed: (message) => showActionNotice(message, "error"),
    });
  const { pending: groupEditPending, preview: previewGroupEdit, apply: applyGroupEdit } = useGroupEdit({
    currentState: () => projectStateRef.current,
    ready: () => !loadPointGroups.pending && loadPointGroups.error === null,
    commit: (update, action) => commitProjectState(update, action),
    blocked: (reason) => showActionNotice(t(`loadPointGroups.editBlocked.${reason}`), "error"),
  });
  const setProjectState = useCallback((update: SetStateAction<ProjectState>) => {
    dispatchProject({ type: "runtime", update });
  }, []);
  useEffect(() => {
    const initialSelection = initialGroupSelectionRef.current;
    if (
      initialSelection.handled
      || initialSelection.loadPoints !== projectState.loadPoints
      || loadPointGroups.pending
      || loadPointGroups.error !== null
      || loadPointGroups.topology === null
    ) {
      return;
    }
    initialSelection.handled = true;
    setProjectState((current) => {
      if (current.loadPoints !== initialSelection.loadPoints) return current;
      const selection = expandInitialReactViewerLoadPointGroup(
        current,
        initialSelection.loadPointId,
        loadPointGroups.groups,
      );
      return selection === current ? current : { ...current, ...selection };
    });
  }, [
    loadPointGroups.error,
    loadPointGroups.groups,
    loadPointGroups.pending,
    loadPointGroups.topology,
    projectState.loadPoints,
    setProjectState,
  ]);
  const commitProjectState = useCallback((
    update: SetStateAction<ProjectState>,
    action?: HistoryAction,
  ) => {
    dispatchProject({ type: "commit", update, action });
  }, []);
  const amendProjectState = useCallback((update: SetStateAction<ProjectState>) => {
    dispatchProject({ type: "amend", update });
  }, []);
  const [symbolScaleHistory] = useState(() => createSymbolScaleHistory({
    commit: commitProjectState,
    amend: amendProjectState,
  }));
  const replaceProjectState = useCallback((state: ProjectState) => {
    mcpProjectMarkerRef.current!.reset();
    projectStateRef.current = state;
    initialGroupSelectionRef.current = {
      loadPoints: state.loadPoints,
      loadPointId: state.selectedLoadPointIds.length === 1 ? state.selectedLoadPointId : null,
      handled: false,
    };
    invalidatePileAssignmentRequests();
    dispatchProject({ type: "replace", state });
  }, [invalidatePileAssignmentRequests]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mcpWriteEnabled, setMcpWriteEnabled] = useState(false);
  const mcpWriteEnabledRef = useRef(false);
  const [backstageOpen, setBackstageOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [projectInformationOpen, setProjectInformationOpen] = useState(false);
  const [rightTaskPanel, setRightTaskPanel] = useState<RightTaskPanel | null>(null);
  const [lassoSelectionActive, setLassoSelectionActive] = useState(false);
  const [activeSourceKind, setActiveSourceKind] = useState<InputSourceKind | null>(null);
  const [initialImportSource, setInitialImportSource] = useState<{ role: ImportFileRole; file: File } | null>(null);
  const [isDirty, setIsDirty] = useState(initialWasDirty);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;
  const [unsavedChangesOpen, setUnsavedChangesOpen] = useState(false);
  const appContentRef = useRef<HTMLDivElement | null>(null);
  const explorerWidthRef = useRef(DEFAULT_EXPLORER_WIDTH);
  const rightPanelWidthRef = useRef(DEFAULT_RIGHT_PANEL_WIDTH);
  const userSettingsStoreRef = useRef<UserSettingsStore | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const userSettingsRef = useRef(userSettings);
  const [userSettingsReady, setUserSettingsReady] = useState(false);
  const appliedInterfaceScaleRef = useRef<number | null>(null);
  const interfaceScaleNoticeIdRef = useRef(0);
  const [interfaceScaleNotice, setInterfaceScaleNotice] = useState<InterfaceScaleNoticeValue | null>(null);
  const expireInterfaceScaleNotice = useCallback((id: number) => {
    setInterfaceScaleNotice((current) => current?.id === id ? null : current);
  }, []);
  const [statusMessage, setStatusMessage] = useState("");
  const statusMessageTimeoutRef = useRef<number | null>(null);
  const lassoSelectionAvailable = projectState.loadPointLockDraft === null
    && projectState.cptSelectionEditDraft === null;
  const activeLockedLoadPointIdSet = useMemo(() => new Set(getActiveLockedLoadPointIds(
    projectState.pilePlans,
    projectState.activePilePlanId,
  )), [projectState.activePilePlanId, projectState.pilePlans]);
  const groupAssignmentAssessmentInput = useMemo(() => (
    !hasCompletedLoadPointGroups
      ? null
      : {
          groups: loadPointGroups.groups,
          assignments: projectState.selectedPileConfigurationsByLoadPoint,
          lockedLoadPointIds: [...activeLockedLoadPointIdSet],
        }
  ), [
    activeLockedLoadPointIdSet,
    loadPointGroups.groups,
    hasCompletedLoadPointGroups,
    projectState.selectedPileConfigurationsByLoadPoint,
  ]);
  const groupAssignmentAssessment = useGroupAssignmentAssessment(
    groupAssignmentAssessmentInput,
  );

  useEffect(() => {
    invalidatePileAssignmentRequests();
  }, [invalidatePileAssignmentRequests, projectState.activePilePlanId]);

  useEffect(() => {
    setLassoSelectionActive((active) => transitionLassoSelectionMode(active, {
      type: "editing-context",
      available: lassoSelectionAvailable,
    }));
  }, [lassoSelectionAvailable]);

  useEffect(() => {
    const dismissLassoSelection = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setLassoSelectionActive((active) => transitionLassoSelectionMode(active, { type: "dismiss" }));
    };
    window.addEventListener("keydown", dismissLassoSelection);
    return () => window.removeEventListener("keydown", dismissLassoSelection);
  }, []);
  const showStatusMessage = useCallback((message: string) => {
    if (statusMessageTimeoutRef.current !== null) window.clearTimeout(statusMessageTimeoutRef.current);
    setStatusMessage(message);
    statusMessageTimeoutRef.current = window.setTimeout(() => {
      setStatusMessage("");
      statusMessageTimeoutRef.current = null;
    }, 3500);
  }, []);
  const [actionNotice, setActionNotice] = useState<ActionNoticeValue>({
    id: 0,
    message: "",
    tone: "neutral",
  });
  const actionNoticeIdRef = useRef(0);
  const actionNoticeTimeoutRef = useRef<number | null>(null);
  const showActionNotice = useCallback((message: string, tone: ActionNoticeTone = "neutral") => {
    if (actionNoticeTimeoutRef.current !== null) window.clearTimeout(actionNoticeTimeoutRef.current);
    actionNoticeIdRef.current += 1;
    setActionNotice({ id: actionNoticeIdRef.current, message, tone });
    actionNoticeTimeoutRef.current = window.setTimeout(() => {
      setActionNotice((current) => ({ ...current, message: "" }));
      actionNoticeTimeoutRef.current = null;
    }, 3500);
  }, []);
  const defaultSelectionRequestRef = useRef<typeof projectState.analysisRequest | null>(null);
  const defaultSelectionKeepsDirtyRef = useRef(false);
  const replacementResolverRef = useRef<((proceed: boolean) => void) | null>(null);
  const initialProjectSignature = projectStateSignature(projectState);
  const [savedProjectSignature, setSavedProjectSignature] = useState(
    initialWasDirty
      ? (initialSavedProjectSignature ?? "")
      : initialProjectSignature,
  );
  const savedProjectSignatureRef = useRef(savedProjectSignature);
  const recoveredDirtySignatureRef = useRef(initialWasDirty ? initialProjectSignature : null);
  const updateSavedProjectSignature = useCallback((signature: string) => {
    recoveredDirtySignatureRef.current = null;
    savedProjectSignatureRef.current = signature;
    setSavedProjectSignature(signature);
  }, []);
  const preparedProjectRef = useRef<{ signature: string; blob: Blob } | null>(null);
  const projectActionRef = useRef<(() => Promise<boolean>) | null>(null);
  const openProjectActionRef = useRef<(() => Promise<void>) | null>(null);
  const openDesktopProjectPathRef = useRef<((path: string) => Promise<void>) | null>(null);
  const saveShortcutInFlightRef = useRef(false);
  const isDesktop = isDesktopRuntime();
  const { workspaceLayout } = userSettings.preferences;
  const interfaceScalePercent = userSettings.preferences.interfaceScalePercent;
  userSettingsRef.current = userSettings;

  const commitUserSettings = useCallback((next: UserSettings) => {
    setUserSettings(next);
    if (userSettingsStoreRef.current) {
      void saveUserSettings(userSettingsStoreRef.current, next);
    }
  }, []);

  const applyInterfaceScale = useCallback((scale: number) => {
    const normalizedScale = normalizeInterfaceScale(scale);
    const next = patchUserSettings(userSettingsRef.current, {
      interfaceScalePercent: normalizedScale,
    });
    userSettingsRef.current = next;
    commitUserSettings(next);
    interfaceScaleNoticeIdRef.current += 1;
    setInterfaceScaleNotice({
      id: interfaceScaleNoticeIdRef.current,
      percent: normalizedScale,
    });
  }, [commitUserSettings]);

  const updateWorkspaceLayout = useCallback((patch: Partial<WorkspaceLayoutSettings>) => {
    setUserSettings((current) => {
      const next = patchWorkspaceLayout(current, patch);
      if (userSettingsStoreRef.current) {
        void saveUserSettings(userSettingsStoreRef.current, next);
      }
      return next;
    });
  }, []);
  const projectFileCommands = getProjectFileCommands(isDesktop);
  const canUndo = managedProject.history.past.length > 0;
  const canRedo = managedProject.history.future.length > 0;
  const undoEntry = managedProject.history.past[managedProject.history.past.length - 1];
  const redoEntry = managedProject.history.future[managedProject.history.future.length - 1];
  const historyTranslate = useCallback((key: string, options?: Record<string, unknown>) => (
    t(key, options)
  ), [t]);
  const undoLabel = undoEntry
    ? t("history.undoLabel", { action: describeHistoryAction(historyTranslate, undoEntry.action) })
    : `${t("undo")} (Ctrl+Z)`;
  const redoLabel = redoEntry
    ? t("history.redoLabel", { action: describeHistoryAction(historyTranslate, redoEntry.action) })
    : `${t("redo")} (Ctrl+Y)`;
  const availablePileConfigurations = useMemo(
    () => getAvailablePileConfigurationCatalog(projectState.pileOptionsByLoadPointId),
    [projectState.pileOptionsByLoadPointId],
  );
  const persistedProjectDraft = projectDraftFromState(projectState);
  const persistedProjectSignature = JSON.stringify(persistedProjectDraft);
  useEffect(() => {
    if (recoveredDirtySignatureRef.current === persistedProjectSignature) {
      setIsDirty(true);
      return;
    }
    recoveredDirtySignatureRef.current = null;
    setIsDirty(persistedProjectSignature !== savedProjectSignature);
  }, [persistedProjectSignature, savedProjectSignature]);

  const recoveryWriter = useMemo(() => recoveryStore ? createBrowserRecoveryWriter({
    store: recoveryStore,
    onError: () => showStatusMessage(t("recovery.unavailable")),
  }) : null, [recoveryStore, showStatusMessage, t]);

  useEffect(() => {
    if (initialStatusKey) showStatusMessage(t(initialStatusKey));
    return () => {
      if (statusMessageTimeoutRef.current !== null) window.clearTimeout(statusMessageTimeoutRef.current);
      if (actionNoticeTimeoutRef.current !== null) window.clearTimeout(actionNoticeTimeoutRef.current);
    };
  }, [initialStatusKey, showStatusMessage, t]);

  useEffect(() => {
    if (!recoveryWriter) return;
    recoveryWriter.markReady();
    return () => {
      void recoveryWriter.flush().finally(() => recoveryWriter.dispose());
    };
  }, [recoveryWriter]);

  useEffect(() => {
    if (!recoveryWriter) return;
    const flushRecovery = () => { void recoveryWriter.flush(); };
    const flushHiddenRecovery = () => {
      if (document.visibilityState === "hidden") flushRecovery();
    };
    window.addEventListener("pagehide", flushRecovery);
    document.addEventListener("visibilitychange", flushHiddenRecovery);
    return () => {
      window.removeEventListener("pagehide", flushRecovery);
      document.removeEventListener("visibilitychange", flushHiddenRecovery);
    };
  }, [recoveryWriter]);

  useEffect(() => {
    if (!recoveryWriter || projectState.defaultPileSelectionPending) return;
    recoveryWriter.schedule(async () => createBrowserRecoveryRecord({
      appVersion: __APP_VERSION__,
      ifcppText: await writeProjectDocumentCore(persistedProjectDraft),
      projectName: persistedProjectDraft.metadata.name,
      savedProjectSignature,
      isDirty,
      updatedAt: new Date().toISOString(),
    }));
  }, [isDirty, persistedProjectSignature, projectState.defaultPileSelectionPending, recoveryWriter, savedProjectSignature]);

  useEffect(() => {
    const result = managedProject.lastResult;
    if (!result) return;
    showActionNotice(describeHistoryResult(historyTranslate, result), "neutral");
  }, [historyTranslate, managedProject.lastResult, showActionNotice]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      dispatchHistoryShortcut(event, type => dispatchProject({ type }));
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, []);


  const serializeProject = async () => {
    return writeProjectDocumentCore(projectDraftFromState(projectState));
  };

  const downloadProject = async (): Promise<boolean> => {
    const options = {
      fileName: projectFileName(projectState.name),
      mimeType: "application/json",
      extensions: [".ifcpp"],
    };
    const prepared = preparedProjectRef.current;
    const saved = prepared?.signature === persistedProjectSignature
      ? await savePreparedFile(options, prepared.blob)
      : await saveGeneratedFile(options, async () => new Blob([await serializeProject()], { type: "application/json" }));
    if (!saved) return false;
    updateSavedProjectSignature(projectStateSignature(projectState));
    setIsDirty(false);
    return true;
  };

  const saveProjectAs = async (): Promise<boolean> => {
    if (!isDesktop) return downloadProject();
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: projectPath ?? projectFileName(projectState.name),
      filters: [{ name: "IFCPP project", extensions: ["ifcpp"] }],
    });
    if (!path) return false;
    await invokeDesktop("write_project_file", { path, contents: await serializeProject() });
    setProjectPath(path);
    updateSavedProjectSignature(projectStateSignature(projectState));
    setIsDirty(false);
    return true;
  };

  const saveProject = async (): Promise<boolean> => {
    if (!isDesktop) return downloadProject();
    if (!projectPath) return saveProjectAs();
    await invokeDesktop("write_project_file", { path: projectPath, contents: await serializeProject() });
    updateSavedProjectSignature(projectStateSignature(projectState));
    setIsDirty(false);
    return true;
  };

  projectActionRef.current = isDesktop ? saveProject : downloadProject;

  useEffect(() => {
    const handleAppShortcut = createAppShortcutHandler({
      isDesktop, saveInFlight: saveShortcutInFlightRef,
      save: () => projectActionRef.current, open: () => openProjectActionRef.current,
      currentScale: () => userSettingsRef.current.preferences.interfaceScalePercent,
      applyScale: applyInterfaceScale,
    });
    window.addEventListener("keydown", handleAppShortcut);
    return () => window.removeEventListener("keydown", handleAppShortcut);
  }, [isDesktop]);

  const activePilePlanName = projectState.pilePlans.find(
    (pilePlan) => pilePlan.id === projectState.activePilePlanId,
  )?.name ?? projectState.name;

  const exportPilePlan = async (format: "xlsx" | "csv"): Promise<void> => {
    const input = buildPilePlanExportInputForPlan(projectState, projectState.activePilePlanId);
    const bytes = format === "xlsx"
      ? await exportPilePlanXlsxCore(input)
      : await exportPilePlanCsvCore(input);
    await saveBinaryExport(
      {
        fileName: pilePlanExportFileName(activePilePlanName, format),
        mimeType: format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv",
        extensions: [`.${format}`],
      },
      bytes,
    );
  };

  const confirmProjectReplacement = useCallback((): Promise<boolean> => {
    if (!isDirtyRef.current) return Promise.resolve(true);
    setUnsavedChangesOpen(true);
    return new Promise((resolve) => {
      replacementResolverRef.current = resolve;
    });
  }, []);

  const resolveProjectReplacement = (proceed: boolean) => {
    setUnsavedChangesOpen(false);
    const resolve = replacementResolverRef.current;
    replacementResolverRef.current = null;
    resolve?.(proceed);
  };

  const handleProjectStateChange = (nextState: typeof projectState) => {
    commitProjectState(nextState);
  };

  const applyValidatedProjectEdit = async (
    prepare: (state: ProjectState) => Promise<PreparedProjectDocumentEdit>,
    reportFailure = true,
  ): Promise<boolean> => {
    const captured = projectStateRef.current;
    const signature = projectStateSignature(captured);
    try {
      const prepared = await prepare(captured);
      if (projectStateSignature(projectStateRef.current) !== signature) {
        showActionNotice(t("projectEdit.projectChanged"), "error");
        return false;
      }
      if (prepared.changed) commitProjectState((current) => (
        projectStateSignature(current) === signature ? prepared.update(current) : current
      ));
      return true;
    } catch (error) {
      if (!reportFailure) throw error;
      showActionNotice(t("projectEdit.failed"), "error");
      return false;
    }
  };

  const applyLegendEditor = (draft: LegendEditorDraft, enableTipLevelRegions: boolean) =>
    applyValidatedProjectEdit((state) => prepareLegendEditorEdit(state, draft, enableTipLevelRegions));

  const applyCostCatalogEdit = (actions: CostCatalogAction[]) =>
    applyValidatedProjectEdit((state) => preparePileCostCatalogEdit(state, actions), false);

  const loadCostCatalogDefault = (catalog: PileCostSettings) =>
    applyValidatedProjectEdit((state) => preparePileCostCatalogDefaultEdit(state, catalog));

  const handleSourceLoadPointSelection = (intent: SourceLoadPointSelection) => {
    if (projectState.loadPointLockDraft !== null || projectState.cptSelectionEditDraft !== null) return;
    const loadPointIds = intent.loadPointIds.filter((id) => !activeLockedLoadPointIdSet.has(id));
    if (loadPointIds.length === 0) return;
    const selection = intent.mode === "toggle"
      ? toggleReactViewerLoadPoint(projectState, loadPointIds[0], loadPointGroups.groups)
      : intent.mode === "add"
        ? addReactViewerLoadPoints(projectState, loadPointIds, loadPointGroups.groups)
        : setReactViewerLoadPoints(projectState, loadPointIds, loadPointGroups.groups);
    handleProjectStateChange({ ...projectState, ...selection });
  };

  const handleSourceCptSelection = (cptId: number) => {
    if (projectState.loadPointLockDraft !== null || projectState.cptSelectionEditDraft !== null) return;
    handleProjectStateChange({ ...projectState, ...openReactViewerCpt(projectState, cptId) });
  };

  const clearSourceSelection = () => {
    if (projectState.loadPointLockDraft !== null || projectState.cptSelectionEditDraft !== null) return;
    handleProjectStateChange({ ...projectState, ...clearReactViewerSelection(projectState) });
  };

  const importPilePlan = (patch: PilePlanImportPatch, fileName: string) => {
    commitProjectState((current) => applyPilePlanImportAsNewPlan(
      current,
      patch,
      pilePlanNameFromFileName(fileName),
    ));
  };

  const pilePlanLanguage = (): PilePlanLanguage => i18n.language.startsWith("nl") ? "nl" : "en";

  const activatePilePlan = (pilePlanId: string) => {
    setActiveSourceKind(null);
    invalidatePileAssignmentRequests();
    setProjectState((current) => activatePilePlanState(current, pilePlanId));
  };

  const startLockEditing = () => {
    setRightTaskPanel(null);
    setProjectState(beginLoadPointLockEditing);
  };
  const cancelLockEditing = () => setProjectState(cancelLoadPointLockEditing);
  const unlockAllInDraft = () => setProjectState(clearLoadPointLockDraft);
  const applyLockEditing = () => commitProjectState(finishLoadPointLockEditing);

  const renameProjectPilePlan = (pilePlanId: string, name: string) => {
    commitProjectState((current) => {
      const synchronized = synchronizeActivePilePlan(
        current.pilePlans,
        current.activePilePlanId,
        current.selectedPileConfigurationsByLoadPoint,
      );
      const pilePlans = renamePilePlan(synchronized, pilePlanId, name);
      if (pilePlans === synchronized || pilePlans.every((plan, index) => plan.name === synchronized[index]?.name)) {
        return current;
      }
      return { ...current, pilePlans };
    });
  };

  const duplicateProjectPilePlan = (pilePlanId: string) => {
    commitProjectState((current) => {
      return {
        ...current,
        ...duplicatePilePlan({
          ...current,
          sourcePilePlanId: pilePlanId,
          language: pilePlanLanguage(),
        }),
      };
    });
  };

  const deleteProjectPilePlan = (pilePlanId: string) => {
    commitProjectState((current) => {
      if (current.pilePlans.length <= 1) return current;
      return { ...current, ...deletePilePlan({ ...current, pilePlanId }) };
    });
  };

  const { pending: creatingPilePlan, create: createFreshPilePlan } = useNewPilePlan({
    snapshot: () => ({ state: projectStateRef.current, groups: loadPointGroupsRef.current,
      options: technicalPileOptionsByLoadPointId,
      ready: hasCompletedLoadPointGroups && technicalAssignment.status === "ready" }),
    language: pilePlanLanguage,
    commit: (update) => commitProjectState(update),
    failed: (error) => console.error("Failed to create pile plan", error),
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const store = await createPlatformUserSettingsStore({
          isTauri: isDesktop,
          indexedDb: window.indexedDB,
        });
        const settings = await loadUserSettings(
          store,
          (key, fallback) => getSetting(key, fallback),
        );
        if (cancelled) return;
        applyTheme(settings.preferences.theme);
        await changeLanguage(settings.preferences.language);
        if (isDesktop) {
          await applyDesktopInterfaceScale(settings.preferences.interfaceScalePercent);
          appliedInterfaceScaleRef.current = settings.preferences.interfaceScalePercent;
        }
        if (cancelled) return;
        userSettingsStoreRef.current = store;
        explorerWidthRef.current = settings.preferences.workspaceLayout.explorerWidth;
        rightPanelWidthRef.current = settings.preferences.workspaceLayout.propertiesWidth;
        setUserSettings(settings);
        await saveUserSettings(store, settings);
      } catch (error) {
        console.error("Failed to initialize user settings", error);
      } finally {
        if (!cancelled) setUserSettingsReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [applyInterfaceScale, isDesktop]);

  useEffect(() => {
    if (!isDesktop) return;
    if (appliedInterfaceScaleRef.current === interfaceScalePercent) return;
    appliedInterfaceScaleRef.current = interfaceScalePercent;
    void applyDesktopInterfaceScale(interfaceScalePercent);
  }, [interfaceScalePercent, isDesktop]);

  useEffect(() => {
    let cancelled = false;
    writeProjectDocumentCore(persistedProjectDraft).then((text) => {
      if (!cancelled) {
        preparedProjectRef.current = {
          signature: persistedProjectSignature,
          blob: new Blob([text], { type: "application/json" }),
        };
      }
    });
    return () => { cancelled = true; };
  }, [persistedProjectSignature]);

  useCptSelectionPreview(projectState, setProjectState);

  useEffect(() => {
    const analysisRequest = projectState.analysisRequest;
    const requestedIds = analysisRequest.loadPointIds;
    const analysisLoadPoints = requestedIds === null
      ? projectState.loadPoints
      : projectState.loadPoints.filter((loadPoint) => requestedIds.includes(loadPoint.id));

    void analysisPipeline.run({
      bearingCapacities: projectState.bearingCapacities,
      cpts: projectState.cpts,
      globalSettings: projectState.globalCptSelectionSettings,
      loadPoints: analysisLoadPoints,
      manualCptIdsByLoadPoint: projectState.manualCptIdsByLoadPoint,
      settingsByLoadPoint: projectState.cptSelectionSettingsByLoadPoint,
      includeCptFrdRows: projectState.cptFrdRowsByCptId.size === 0,
    }).then((outcome) => {
      if (outcome.status === "applied") {
        const analysis = outcome.result;
        setProjectState((current) => current.analysisRequest !== analysisRequest ? current : ({
          ...current,
          pileOptionsByLoadPointId: new Map([
            ...current.pileOptionsByLoadPointId,
            ...analysis.pileOptionsByLoadPointId,
          ]),
          selectedCptsByLoadPointId: new Map([
            ...current.selectedCptsByLoadPointId,
            ...analysis.selectedCptsByLoadPointId,
          ]),
          cptFrdRowsByCptId: analysis.cptFrdRowsByCptId ?? current.cptFrdRowsByCptId,
          analysisError: null,
        }));
        return;
      }
      if (outcome.status === "failed") {
        console.error("Failed to load pile option analysis", outcome.error);
        setProjectState((current) => current.analysisRequest !== analysisRequest ? current : ({
          ...current,
          analysisError: outcome.error instanceof Error
            ? outcome.error.message
            : String(outcome.error),
        }));
      }
    });

    return () => {
      analysisPipeline.invalidate();
    };
  }, [analysisPipeline, projectState.analysisRequest]);

  useEffect(() => {
    if (
      !projectState.defaultPileSelectionPending
      || projectState.pileOptionsByLoadPointId.size !== projectState.loadPoints.length
      || !hasCompletedLoadPointGroups
    ) {
      return;
    }
    const analysisRequest = projectState.analysisRequest;
    if (defaultSelectionRequestRef.current === analysisRequest) {
      return;
    }
    defaultSelectionRequestRef.current = analysisRequest;

    chooseDefaultPileOptionsCore({
      groups: loadPointGroups.groups,
      optionsByLoadPointId: projectState.pileOptionsByLoadPointId,
      pileHeadLevelM: projectState.pileHeadLevelM ?? 0,
      costSettings: projectState.pileCostSettings,
    }).then((choices) => {
      const applyChoices = (current: ProjectState) => {
        if (current.analysisRequest !== analysisRequest) return current;
        const next = {
          ...current,
          selectedPileConfigurationsByLoadPoint: mergeDefaultPileChoices(
            current.selectedPileConfigurationsByLoadPoint,
            choices,
          ),
          defaultPileSelectionPending: false,
          analysisError: null,
        };
        if (savedProjectSignatureRef.current !== "" && !defaultSelectionKeepsDirtyRef.current) {
          updateSavedProjectSignature(projectStateSignature(next));
          setIsDirty(false);
        }
        return next;
      };
      if (defaultSelectionKeepsDirtyRef.current) {
        amendProjectState(applyChoices);
      } else {
        setProjectState(applyChoices);
      }
    }).catch((error: unknown) => {
      console.error("Failed to choose default pile options", error);
      setProjectState((current) => current.analysisRequest !== analysisRequest ? current : ({
        ...current,
        defaultPileSelectionPending: false,
        analysisError: error instanceof Error ? error.message : String(error),
      }));
    }).finally(() => {
      defaultSelectionKeepsDirtyRef.current = false;
      if (defaultSelectionRequestRef.current === analysisRequest) {
        defaultSelectionRequestRef.current = null;
      }
    });
  }, [
    projectState.analysisRequest,
    projectState.defaultPileSelectionPending,
    projectState.loadPoints.length,
    hasCompletedLoadPointGroups,
    loadPointGroups.groups,
    projectState.pileCostSettings,
    projectState.pileOptionsByLoadPointId,
  ]);

  usePileOptionCosts(projectState, setProjectState);

  const ilp = useIlpOptimization(projectState, loadPointGroups.groups,
    hasCompletedLoadPointGroups && projectState.analysisError === null
      && !projectState.defaultPileSelectionPending && projectState.cptSelectionEditDraft === null
      && projectState.loadPointLockDraft === null && projectState.loadPoints.length > 0
      && projectState.pileOptionsByLoadPointId.size === projectState.loadPoints.length,
    commitProjectState, pilePlanLanguage(),userSettings.preferences.optimizationTimeLimitSeconds);
  const mcpOptimizationRef=useRef(ilp);
  mcpOptimizationRef.current=ilp;
  const { groups: mcpGroups, technicalAssignment: mcpTechnical, groupAssignmentAssessment: mcpConflicts } =
    useMcpDerivedState(projectState, loadPointGroups, technicalAssignment, groupAssignmentAssessment,
      technicalAssignmentInput, groupAssignmentAssessmentInput);
  const mcpDerivedRef = useRef({
    analysisReady: mcpAnalysisReady,
    groups: mcpGroups,
    technicalAssignment: mcpTechnical,
    groupAssignmentAssessment: mcpConflicts,
    currentOptimization: { run: ilp.currentRun, runState: ilp.runState, valid: ilp.currentRunValid,
      runId:ilp.currentRunId,timeLimitSeconds:ilp.currentRunTimeLimitSeconds,
      targetLoadPointIds:ilp.currentRunTargetLoadPointIds },
  });
  mcpDerivedRef.current = {
    analysisReady: mcpAnalysisReady,
    groups: mcpGroups,
    technicalAssignment: mcpTechnical,
    groupAssignmentAssessment: mcpConflicts,
    currentOptimization: { run: ilp.currentRun, runState: ilp.runState, valid: ilp.currentRunValid,
      runId:ilp.currentRunId,timeLimitSeconds:ilp.currentRunTimeLimitSeconds,
      targetLoadPointIds:ilp.currentRunTargetLoadPointIds },
  };
  const createMcpSession = (isActive: () => boolean) => {
    const importSession = createSourceImportSession(createSourceImportOperations({
      requirements: () => invokeDesktop<Record<string, unknown>>("get_standard_csv_requirements", {}),
      currentState: () => projectStateRef.current,
      currentMarker: () => mcpProjectMarkerRef.current!.observe(projectStateRef.current),
      canEdit: () => isActive() && mcpWriteEnabledRef.current,
      isDirty: () => isDirtyRef.current,
      defaultPlanName: () => pilePlanLanguage() === "nl" ? "Basisplan" : "Base plan",
      personalCostDefault: () => userSettingsRef.current.defaults.pileCostCatalog,
      builtInCostDefault: BUILT_IN_PILE_COST_DEFAULTS,
      installRefresh: (state) => {
        defaultSelectionKeepsDirtyRef.current = true;
        flushSync(() => commitProjectState(state));
        isDirtyRef.current = true;
        setIsDirty(true);
      },
      installNewProject: (state) => {
        defaultSelectionKeepsDirtyRef.current = false;
        flushSync(() => replaceProjectState(state));
        setProjectPath(null);
        updateSavedProjectSignature("");
        isDirtyRef.current = true;
        setIsDirty(true);
      },
    }));
    const fileSession = createMcpFileOperationSession(createMcpProjectFileOperations({
      currentState: () => projectStateRef.current,
      currentMarker: () => mcpProjectMarkerRef.current!.observe(projectStateRef.current),
      currentPath: () => projectPathRef.current,
      canEdit: () => isActive() && mcpWriteEnabledRef.current,
      confirmReplacement: confirmProjectReplacement,
      installOpened: (state, path) => {
        flushSync(() => installOpenedProject(state, path));
        projectPathRef.current = path;
      },
      didSave: (path) => {
        projectPathRef.current = path;
        setProjectPath(path);
        updateSavedProjectSignature(projectStateSignature(projectStateRef.current));
        isDirtyRef.current = false;
        setIsDirty(false);
      },
    }));
    const pilePlanImportSession = createPilePlanImportSession(createPilePlanImportOperations({
      requirements: () => invokeDesktop<Record<string, unknown>>("get_pile_plan_import_requirements", {}),
      currentState: () => projectStateRef.current,
      currentMarker: () => mcpProjectMarkerRef.current!.observe(projectStateRef.current),
      canEdit: () => isActive() && mcpWriteEnabledRef.current,
      currentGroups: () => requireCurrentGroups(mcpDerivedRef.current.groups),
      commit: (update) => { flushSync(() => commitProjectState(update)); },
    }));
    const dispatch = createSessionMcpDispatcher({
      snapshot: (): McpSnapshot => {
        const state = projectStateRef.current;
        const marker = mcpProjectMarkerRef.current!.observe(state);
        return {
          state, marker,
          defaultOptimizationTimeLimitSeconds:userSettingsRef.current.preferences.optimizationTimeLimitSeconds,
          ...mcpDerivedRef.current,
          calculateCost: calculatePileCostCore,
          assessGroupAssignments: assessLoadPointGroupAssignmentsCore,
          isCurrent: () => {
            const current = mcpProjectMarkerRef.current!.observe(projectStateRef.current);
            return current.project_instance_id === marker.project_instance_id
              && current.project_revision === marker.project_revision;
          },
        };
      },
      currentState: () => projectStateRef.current,
      currentMarker: () => mcpProjectMarkerRef.current!.observe(projectStateRef.current),
      canWrite: () => mcpWriteEnabledRef.current,
      isActive,
      language: () => i18n.language.startsWith("nl") ? "nl" : "en",
      defaultTimeLimit: () => userSettingsRef.current.preferences.optimizationTimeLimitSeconds,
      optimization: () => mcpOptimizationRef.current,
      sourceImport: importSession, pilePlanImport: pilePlanImportSession, files: fileSession,
      install: (update, mode, name) => {
        if (mode === "navigation") {
          setActiveSourceKind(null);
          invalidatePileAssignmentRequests();
          flushSync(() => setProjectState(update));
        } else {
          const historyAction = name === "pile_group_load_points"
            ? getLoadPointGroupEditHistoryAction("group")
            : name === "pile_ungroup_load_points" ? getLoadPointGroupEditHistoryAction("ungroup") : undefined;
          flushSync(() => commitProjectState(update, historyAction));
        }
      },
    });
    return {
      dispatch,
      dispose: () => {
        importSession.dispose();
        fileSession.invalidate();
        pilePlanImportSession.dispose();
      },
    };
  };
  const { status: mcpStatus, connection: mcpConnection, error: mcpError, setEnabled: setMcpEnabled } =
    useMcpConnection(isDesktop, createMcpSession, () => {
      mcpWriteEnabledRef.current = false;
      setMcpWriteEnabled(false);
    });
  const pilePlanCostSummaries = useMemo(() => summarizePilePlanCosts(
    synchronizeActivePilePlan(
      ilp.displayState.pilePlans,
      ilp.displayState.activePilePlanId,
      ilp.displayState.selectedPileConfigurationsByLoadPoint,
    ),
    ilp.displayState.pileCostByOptionKey,
  ), [
    ilp.displayState.activePilePlanId,
    ilp.displayState.pilePlans,
    ilp.displayState.selectedPileConfigurationsByLoadPoint,
    ilp.displayState.pileCostByOptionKey,
  ]);
  const handleDisplayedStateChange = (next: ProjectState) => {
    const actual = ilp.previewPlanId
      ? applyIlpPreviewInteraction(projectState, ilp.displayState, next) : next;
    if (actual) handleProjectStateChange(actual);
  };

  const installOpenedProject = (project: ProjectState, path: string | null) => {
    const lifecycle = openedProjectLifecycleState(project, path);
    setLassoSelectionActive((active) => transitionLassoSelectionMode(active, { type: "dismiss" }));
    replaceProjectState(project);
    setProjectPath(lifecycle.projectPath);
    updateSavedProjectSignature(lifecycle.savedSignature);
    setIsDirty(lifecycle.isDirty);
    if (project.legendImportWarnings.length > 0) {
      showStatusMessage(t("legend.importWarnings", { count: project.legendImportWarnings.length }));
    }
  };

  const openSampleProject = async () => {
    if (!await confirmProjectReplacement()) return;
    const sample = requireValidProjectDocument(
      await readProjectDocumentCore(sampleProjectText),
    );
    installOpenedProject(createInitialProjectState(sample.project, {
      initializeDefaultPiles: true,
      defaultPilePlanName: pilePlanLanguage() === "nl" ? "Basisplan" : "Base plan",
    }, sample.keys), null);
    showStatusMessage(t("recovery.sampleOpened"));
  };

  const openDesktopProjectPath = async (path: string) => {
    if (!await confirmProjectReplacement()) return;
    try {
      const text = await invokeDesktop<string>("read_project_file", { path });
      const project = await prepareOpenedProject(
        text,
        { initializeDefaultPiles: false },
        {
          readProjectDocument: readProjectDocumentCore,
        },
      );
      installOpenedProject(project, path);
    } catch (error) {
      showActionNotice(describeProjectOpenError(error, t), "error");
    }
  };
  openDesktopProjectPathRef.current = openDesktopProjectPath;

  const chooseDesktopProject = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, filters: [{ name: "IFCPP project", extensions: ["ifcpp"] }] });
    if (typeof path === "string") await openDesktopProjectPath(path);
  };

  openProjectActionRef.current = chooseDesktopProject;

  useEffect(() => {
    if (!isDesktop || !userSettingsReady) return;
    let disposed = false;
    let stopListening: (() => void) | null = null;
    let pendingDrain = Promise.resolve();

    const reportOpenFailure = (error: unknown) => {
      if (!disposed) showActionNotice(describeProjectOpenError(error, t), "error");
    };
    const drainPendingProjectPaths = () => {
      pendingDrain = pendingDrain.then(async () => {
        const paths = await invokeDesktop<string[]>("take_pending_project_paths", {});
        for (const path of paths) {
          if (disposed) return;
          await openDesktopProjectPathRef.current?.(path);
        }
      }).catch(reportOpenFailure);
      return pendingDrain;
    };

    void listenDesktop("project-open-requested", () => {
      void drainPendingProjectPaths();
    })
      .then(async (unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        stopListening = unlisten;
        await drainPendingProjectPaths();
      })
      .catch(reportOpenFailure);

    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [isDesktop, showActionNotice, t, userSettingsReady]);

  if (!userSettingsReady) {
    return <div className="app-startup-surface" role="status" />;
  }

  return (
    <>
      <div className="app-shell"
        data-testid="openaec-shell"
        onPointerUpCapture={releasePointerActivatedControlFocus}
      >
        <TitleBar
          projectAction={() => void (isDesktop ? saveProject() : downloadProject())}
          projectActionKind={isDesktop ? "save" : "download"}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          onUndo={() => dispatchProject({ type: "undo" })}
          onRedo={() => dispatchProject({ type: "redo" })}
          onSettingsClick={() => setSettingsOpen(true)}
          onFeedbackClick={() => setFeedbackOpen(true)}
          interfaceScaleControl={isDesktop ? (
            <InterfaceScaleNotice
              notice={interfaceScaleNotice}
              onExpire={expireInterfaceScaleNotice}
              onDecrease={() => applyInterfaceScale(stepInterfaceScale(
                userSettingsRef.current.preferences.interfaceScalePercent,
                -1,
              ))}
              onIncrease={() => applyInterfaceScale(stepInterfaceScale(
                userSettingsRef.current.preferences.interfaceScalePercent,
                1,
              ))}
              onReset={() => applyInterfaceScale(DEFAULT_INTERFACE_SCALE)}
            />
          ) : undefined}
        />
        <Ribbon
          onFileTabClick={() => setBackstageOpen(true)}
          onOpenProjectInformation={() => setProjectInformationOpen(true)}
          onOpenRightPanel={(mode) => {
            updateWorkspaceLayout({ propertiesVisible: true });
            setRightTaskPanel(null);
            setProjectState((current) => ({ ...current, ...switchRightPanelMode(current, mode) }));
          }}
          onOpenTaskPanel={(panel) => {
            updateWorkspaceLayout({ propertiesVisible: true });
            setRightTaskPanel(panel);
          }}
          isLassoSelectionActive={lassoSelectionActive}
          lassoSelectionDisabled={!lassoSelectionAvailable}
          onToggleLassoSelection={() => setLassoSelectionActive((active) => (
            transitionLassoSelectionMode(active, { type: "toggle" })
          ))}
          isLockEditing={projectState.loadPointLockDraft !== null}
          onStartLockEditing={startLockEditing}
          onApplyLockEditing={applyLockEditing}
          onCancelLockEditing={cancelLockEditing}
          onUnlockAll={unlockAllInDraft}
          symbolScalePercent={projectState.symbolScalePercent}
          viewerUtilizationMinimum={projectState.viewerUtilizationSettings.minimum}
          viewerUtilizationMaximum={projectState.viewerUtilizationSettings.maximum}
          foregroundLayer={projectState.foregroundLayer}
          showGrid={projectState.showGrid}
          showTipLevelRegions={projectState.showTipLevelRegions}
          showLoadPointGroups={projectState.showLoadPointGroups}
          explorerVisible={workspaceLayout.explorerVisible}
          propertiesVisible={workspaceLayout.propertiesVisible}
          onSymbolScaleChangeStart={symbolScaleHistory.begin}
          onSymbolScaleChange={symbolScaleHistory.change}
          onSymbolScaleChangeEnd={symbolScaleHistory.end}
          onViewerUtilizationRangeChange={(minimum, maximum) => handleProjectStateChange({
            ...projectState,
            viewerUtilizationSettings: { minimum, maximum },
          })}
          onForegroundLayerChange={(foregroundLayer) => handleProjectStateChange({
            ...projectState,
            foregroundLayer,
          })}
          onGridVisibilityChange={(showGrid) => handleProjectStateChange({
            ...projectState,
            showGrid,
          })}
          onTipLevelRegionVisibilityChange={(showTipLevelRegions) => handleProjectStateChange({
            ...projectState,
            showTipLevelRegions,
          })}
          onLoadPointGroupVisibilityChange={(showLoadPointGroups) => handleProjectStateChange({
            ...projectState,
            showLoadPointGroups,
          })}
          onExplorerVisibilityChange={(explorerVisible) => updateWorkspaceLayout({ explorerVisible })}
          onPropertiesVisibilityChange={(propertiesVisible) => updateWorkspaceLayout({ propertiesVisible })}
        />
        <div
          className="app-content"
          ref={appContentRef}
          style={{
            "--explorer-width": `${workspaceLayout.explorerVisible ? workspaceLayout.explorerWidth : 0}px`,
            "--explorer-splitter-width": workspaceLayout.explorerVisible ? "5px" : "0px",
            "--right-panel-width": `${workspaceLayout.propertiesVisible ? workspaceLayout.propertiesWidth : 0}px`,
            "--right-panel-splitter-width": workspaceLayout.propertiesVisible ? "5px" : "0px",
          } as CSSProperties}
        >
          {workspaceLayout.explorerVisible && <PilePlanExplorer
            activePilePlanId={ilp.displayState.activePilePlanId}
            activeSourceKind={activeSourceKind}
            costSummaries={pilePlanCostSummaries}
            currencyCode={projectState.currencyCode}
            optimizingPlanId={ilp.previewPlanId}
            managementDisabled={ilp.running}
            createDisabled={ilp.running ||
              projectState.pileOptionsByLoadPointId.size !== projectState.loadPoints.length
              || projectState.analysisError !== null
            }
            creating={creatingPilePlan}
            isDirty={isDirty}
            inputSources={projectState.inputSources}
            inputSourcesExpanded={workspaceLayout.inputSourcesExpanded}
            pilePlans={ilp.displayState.pilePlans}
            pilePlansExpanded={workspaceLayout.pilePlansExpanded}
            projectName={projectState.name}
            onActivate={id => { if (ilp.viewPlan(id)) setActiveSourceKind(null); else activatePilePlan(id); }}
            onCreate={() => void createFreshPilePlan()}
            onDelete={deleteProjectPilePlan}
            onDuplicate={duplicateProjectPilePlan}
            onExpansionChange={(group, expanded) => updateWorkspaceLayout(
              group === "inputSources"
                ? { inputSourcesExpanded: expanded }
                : { pilePlansExpanded: expanded },
            )}
            onRename={renameProjectPilePlan}
            onSourceActivate={setActiveSourceKind}
          />}
          {workspaceLayout.explorerVisible && <div
            aria-label={t("explorer")}
            className="explorer-splitter"
            role="separator"
            onPointerDown={beginExplorerResize}
          />}
          <main className="workspace" aria-label="Pile plan workspace">
            {activeSourceKind === null ? (
              <PilePlanWorkspace
                state={ilp.displayState}
                readOnly={ilp.running}
                loadPointGroups={loadPointGroups.groups}
                loadPointGroupTopology={loadPointGroups.topology}
                groupAssignmentAssessment={groupAssignmentAssessment}
                technicalAssignment={technicalAssignment}
                lassoSelectionActive={lassoSelectionActive}
                onStateChange={handleDisplayedStateChange}
                onLegendApply={applyLegendEditor}
              />
            ) : (
              <SourceDataViewer
                onClose={() => setActiveSourceKind(null)}
                source={projectState.inputSources.find(({ kind }) => kind === activeSourceKind)!}
                loadPoints={projectState.loadPoints}
                cpts={projectState.cpts}
                bearingCapacities={projectState.bearingCapacities}
                selectedLoadPointId={projectState.selectedLoadPointId}
                selectedLoadPointIds={projectState.selectedLoadPointIds}
                selectedCptId={projectState.selectedCptId}
                lockedLoadPointIds={activeLockedLoadPointIdSet}
                selectionDisabled={projectState.loadPointLockDraft !== null || projectState.cptSelectionEditDraft !== null}
                onSelectLoadPoints={handleSourceLoadPointSelection}
                onSelectCpt={handleSourceCptSelection}
                onClearSelection={clearSourceSelection}
                onReplaceSource={(file) => {
                  setInitialImportSource({ role: importRoleForSource(activeSourceKind), file });
                  setBackstageOpen(true);
                }}
              />
            )}
            <ActionNotice
              message={actionNotice.message}
              noticeId={actionNotice.id}
              tone={actionNotice.tone}
            />
          </main>
          {workspaceLayout.propertiesVisible && <div
            aria-label={t("properties")}
            className="right-panel-splitter"
            role="separator"
            onPointerDown={beginRightPanelResize}
          />}
          {workspaceLayout.propertiesVisible && <RightPanel
            columnLayouts={userSettings.preferences.pileOptionColumns}
            onColumnLayoutChange={(mode, layout) => {
              const next = patchUserSettings(userSettingsRef.current, {
                pileOptionColumns: { ...userSettingsRef.current.preferences.pileOptionColumns, [mode]: layout },
              });
              userSettingsRef.current = next;
              commitUserSettings(next);
            }}
            splitRatio={workspaceLayout.propertiesSplitRatio}
            onSplitRatioChange={propertiesSplitRatio => updateWorkspaceLayout({ propertiesSplitRatio })}
            ilpResult={<IlpOptimizationSettingsPanel
              newPlanName={ilp.newPlanName} onNewPlanNameChange={ilp.setNewPlanName}
              sections={userSettings.preferences.ilpSections}
              onToggleSection={section => commitUserSettings(patchUserSettings(userSettingsRef.current, {
                ilpSections: { ...userSettingsRef.current.preferences.ilpSections, [section]: !userSettingsRef.current.preferences.ilpSections[section] },
              }))}
              state={projectState} onChange={handleProjectStateChange}
              onRun={ilp.start} onRunLocal={ilp.startLocal} onStop={ilp.stop} onCancel={ilp.cancel}
              timeLimitSeconds={userSettings.preferences.optimizationTimeLimitSeconds}
              onTimeLimitChange={seconds=>commitUserSettings(patchUserSettings(userSettingsRef.current,{optimizationTimeLimitSeconds:seconds}))}
              hasBestSolution={!!ilp.progress?.best_solution} onClose={() => setRightTaskPanel(null)}
              running={ilp.running} stopping={ilp.stopping} cancelling={ilp.cancelling} disabled={ilp.disabled}
              runningPlanName={ilp.runningPlanName} onViewRunningPlan={() => {
                if (!ilp.runningPlanId) return;
                if (ilp.viewPlan(ilp.runningPlanId)) setActiveSourceKind(null);
                else activatePilePlan(ilp.runningPlanId);
              }}>
              {(ilp.running || ilp.notificationRun) && <IlpOptimizationResultPanel run={ilp.running?ilp:ilp.notificationRun!} currency={projectState.currencyCode}
                detailsOpen={false} onToggleDetails={() => {}} actionsEnabled={ilp.actionsAvailable}
                skipUnsolvableEnabled={projectState.ilpOptimizationSettings.skip_unsolvable_units}
                onEnableSkipUnsolvable={ilp.enableSkipUnsolvable} onApplyProposal={ilp.applyProposal} />}
              {(!ilp.running || !ilp.viewingRunPlan) && (!ilp.notificationRun || ilp.resultRun.outcome) &&
              <IlpOptimizationResultPanel
              detailsOpen={userSettings.preferences.ilpSections.result}
              onToggleDetails={() => commitUserSettings(patchUserSettings(userSettingsRef.current, {
                ilpSections: { ...userSettingsRef.current.preferences.ilpSections, result: !userSettingsRef.current.preferences.ilpSections.result },
              }))}
              run={ilp.resultRun} currency={ilp.resultCurrency} stale={ilp.resultStale} settings={ilp.resultSettings}
              planName={ilp.displayState.pilePlans.find(p=>p.id===ilp.displayState.activePilePlanId)?.name}
              actionsEnabled={ilp.actionsAvailable}
              skipUnsolvableEnabled={projectState.ilpOptimizationSettings.skip_unsolvable_units}
              onEnableSkipUnsolvable={ilp.enableSkipUnsolvable} onApplyProposal={ilp.applyProposal}
              />}</IlpOptimizationSettingsPanel>}
            state={ilp.displayState}
            loadPointGroups={loadPointGroups.groups}
            groupAssignmentAssessment={groupAssignmentAssessment}
            groupEditPending={groupEditPending || loadPointGroups.pending}
            onPreviewLoadPointGroupEdit={previewGroupEdit}
            onApplyLoadPointGroupEdit={applyGroupEdit}
            technicalAssignment={technicalAssignment}
            onStateChange={handleDisplayedStateChange}
            pileAssignmentPending={ilp.running || pileAssignmentPending
              || !hasCompletedLoadPointGroups
              || (projectState.loadPoints.length > 0 && loadPointGroups.groups.length === 0)}
            onApplyPileConfiguration={applyGroupedPileConfiguration}
            taskPanel={rightTaskPanel}
            onCloseTaskPanel={() => setRightTaskPanel(null)}
            hasPersonalCostDefault={userSettings.defaults.pileCostCatalog !== null}
            onEditCosts={applyCostCatalogEdit}
            onSaveCostDefault={(pileCostCatalog) => commitUserSettings(patchPileCostDefaults(userSettings, pileCostCatalog))}
            onRemoveCostDefault={() => commitUserSettings(patchPileCostDefaults(userSettings, null))}
            onLoadCostDefault={() => {
              const catalog = userSettings.defaults.pileCostCatalog;
              if (!catalog) return;
              void loadCostCatalogDefault(catalog);
            }}
            onLoadBuiltInCosts={() => {
              void loadCostCatalogDefault(BUILT_IN_PILE_COST_DEFAULTS);
            }}
          />}
        </div>
        <StatusBar
          zoomPercent={projectState.viewport.scale * 100}
          message={statusMessage}
        />
      </div>
      <Backstage
        open={backstageOpen}
        onClose={() => {
          setBackstageOpen(false);
          setInitialImportSource(null);
        }}
        initialImportSource={initialImportSource}
        onOpenSettings={() => setSettingsOpen(true)}
        commands={projectFileCommands}
        loadPoints={projectState.loadPoints}
        cpts={projectState.cpts}
        availablePileConfigurations={availablePileConfigurations}
          activePilePlanName={activePilePlanName}
          defaultCurrencyCode={userSettings.preferences.defaultCurrencyCode}
        onImportPilePlan={importPilePlan}
        onImportProject={async (mode, projectName: string | null, sources: ImportSourceInput[], properties: ProjectImportProperties | null) => {
          if (mode === "refresh") {
            const refreshed = await refreshProjectFromFilesCore({
              currentProject: requireValidProjectDocument(
                await readProjectDocumentCore(
                  await writeProjectDocumentCore(projectDraftFromState(projectState)),
                ),
              ).project,
              sources,
            });
            const refreshedProject = refreshed.project;
            defaultSelectionKeepsDirtyRef.current = true;
            commitProjectState(createInitialProjectState(refreshedProject, {
              initializeDefaultPiles: true,
            }, refreshed.keys));
            setIsDirty(true);
            return getImportSummary(refreshedProject);
          }

          if (!await confirmProjectReplacement()) return null;
            const imported = await importProjectFromFilesCore({
              projectName: projectName ?? projectState.name,
              pileHeadLevelM: properties?.pileHeadLevelM ?? 0,
              currencyCode: properties?.currencyCode ?? userSettings.preferences.defaultCurrencyCode,
              sources,
            });
            const project = imported.project;
          const importedState = createInitialProjectState(project, {
            initializeDefaultPiles: true,
            defaultPilePlanName: pilePlanLanguage() === "nl" ? "Basisplan" : "Base plan",
          }, imported.keys);
          const costs = await prepareMergedPileCostCatalogEdit(importedState,
            userSettings.defaults.pileCostCatalog, BUILT_IN_PILE_COST_DEFAULTS);
          defaultSelectionKeepsDirtyRef.current = false;
          replaceProjectState(costs.update(importedState));
          setProjectPath(null);
          updateSavedProjectSignature("");
          setIsDirty(true);
          return getImportSummary(project);
        }}
        onOpenProjectFile={async (file: File) => {
          if (!await confirmProjectReplacement()) return;
          try {
            const project = await prepareOpenedProject(
              await file.text(),
              { initializeDefaultPiles: false },
              {
                readProjectDocument: readProjectDocumentCore,
              },
            );
            installOpenedProject(project, null);
          } catch (error) {
            showActionNotice(describeProjectOpenError(error, t), "error");
          }
        }}
        onOpenSampleProject={openSampleProject}
        onOpenFile={(path) => void openDesktopProjectPath(path)}
        onChooseDesktopProject={chooseDesktopProject}
        onDownloadProject={async () => { await downloadProject(); }}
        onExportPilePlanXlsx={() => exportPilePlan("xlsx")}
        onExportPilePlanCsv={() => exportPilePlan("csv")}
        onSaveProject={async () => { await saveProject(); }}
        onSaveProjectAs={async () => { await saveProjectAs(); }}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={userSettings.preferences.theme}
        language={userSettings.preferences.language}
        defaultCurrencyCode={userSettings.preferences.defaultCurrencyCode}
        onPreferencesChange={(preferences) => commitUserSettings(patchUserSettings(userSettings, preferences))}
        isDesktop={isDesktop}
        interfaceScalePercent={interfaceScalePercent}
        onInterfaceScalePreview={(scale) => { void applyDesktopInterfaceScale(scale); }}
        mcpStatus={mcpStatus}
        mcpConnection={mcpConnection}
        mcpError={mcpError}
        onMcpToggle={(enabled) => { void setMcpEnabled(enabled); }}
        mcpWriteEnabled={mcpWriteEnabled}
        onMcpWriteToggle={(enabled) => {
          mcpWriteEnabledRef.current = enabled;
          setMcpWriteEnabled(enabled);
        }}
      />
        <ProjectInformationDialog
          open={projectInformationOpen}
          projectName={projectState.name}
          pileHeadLevelM={projectState.pileHeadLevelM}
          currencyCode={projectState.currencyCode}
          onClose={() => setProjectInformationOpen(false)}
          onSave={({ projectName, pileHeadLevelM, currencyCode }) => applyValidatedProjectEdit((state) =>
            prepareProjectDocumentEdit(state, {
              kind: "project_properties", name: projectName,
              pile_head_level_m: pileHeadLevelM, currency_code: currencyCode,
            }))}
        />
      <UnsavedChangesDialog
        open={unsavedChangesOpen}
        isDesktop={isDesktop}
        onCancel={() => resolveProjectReplacement(false)}
        onDiscard={() => resolveProjectReplacement(true)}
        onSave={() => void (isDesktop ? saveProject() : downloadProject()).then((saved) => {
          if (saved) resolveProjectReplacement(true);
        })}
      />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );

  function beginExplorerResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startWidth = explorerWidthRef.current;
    const layoutScale = appContentRef.current ? elementLayoutScale(appContentRef.current) : 1;
    const startX = screenToLocal(event.clientX, layoutScale);
    let currentWidth = startWidth;
    document.body.classList.add("is-resizing-panel");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      currentWidth = Math.max(0, startWidth + screenToLocal(moveEvent.clientX, layoutScale) - startX);
      appContentRef.current?.style.setProperty("--explorer-width", `${currentWidth}px`);
      dispatchViewerLayoutChange();
    };
    const handlePointerUp = () => {
      const snapped = snapExplorerWidth(currentWidth);
      explorerWidthRef.current = snapped.width;
      appContentRef.current?.style.setProperty("--explorer-width", `${snapped.width}px`);
      dispatchViewerLayoutChange();
      updateWorkspaceLayout({ explorerVisible: snapped.visible, explorerWidth: snapped.width });
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function beginRightPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startWidth = rightPanelWidthRef.current;
    const layoutScale = appContentRef.current ? elementLayoutScale(appContentRef.current) : 1;
    const startX = screenToLocal(event.clientX, layoutScale);
    let currentWidth = startWidth;
    document.body.classList.add("is-resizing-panel");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      currentWidth = Math.max(0, startWidth + startX - screenToLocal(moveEvent.clientX, layoutScale));
      appContentRef.current?.style.setProperty("--right-panel-width", `${currentWidth}px`);
      dispatchViewerLayoutChange();
    };
    const handlePointerUp = () => {
      const snapped = snapRightPanelWidth(currentWidth);
      rightPanelWidthRef.current = snapped.width;
      appContentRef.current?.style.setProperty("--right-panel-width", `${snapped.width}px`);
      dispatchViewerLayoutChange();
      updateWorkspaceLayout({ propertiesVisible: snapped.visible, propertiesWidth: snapped.width });
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }
}

function dispatchViewerLayoutChange() {
  window.dispatchEvent(new Event(VIEWER_LAYOUT_CHANGE_EVENT));
}

