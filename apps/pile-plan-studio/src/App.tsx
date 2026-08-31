import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import sampleProjectText from "../../../sample_project/sample_project.ifcpp?raw";
import TitleBar from "./components/template/TitleBar";
import Ribbon from "./components/template/ribbon/Ribbon";
import Backstage from "./components/template/backstage/Backstage";
import SettingsDialog, { applyTheme } from "./components/template/settings/SettingsDialog";
import FeedbackDialog from "./components/template/feedback/FeedbackDialog";
import StatusBar from "./components/template/StatusBar";
import InterfaceScaleNotice, { type InterfaceScaleNoticeValue } from "./components/template/InterfaceScaleNotice";
import HistoryNotice from "./components/viewer/HistoryNotice";
import PilePlanWorkspace from "./components/domain/PilePlanWorkspace";
import RightPanel, { type RightTaskPanel } from "./components/domain/RightPanel";
import ProjectInformationDialog from "./components/domain/ProjectInformationDialog";
import UnsavedChangesDialog from "./components/domain/UnsavedChangesDialog.tsx";
import PilePlanExplorer from "./components/domain/PilePlanExplorer.tsx";
import SourceDataViewer from "./components/domain/SourceDataViewer.tsx";
import type { InputSourceKind } from "./domain/projectState.ts";
import {
  calculatePileCostCore,
  calculateProjectAnalysisCore,
  chooseDefaultPileOptionsCore,
  exportPilePlanCsvCore,
  exportPilePlanXlsxCore,
  greedyOptimizeCore,
  importProjectFromFilesCore,
  refreshProjectFromFilesCore,
} from "./core/coreClient";
import type { ImportSourceInput } from "./core/coreImportContract";
import type { ProjectImportProperties } from "./components/domain/ProjectImportPanel.tsx";
import type { ImportFileRole } from "./core/importFiles.ts";
import { getImportSummary, loadIfcppProjectData } from "./core/projectFile";
import { writeIfcppProjectCore } from "./core/coreClient";
import { createInitialProjectState, type ProjectState } from "./domain/projectState";
import { getSetting } from "./store";
import { optionKey } from "./components/domain/rightPanelModel";
import { buildGreedyOptimizationSettings } from "./domain/optimizationSettings";
import {
  applyOptimizationResult,
  clampOptimizationLimits,
  getOptimizationTargetIds,
} from "./components/domain/optimizationPanelModel";
import { switchRightPanelMode } from "./domain/selectionState";
import {
  getProjectFileCommands,
  isDesktopRuntime,
  pilePlanExportFileName,
  projectFileName,
  saveBinaryExport,
  saveGeneratedFile,
  savePreparedFile,
} from "./domain/projectPersistence.ts";
import {
  DEFAULT_EXPLORER_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  snapExplorerWidth,
  snapRightPanelWidth,
} from "./viewer/panelLayout.ts";
import { buildPilePlanExportInput } from "./domain/pilePlanExport.ts";
import {
  applyPilePlanImportAsNewPlan,
  pilePlanNameFromFileName,
} from "./domain/pilePlanImport.ts";
import type { PilePlanImportPatch } from "./core/pilePlanImportContract.ts";
import { mergeDefaultPileChoices } from "./domain/defaultPileChoices.ts";
import { summarizePilePlanCosts } from "./domain/projectCostSummary.ts";
import {
  createPilePlan,
  createOptimizationPilePlan,
  deletePilePlan,
  duplicatePilePlan,
  renamePilePlan,
  replaceOptimizationOutcomesForTargets,
  switchPilePlan,
  synchronizeActivePilePlan,
  type PilePlanLanguage,
} from "./domain/pilePlanManagement.ts";
import {
  applyLoadPointLockDraft,
  getActiveLockedLoadPointIds,
  startLoadPointLockDraft,
} from "./domain/loadPointLocking.ts";
import {
  createManagedProjectState,
  projectHistoryReducer,
} from "./domain/projectHistoryReducer.ts";
import {
  captureProjectContent,
  normalizeProjectContentState,
  projectFromContent,
} from "./domain/projectContent.ts";
import { describeHistoryAction, describeHistoryResult } from "./domain/historyMessage.ts";
import { createBrowserRecoveryRecord } from "./domain/browserRecovery.ts";
import {
  createBrowserRecoveryWriter,
  createIndexedDbRecoveryStore,
  type BrowserRecoveryStore,
} from "./domain/browserRecoveryStore.ts";
import { loadBrowserRecovery } from "./domain/browserRecoveryStartup.ts";
import { classifyAppShortcut } from "./domain/appShortcuts.ts";
import { DEFAULT_INTERFACE_SCALE, normalizeInterfaceScale, stepInterfaceScale } from "./domain/interfaceScale.ts";
import { applyDesktopInterfaceScale } from "./domain/interfaceScaleRuntime.ts";
import {
  DEFAULT_USER_SETTINGS,
  patchPileCostDefaults,
  patchUserSettings,
  patchWorkspaceLayout,
  type UserSettings,
  type WorkspaceLayoutSettings,
} from "./domain/userSettings.ts";
import {
  createPlatformUserSettingsStore,
  loadUserSettings,
  saveUserSettings,
  type UserSettingsStore,
} from "./domain/userSettingsStore.ts";
import { changeLanguage } from "./i18n/config.ts";
import { elementLayoutScale, screenToLocal } from "./domain/uiBaseline.ts";
import { applyPileCostCatalogDefault, mergePileCostCatalog } from "./domain/pileCostCatalog.ts";
import { VIEWER_LAYOUT_CHANGE_EVENT } from "./viewer/viewerGeometry.ts";
import { transitionLassoSelectionMode } from "./viewer/lassoSelection.ts";
import {
  applyCptSelectionPreviewResult,
  beginCptSelectionPreview,
  failCptSelectionPreview,
  getCptSelectionPreviewInput,
} from "./components/domain/cptSettingsModel.ts";

const BUILT_IN_PILE_COST_DEFAULTS = loadIfcppProjectData(sampleProjectText).pileCostSettings;

const POINTER_FOCUS_CONTROL_SELECTOR = "button, [role='option'], [role='tab']";

function releasePointerActivatedControlFocus(event: ReactPointerEvent<HTMLDivElement>) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const control = target.closest<HTMLElement>(POINTER_FOCUS_CONTROL_SELECTOR);
  if (control && event.currentTarget.contains(control)) control.blur();
}

type AppBootstrap =
  | { kind: "loading" }
  | {
      kind: "ready";
      initialProjectText: string;
      initializeDefaultPiles: boolean;
      initialSavedProjectSignature?: string;
      initialWasDirty?: boolean;
      initialStatusKey?: string;
      recoveryStore?: BrowserRecoveryStore;
    };

export default function App() {
  const { t } = useTranslation();
  const isDesktop = isDesktopRuntime();
  const [bootstrap, setBootstrap] = useState<AppBootstrap>(() => isDesktop
    ? { kind: "ready", initialProjectText: sampleProjectText, initializeDefaultPiles: true }
    : { kind: "loading" });

  useEffect(() => {
    if (isDesktop) return;
    let cancelled = false;
    const start = async () => {
      if (!window.indexedDB) {
        if (!cancelled) setBootstrap({
          kind: "ready",
          initialProjectText: sampleProjectText,
          initializeDefaultPiles: true,
          initialStatusKey: "recovery.unavailable",
        });
        return;
      }
      const recoveryStore = createIndexedDbRecoveryStore(window.indexedDB);
      const result = await loadBrowserRecovery({
        isDesktop: false,
        store: recoveryStore,
        validateProject: (text) => { loadIfcppProjectData(text); },
      });
      if (cancelled) return;
      if (result.kind === "restored") {
        setBootstrap({
          kind: "ready",
          initialProjectText: result.record.ifcppText,
          initializeDefaultPiles: false,
          initialSavedProjectSignature: result.record.savedProjectSignature,
          initialWasDirty: result.record.isDirty,
          initialStatusKey: "recovery.restored",
          recoveryStore,
        });
      } else {
        setBootstrap({
          kind: "ready",
          initialProjectText: sampleProjectText,
          initializeDefaultPiles: true,
          initialStatusKey: result.kind === "invalid"
            ? "recovery.invalid"
            : result.kind === "unavailable"
              ? "recovery.unavailable"
              : undefined,
          recoveryStore: result.kind === "unavailable" ? undefined : recoveryStore,
        });
      }
      void navigator.storage?.persist?.().catch(() => false);
    };
    void start();
    return () => { cancelled = true; };
  }, [isDesktop]);

  if (bootstrap.kind === "loading") {
    return <div className="app-bootstrap" role="status">{t("recovery.loading")}</div>;
  }

  return <AppSession {...bootstrap} />;
}

function AppSession({
  initialProjectText,
  initializeDefaultPiles,
  initialSavedProjectSignature,
  initialWasDirty = false,
  initialStatusKey,
  recoveryStore,
}: Extract<AppBootstrap, { kind: "ready" }>) {
  const { t, i18n } = useTranslation();
  const [managedProject, dispatchProject] = useReducer(
    projectHistoryReducer,
    initialProjectText,
    (projectText) => createManagedProjectState(createInitialProjectState(
      projectText,
      {
        initializeDefaultPiles,
        defaultPilePlanName: i18n.language.startsWith("nl") ? "Basisplan" : "Base plan",
      },
    )),
  );
  const projectState = managedProject.present;
  const setProjectState = useCallback((update: SetStateAction<ProjectState>) => {
    dispatchProject({ type: "runtime", update });
  }, []);
  const commitProjectState = useCallback((update: SetStateAction<ProjectState>) => {
    dispatchProject({ type: "commit", update });
  }, []);
  const amendProjectState = useCallback((update: SetStateAction<ProjectState>) => {
    dispatchProject({ type: "amend", update });
  }, []);
  const replaceProjectState = useCallback((state: ProjectState) => {
    dispatchProject({ type: "replace", state });
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backstageOpen, setBackstageOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [projectInformationOpen, setProjectInformationOpen] = useState(false);
  const [rightTaskPanel, setRightTaskPanel] = useState<RightTaskPanel | null>(null);
  const [lassoSelectionActive, setLassoSelectionActive] = useState(false);
  const [activeSourceKind, setActiveSourceKind] = useState<InputSourceKind | null>(null);
  const [initialImportSource, setInitialImportSource] = useState<{ role: ImportFileRole; file: File } | null>(null);
  const [isDirty, setIsDirty] = useState(initialWasDirty);
  const [projectPath, setProjectPath] = useState<string | null>(null);
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
  const [creatingPilePlan, setCreatingPilePlan] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const statusMessageTimeoutRef = useRef<number | null>(null);
  const lassoSelectionAvailable = projectState.loadPointLockDraft === null
    && projectState.cptSelectionEditDraft === null;

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
  const [historyNotice, setHistoryNotice] = useState({ id: 0, message: "" });
  const historyNoticeIdRef = useRef(0);
  const historyNoticeTimeoutRef = useRef<number | null>(null);
  const showHistoryNotice = useCallback((message: string) => {
    if (historyNoticeTimeoutRef.current !== null) window.clearTimeout(historyNoticeTimeoutRef.current);
    historyNoticeIdRef.current += 1;
    setHistoryNotice({ id: historyNoticeIdRef.current, message });
    historyNoticeTimeoutRef.current = window.setTimeout(() => {
      setHistoryNotice((current) => ({ ...current, message: "" }));
      historyNoticeTimeoutRef.current = null;
    }, 3500);
  }, []);
  const defaultSelectionRequestRef = useRef<typeof projectState.analysisRequest | null>(null);
  const defaultSelectionKeepsDirtyRef = useRef(false);
  const replacementResolverRef = useRef<((proceed: boolean) => void) | null>(null);
  const initialProjectSignature = JSON.stringify(projectFromState(projectState));
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
  const availablePileConfigurations = useMemo(() => [
    ...new Map(projectState.bearingCapacities.map((capacity) => {
      const configuration = {
        pile_size_mm: capacity.pile_size_mm,
        pile_tip_level_m_key: Math.round(capacity.pile_tip_level_m * 1000),
      };
      return [`${configuration.pile_size_mm}|${configuration.pile_tip_level_m_key}`, configuration] as const;
    })).values(),
  ], [projectState.bearingCapacities]);
  const persistedProject = projectFromState(projectState);
  const persistedProjectSignature = JSON.stringify(persistedProject);
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
      if (historyNoticeTimeoutRef.current !== null) window.clearTimeout(historyNoticeTimeoutRef.current);
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
      ifcppText: await writeIfcppProjectCore(persistedProject),
      projectName: persistedProject.metadata.name,
      savedProjectSignature,
      isDirty,
      updatedAt: new Date().toISOString(),
    }));
  }, [isDirty, persistedProjectSignature, projectState.defaultPileSelectionPending, recoveryWriter, savedProjectSignature]);

  useEffect(() => {
    const result = managedProject.lastResult;
    if (!result) return;
    showHistoryNotice(describeHistoryResult(historyTranslate, result));
  }, [historyTranslate, managedProject.lastResult, showHistoryNotice]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const undoRequested = key === "z" && !event.shiftKey;
      const redoRequested = key === "y" || (key === "z" && event.shiftKey);
      if (undoRequested && canUndo) {
        event.preventDefault();
        dispatchProject({ type: "undo" });
      } else if (redoRequested && canRedo) {
        event.preventDefault();
        dispatchProject({ type: "redo" });
      }
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [canRedo, canUndo]);
  const pilePlanCostSummaries = useMemo(() => summarizePilePlanCosts(
    synchronizeActivePilePlan(
      projectState.pilePlans,
      projectState.activePilePlanId,
      projectState.selectedPileOptionKeysByLoadPoint,
    ),
    projectState.pileCostByOptionKey,
  ), [
    projectState.activePilePlanId,
    projectState.pilePlans,
    projectState.selectedPileOptionKeysByLoadPoint,
    projectState.pileCostByOptionKey,
  ]);

  const serializeProject = async () => {
    return writeIfcppProjectCore(projectFromState(projectState));
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
    updateSavedProjectSignature(JSON.stringify(projectFromState(projectState)));
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
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_project_file", { path, contents: await serializeProject() });
    setProjectPath(path);
    updateSavedProjectSignature(JSON.stringify(projectFromState(projectState)));
    setIsDirty(false);
    return true;
  };

  const saveProject = async (): Promise<boolean> => {
    if (!isDesktop) return downloadProject();
    if (!projectPath) return saveProjectAs();
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_project_file", { path: projectPath, contents: await serializeProject() });
    updateSavedProjectSignature(JSON.stringify(projectFromState(projectState)));
    setIsDirty(false);
    return true;
  };

  projectActionRef.current = isDesktop ? saveProject : downloadProject;

  useEffect(() => {
    const handleAppShortcut = (event: KeyboardEvent) => {
      const action = classifyAppShortcut(event, isDesktop);
      if (!action) return;
      event.preventDefault();

      if (action === "save") {
        if (saveShortcutInFlightRef.current || !projectActionRef.current) return;
        saveShortcutInFlightRef.current = true;
        void projectActionRef.current().finally(() => {
          saveShortcutInFlightRef.current = false;
        });
        return;
      }

      if (action === "open") {
        if (openProjectActionRef.current) void openProjectActionRef.current();
        return;
      }

      const current = userSettingsRef.current;
      const currentScale = current.preferences.interfaceScalePercent;
      const scale = action === "zoom-reset"
        ? DEFAULT_INTERFACE_SCALE
        : stepInterfaceScale(currentScale, action === "zoom-in" ? 1 : -1);
      applyInterfaceScale(scale);
    };
    window.addEventListener("keydown", handleAppShortcut);
    return () => window.removeEventListener("keydown", handleAppShortcut);
  }, [isDesktop]);

  const activePilePlanName = projectState.pilePlans.find(
    (pilePlan) => pilePlan.id === projectState.activePilePlanId,
  )?.name ?? projectState.name;

  const exportPilePlan = async (format: "xlsx" | "csv"): Promise<void> => {
    const input = buildPilePlanExportInput(projectState);
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
    if (!isDirty) return Promise.resolve(true);
    setUnsavedChangesOpen(true);
    return new Promise((resolve) => {
      replacementResolverRef.current = resolve;
    });
  }, [isDirty]);

  const resolveProjectReplacement = (proceed: boolean) => {
    setUnsavedChangesOpen(false);
    const resolve = replacementResolverRef.current;
    replacementResolverRef.current = null;
    resolve?.(proceed);
  };

  const handleProjectStateChange = (nextState: typeof projectState) => {
    const pileChoicesChanged = nextState.selectedPileOptionKeysByLoadPoint
      !== projectState.selectedPileOptionKeysByLoadPoint;
    commitProjectState(pileChoicesChanged ? {
      ...nextState,
      optimizationSummary: null,
      optimizationError: null,
    } : nextState);
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
    setProjectState((current) => {
      if (pilePlanId === current.activePilePlanId) return current;
      const transition = switchPilePlan({ ...current, targetPilePlanId: pilePlanId });
      const locked = new Set(getActiveLockedLoadPointIds(transition.pilePlans, transition.activePilePlanId));
      const selectedLoadPointIds = current.selectedLoadPointIds.filter((id) => !locked.has(id));
      return {
        ...current,
        ...transition,
        loadPointLockDraft: null,
        loadPointLockSelectionSnapshot: null,
        selectedLoadPointIds,
        selectedLoadPointId: selectedLoadPointIds.includes(current.selectedLoadPointId ?? -1)
          ? current.selectedLoadPointId
          : selectedLoadPointIds[0] ?? null,
        selectedCptId: null,
        optimizationSummary: null,
        optimizationError: null,
      };
    });
  };

  const startLockEditing = () => {
    setRightTaskPanel(null);
    setProjectState((current) => ({
      ...current,
      cptSelectionEditDraft: null,
      loadPointLockDraft: startLoadPointLockDraft(
        current.pilePlans,
        current.activePilePlanId,
        current.selectedLoadPointIds,
      ),
      loadPointLockSelectionSnapshot: {
        selectedLoadPointIds: [...current.selectedLoadPointIds],
        selectedLoadPointId: current.selectedLoadPointId,
        selectedCptId: current.selectedCptId,
      },
      selectedLoadPointIds: [],
      selectedLoadPointId: null,
      selectedCptId: null,
    }));
  };

  const cancelLockEditing = () => {
    setProjectState((current) => {
      const snapshot = current.loadPointLockSelectionSnapshot;
      if (snapshot === null) {
        return { ...current, loadPointLockDraft: null };
      }
      return {
        ...current,
        loadPointLockDraft: null,
        loadPointLockSelectionSnapshot: null,
        selectedLoadPointIds: snapshot.selectedLoadPointIds,
        selectedLoadPointId: snapshot.selectedLoadPointId,
        selectedCptId: snapshot.selectedCptId,
      };
    });
  };

  const unlockAllInDraft = () => {
    setProjectState((current) => current.loadPointLockDraft === null
      ? current
      : { ...current, loadPointLockDraft: new Set() });
  };

  const applyLockEditing = () => {
    commitProjectState((current) => {
      const draft = current.loadPointLockDraft;
      if (draft === null) return current;
      const previous = getActiveLockedLoadPointIds(current.pilePlans, current.activePilePlanId);
      const changed = previous.length !== draft.size || previous.some((id) => !draft.has(id));
      const selectedLoadPointIds = current.selectedLoadPointIds.filter((id) => !draft.has(id));
      const selectedLoadPointId = selectedLoadPointIds.includes(current.selectedLoadPointId ?? -1)
        ? current.selectedLoadPointId
        : selectedLoadPointIds[0] ?? null;
      if (!changed) {
        return {
          ...current,
          loadPointLockDraft: null,
          loadPointLockSelectionSnapshot: null,
        };
      }
      return {
        ...current,
        pilePlans: applyLoadPointLockDraft(current.pilePlans, current.activePilePlanId, draft),
        loadPointLockDraft: null,
        loadPointLockSelectionSnapshot: null,
        selectedLoadPointIds,
        selectedLoadPointId,
        selectedCptId: null,
      };
    });
  };

  const renameProjectPilePlan = (pilePlanId: string, name: string) => {
    commitProjectState((current) => {
      const synchronized = synchronizeActivePilePlan(
        current.pilePlans,
        current.activePilePlanId,
        current.selectedPileOptionKeysByLoadPoint,
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

  const createFreshPilePlan = async () => {
    if (creatingPilePlan) return;
    const snapshot = projectState;
    if (
      snapshot.pileOptionsByLoadPointId.size !== snapshot.loadPoints.length
      || snapshot.analysisError !== null
    ) {
      return;
    }
    setCreatingPilePlan(true);
    try {
      const activeSizes = new Set(snapshot.activePileSizes);
      const activeTips = new Set(snapshot.activePileTipLevels);
      const optionsByLoadPointId = activeSizes.size === 0 || activeTips.size === 0
        ? new Map<number, never[]>()
        : new Map([...snapshot.pileOptionsByLoadPointId].map(([loadPointId, options]) => [
            loadPointId,
            options.filter((option) => activeSizes.has(option.pile_size_mm)
              && activeTips.has(option.pile_tip_level_m)),
          ]));
      const choices = optionsByLoadPointId.size === 0
        ? new Map<number, string>()
        : await chooseDefaultPileOptionsCore({
            optionsByLoadPointId,
            pileHeadLevelM: snapshot.pileHeadLevelM ?? 0,
            costSettings: snapshot.pileCostSettings,
          });
      commitProjectState((current) => {
        if (current.analysisRequest !== snapshot.analysisRequest) return current;
        return {
          ...current,
          ...createPilePlan({
            ...current,
            choices,
            kind: "variant",
            language: pilePlanLanguage(),
          }),
        };
      });
    } catch (error) {
      console.error("Failed to create pile plan", error);
    } finally {
      setCreatingPilePlan(false);
    }
  };

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
    writeIfcppProjectCore(persistedProject).then((text) => {
      if (!cancelled) {
        preparedProjectRef.current = {
          signature: persistedProjectSignature,
          blob: new Blob([text], { type: "application/json" }),
        };
      }
    });
    return () => { cancelled = true; };
  }, [persistedProjectSignature]);

  useEffect(() => {
    const previewInput = getCptSelectionPreviewInput(projectState);
    if (!previewInput) return;
    const { draft } = previewInput;
    let cancelled = false;
    setProjectState((current) => beginCptSelectionPreview(current, draft));

    calculateProjectAnalysisCore({
      bearingCapacities: projectState.bearingCapacities,
      cpts: projectState.cpts,
      globalSettings: projectState.globalCptSelectionSettings,
      loadPoints: previewInput.loadPoints,
      manualCptIdsByLoadPoint: previewInput.manualCptIdsByLoadPoint,
      settingsByLoadPoint: projectState.cptSelectionSettingsByLoadPoint,
      includeCptFrdRows: false,
    }).then((analysis) => {
      if (!cancelled) {
        setProjectState((current) => applyCptSelectionPreviewResult(current, draft, analysis));
      }
    }).catch((error: unknown) => {
      console.error("Failed to preview CPT selection", error);
      if (!cancelled) {
        setProjectState((current) => failCptSelectionPreview(
          current,
          draft,
          error instanceof Error ? error.message : String(error),
        ));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectState.cptSelectionEditDraft]);

  useEffect(() => {
    let cancelled = false;
    const analysisRequest = projectState.analysisRequest;

    async function loadCoreAnalysis() {
      const requestedIds = analysisRequest.loadPointIds;
      const analysisLoadPoints = requestedIds === null
        ? projectState.loadPoints
        : projectState.loadPoints.filter((loadPoint) => requestedIds.includes(loadPoint.id));
      const analysis = await calculateProjectAnalysisCore({
        bearingCapacities: projectState.bearingCapacities,
        cpts: projectState.cpts,
        globalSettings: projectState.globalCptSelectionSettings,
        loadPoints: analysisLoadPoints,
        manualCptIdsByLoadPoint: projectState.manualCptIdsByLoadPoint,
        settingsByLoadPoint: projectState.cptSelectionSettingsByLoadPoint,
        includeCptFrdRows: projectState.cptFrdRowsByCptId.size === 0,
      });
      if (!cancelled) {
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
      }
    }

    loadCoreAnalysis().catch((error: unknown) => {
      console.error("Failed to load pile option analysis", error);
      if (!cancelled) {
        setProjectState((current) => current.analysisRequest !== analysisRequest ? current : ({
          ...current,
          analysisError: error instanceof Error ? error.message : String(error),
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectState.analysisRequest]);

  useEffect(() => {
    if (
      !projectState.defaultPileSelectionPending
      || projectState.pileOptionsByLoadPointId.size !== projectState.loadPoints.length
    ) {
      return;
    }
    const analysisRequest = projectState.analysisRequest;
    if (defaultSelectionRequestRef.current === analysisRequest) {
      return;
    }
    defaultSelectionRequestRef.current = analysisRequest;

    chooseDefaultPileOptionsCore({
      optionsByLoadPointId: projectState.pileOptionsByLoadPointId,
      pileHeadLevelM: projectState.pileHeadLevelM ?? 0,
      costSettings: projectState.pileCostSettings,
    }).then((choices) => {
      const applyChoices = (current: ProjectState) => {
        if (current.analysisRequest !== analysisRequest) return current;
        const next = {
          ...current,
          selectedPileOptionKeysByLoadPoint: mergeDefaultPileChoices(
            current.selectedPileOptionKeysByLoadPoint,
            choices,
          ),
          defaultPileSelectionPending: false,
          analysisError: null,
        };
        if (savedProjectSignatureRef.current !== "" && !defaultSelectionKeepsDirtyRef.current) {
          updateSavedProjectSignature(JSON.stringify(projectFromState(next)));
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
    projectState.pileCostSettings,
    projectState.pileOptionsByLoadPointId,
  ]);

  useEffect(() => {
    let cancelled = false;
    const uniqueOptions = [
      ...new Map(
        [...projectState.pileOptionsByLoadPointId.values()]
          .flat()
          .map((option) => [optionKey(option), option]),
      ).values(),
    ];

    Promise.all(uniqueOptions.map(async (option) => [
      optionKey(option),
      await calculatePileCostCore({
        pileSizeMm: option.pile_size_mm,
        pileTipLevelM: option.pile_tip_level_m,
        pileHeadLevelM: projectState.pileHeadLevelM ?? 0,
        settings: projectState.pileCostSettings,
      }),
    ] as const)).then((entries) => {
      if (!cancelled) {
        setProjectState((current) => ({ ...current, pileCostByOptionKey: new Map(entries) }));
      }
    }).catch((error: unknown) => {
      console.error("Failed to calculate pile costs", error);
    });

    return () => {
      cancelled = true;
    };
  }, [projectState.pileCostSettings, projectState.pileHeadLevelM, projectState.pileOptionsByLoadPointId]);

  const runGreedyOptimization = async () => {
    const snapshot = projectState;
    const lockedLoadPointIds = getActiveLockedLoadPointIds(
      snapshot.pilePlans,
      snapshot.activePilePlanId,
    );
    const targetLoadPointIds = getOptimizationTargetIds(
      snapshot.optimizationTargetScope,
      snapshot.loadPoints.map((loadPoint) => loadPoint.id),
      snapshot.selectedLoadPointIds,
      lockedLoadPointIds,
    );
    if (
      snapshot.optimizationRunning
      || targetLoadPointIds.length === 0
      || snapshot.activePileSizes.length === 0
      || snapshot.activePileTipLevels.length === 0
    ) {
      return;
    }

    const currentAssignments = new Map(
      [...snapshot.selectedPileOptionKeysByLoadPoint].flatMap(([loadPointId, key]) => {
        const [pileSizeMm, pileTipLevelM] = key.split("|").map(Number);
        return Number.isFinite(pileSizeMm) && Number.isFinite(pileTipLevelM)
          ? [[
              loadPointId,
              {
                pile_size_mm: pileSizeMm,
                pile_tip_level_m_key: Math.round(pileTipLevelM * 1000),
              },
            ] as const]
          : [];
      }),
    );
    const limits = clampOptimizationLimits({
      sizes: snapshot.optimizationSettings.max_pile_sizes,
      tips: snapshot.optimizationSettings.max_pile_tip_levels,
      configurations: snapshot.optimizationSettings.max_pile_configurations,
    }, snapshot.activePileSizes, snapshot.activePileTipLevels);
    const settings = buildGreedyOptimizationSettings({
      activePileSizes: snapshot.activePileSizes,
      activePileTipLevels: snapshot.activePileTipLevels,
      uiSettings: {
        targetScope: snapshot.optimizationTargetScope,
        limitScope: snapshot.optimizationLimitScope,
        maxDifferentSizes: limits.sizes,
        maxDifferentTips: limits.tips,
        maxDifferentConfigurations: limits.configurations,
      },
      maxUtilization: snapshot.optimizationSettings.max_utilization,
    });
    const optionsByLoadPoint = snapshot.pileOptionsByLoadPointId;

    setProjectState((current) => ({
      ...current,
      optimizationSettings: settings,
      optimizationRunning: true,
      optimizationError: null,
      optimizationSummary: null,
    }));

    try {
      const result = await greedyOptimizeCore({
        optionsByLoadPoint,
        targetLoadPointIds,
        lockedLoadPointIds,
        currentAssignments,
        limitScope: snapshot.optimizationLimitScope,
        pileHeadLevelM: snapshot.pileHeadLevelM ?? 0,
        costSettings: snapshot.pileCostSettings,
        settings,
      });
      const applied = applyOptimizationResult({
        previousChoices: snapshot.selectedPileOptionKeysByLoadPoint,
        result,
      });
      commitProjectState((current) => {
        if (current.analysisRequest !== snapshot.analysisRequest) return current;
        const activePlan = current.pilePlans.find(
          (plan) => plan.id === current.activePilePlanId,
        ) ?? current.pilePlans[0];
        const optimizationUnassignedByLoadPoint = replaceOptimizationOutcomesForTargets(
          activePlan.optimizationUnassignedByLoadPoint,
          applied.affectedLoadPointIds,
          applied.optimizationUnassignedByLoadPoint,
        );
        const pilePlanTransition = snapshot.optimizationCreatesPilePlan
          ? createOptimizationPilePlan({
              ...current,
              optimizedChoices: applied.choices,
              optimizationUnassignedByLoadPoint,
              language: pilePlanLanguage(),
            })
          : {
              selectedPileOptionKeysByLoadPoint: applied.choices,
              pilePlans: current.pilePlans.map((plan) => plan.id === current.activePilePlanId
                ? {
                    ...plan,
                    selectedPileOptionKeysByLoadPoint: new Map(applied.choices),
                    optimizationUnassignedByLoadPoint,
                  }
                : plan),
            };
        return {
          ...current,
          ...pilePlanTransition,
          optimizationSettings: settings,
          optimizationRunning: false,
          optimizationError: null,
          optimizationSummary: applied.summary,
        };
      });
    } catch (error) {
      setProjectState((current) => current.analysisRequest !== snapshot.analysisRequest ? current : ({
        ...current,
        optimizationRunning: false,
        optimizationError: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const optimizationDisabled = projectState.optimizationRunning
    || projectState.activePileSizes.length === 0
    || projectState.activePileTipLevels.length === 0
    || (projectState.optimizationTargetScope === "selected" && projectState.selectedLoadPointIds.length === 0);

  const installOpenedProject = (project: ProjectState, path: string | null) => {
    setLassoSelectionActive((active) => transitionLassoSelectionMode(active, { type: "dismiss" }));
    replaceProjectState(project);
    setProjectPath(path);
    updateSavedProjectSignature(JSON.stringify(projectFromState(project)));
    setIsDirty(false);
    if (project.legendImportWarnings.length > 0) {
      showStatusMessage(t("legend.importWarnings", { count: project.legendImportWarnings.length }));
    }
  };

  const openSampleProject = async () => {
    if (!await confirmProjectReplacement()) return;
    installOpenedProject(createInitialProjectState(sampleProjectText, {
      initializeDefaultPiles: true,
      defaultPilePlanName: pilePlanLanguage() === "nl" ? "Basisplan" : "Base plan",
    }), null);
    showStatusMessage(t("recovery.sampleOpened"));
  };

  const openDesktopProjectPath = async (path: string) => {
    if (!await confirmProjectReplacement()) return;
    const { invoke } = await import("@tauri-apps/api/core");
    const text = await invoke<string>("read_project_file", { path });
    installOpenedProject(createInitialProjectState(text, {
      initializeDefaultPiles: false,
    }), path);
  };

  const chooseDesktopProject = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, filters: [{ name: "IFCPP project", extensions: ["ifcpp"] }] });
    if (typeof path === "string") await openDesktopProjectPath(path);
  };

  openProjectActionRef.current = chooseDesktopProject;

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
          onRunOptimization={runGreedyOptimization}
          optimizationDisabled={optimizationDisabled}
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
          explorerVisible={workspaceLayout.explorerVisible}
          propertiesVisible={workspaceLayout.propertiesVisible}
          onSymbolScaleChange={(symbolScalePercent) => handleProjectStateChange({
            ...projectState,
            symbolScalePercent,
          })}
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
            activePilePlanId={projectState.activePilePlanId}
            activeSourceKind={activeSourceKind}
            costSummaries={pilePlanCostSummaries}
            currencyCode={projectState.currencyCode}
            createDisabled={
              projectState.pileOptionsByLoadPointId.size !== projectState.loadPoints.length
              || projectState.analysisError !== null
            }
            creating={creatingPilePlan}
            isDirty={isDirty}
            inputSources={projectState.inputSources}
            inputSourcesExpanded={workspaceLayout.inputSourcesExpanded}
            pilePlans={projectState.pilePlans}
            pilePlansExpanded={workspaceLayout.pilePlansExpanded}
            projectName={projectState.name}
            onActivate={activatePilePlan}
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
                state={projectState}
                lassoSelectionActive={lassoSelectionActive}
                onStateChange={handleProjectStateChange}
              />
            ) : (
              <SourceDataViewer
                source={projectState.inputSources.find(({ kind }) => kind === activeSourceKind)!}
                loadPoints={projectState.loadPoints}
                cpts={projectState.cpts}
                bearingCapacities={projectState.bearingCapacities}
                onReplaceSource={(file) => {
                  setInitialImportSource({ role: importRoleForSource(activeSourceKind), file });
                  setBackstageOpen(true);
                }}
              />
            )}
            <HistoryNotice message={historyNotice.message} noticeId={historyNotice.id} />
          </main>
          {workspaceLayout.propertiesVisible && <div
            aria-label={t("properties")}
            className="right-panel-splitter"
            role="separator"
            onPointerDown={beginRightPanelResize}
          />}
          {workspaceLayout.propertiesVisible && <RightPanel
            state={projectState}
            onStateChange={handleProjectStateChange}
            onRunOptimization={runGreedyOptimization}
            taskPanel={rightTaskPanel}
            onCloseTaskPanel={() => setRightTaskPanel(null)}
            hasPersonalCostDefault={userSettings.defaults.pileCostCatalog !== null}
            onSaveCostDefault={(pileCostCatalog) => commitUserSettings(patchPileCostDefaults(userSettings, pileCostCatalog))}
            onRemoveCostDefault={() => commitUserSettings(patchPileCostDefaults(userSettings, null))}
            onLoadCostDefault={() => {
              const catalog = userSettings.defaults.pileCostCatalog;
              if (!catalog) return;
              const usedPileSizes = new Set(projectState.bearingCapacities.map((capacity) => capacity.pile_size_mm));
              handleProjectStateChange({
                ...projectState,
                pileCostSettings: applyPileCostCatalogDefault(
                  projectState.pileCostSettings,
                  catalog,
                  usedPileSizes,
                ).catalog,
              });
            }}
            onLoadBuiltInCosts={() => {
              const usedPileSizes = new Set(projectState.bearingCapacities.map((capacity) => capacity.pile_size_mm));
              handleProjectStateChange({
                ...projectState,
                pileCostSettings: applyPileCostCatalogDefault(
                  projectState.pileCostSettings,
                  BUILT_IN_PILE_COST_DEFAULTS,
                  usedPileSizes,
                ).catalog,
              });
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
            const refreshedProject = await refreshProjectFromFilesCore({
              currentProject: projectFromState(projectState),
              sources,
            });
            defaultSelectionKeepsDirtyRef.current = true;
            commitProjectState(createInitialProjectState(refreshedProject, {
              initializeDefaultPiles: true,
            }));
            setIsDirty(true);
            return getImportSummary(refreshedProject);
          }

          if (!await confirmProjectReplacement()) return null;
            const project = await importProjectFromFilesCore({
              projectName: projectName ?? projectState.name,
              pileHeadLevelM: properties?.pileHeadLevelM ?? 0,
              currencyCode: properties?.currencyCode ?? userSettings.preferences.defaultCurrencyCode,
              sources,
            });
            const usedPileSizes = new Set(project.inputs.bearing_capacities.map((capacity) => capacity.pile_size_mm));
            const mergedCosts = mergePileCostCatalog(
              project.settings.pile_costs,
              userSettings.defaults.pileCostCatalog,
              BUILT_IN_PILE_COST_DEFAULTS,
              usedPileSizes,
            ).catalog;
            const withCosts = {
              ...project,
              settings: { ...project.settings, pile_costs: mergedCosts },
            };
          defaultSelectionKeepsDirtyRef.current = false;
          replaceProjectState(createInitialProjectState(withCosts, {
            initializeDefaultPiles: true,
            defaultPilePlanName: pilePlanLanguage() === "nl" ? "Basisplan" : "Base plan",
          }));
          setProjectPath(null);
          updateSavedProjectSignature("");
          setIsDirty(true);
          return getImportSummary(project);
        }}
        onOpenProjectFile={async (file: File) => {
          if (!await confirmProjectReplacement()) return;
          const project = createInitialProjectState(
            await file.text(),
            { initializeDefaultPiles: false },
          );
          installOpenedProject(project, null);
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
      />
        <ProjectInformationDialog
          open={projectInformationOpen}
          projectName={projectState.name}
          pileHeadLevelM={projectState.pileHeadLevelM}
          currencyCode={projectState.currencyCode}
          onClose={() => setProjectInformationOpen(false)}
          onSave={({ projectName, pileHeadLevelM, currencyCode }) => handleProjectStateChange({
            ...projectState,
            name: projectName,
            pileHeadLevelM,
            currencyCode,
          })}
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

function projectFromState(state: ProjectState) {
  const normalized = normalizeProjectContentState(state);
  return projectFromContent(captureProjectContent(normalized), normalized.activePilePlanId);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.matches("input, textarea, select") || target.isContentEditable
  );
}

function importRoleForSource(kind: InputSourceKind): ImportFileRole {
  if (kind === "load_points") return "load-points";
  if (kind === "bearing_capacities") return "bearing-capacities";
  return "cpts";
}
