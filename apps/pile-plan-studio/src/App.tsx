import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import sampleProjectText from "../../../sample_project/sample_project.ifcpp?raw";
import TitleBar from "./components/template/TitleBar";
import Ribbon from "./components/template/ribbon/Ribbon";
import Backstage from "./components/template/backstage/Backstage";
import SettingsDialog, { applyTheme } from "./components/template/settings/SettingsDialog";
import FeedbackDialog from "./components/template/feedback/FeedbackDialog";
import StatusBar from "./components/template/StatusBar";
import HistoryNotice from "./components/viewer/HistoryNotice";
import PilePlanWorkspace from "./components/domain/PilePlanWorkspace";
import RightPanel, { type RightTaskPanel } from "./components/domain/RightPanel";
import ProjectInformationDialog from "./components/domain/ProjectInformationDialog";
import UnsavedChangesDialog from "./components/domain/UnsavedChangesDialog.tsx";
import PilePlanExplorer from "./components/domain/PilePlanExplorer.tsx";
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
import { applyDefaultPileCostSettings, getImportSummary, loadIfcppProjectData } from "./core/projectFile";
import { writeIfcppProjectCore } from "./core/coreClient";
import { createInitialProjectState, type ProjectState } from "./domain/projectState";
import { getSetting } from "./store";
import { optionKey } from "./components/domain/rightPanelModel";
import { buildGreedyOptimizationSettings } from "./domain/optimizationSettings";
import {
  applyOptimizationChoices,
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
  resizeExplorerWidth,
  resizeRightPanelWidth,
} from "./viewer/panelLayout.ts";
import { buildPilePlanExportInput } from "./domain/pilePlanExport.ts";
import {
  applyPilePlanImportAsNewPlan,
  pilePlanNameFromFileName,
} from "./domain/pilePlanImport.ts";
import type { PilePlanImportPatch } from "./core/pilePlanImportContract.ts";
import { mergeDefaultPileChoices } from "./domain/defaultPileChoices.ts";
import { loadViewerPreferences, saveViewerPreferences } from "./domain/viewerPreferences.ts";
import { summarizePilePlanCosts } from "./domain/projectCostSummary.ts";
import {
  createPilePlan,
  createOptimizationPilePlan,
  deletePilePlan,
  duplicatePilePlan,
  renamePilePlan,
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

const BUILT_IN_PILE_COST_DEFAULTS = loadIfcppProjectData(sampleProjectText).pileCostSettings;

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
  const [isDirty, setIsDirty] = useState(initialWasDirty);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [unsavedChangesOpen, setUnsavedChangesOpen] = useState(false);
  const appContentRef = useRef<HTMLDivElement | null>(null);
  const explorerWidthRef = useRef(DEFAULT_EXPLORER_WIDTH);
  const rightPanelWidthRef = useRef(DEFAULT_RIGHT_PANEL_WIDTH);
  const [theme, setTheme] = useState("light");
  const [viewerPreferencesLoaded, setViewerPreferencesLoaded] = useState(false);
  const [creatingPilePlan, setCreatingPilePlan] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const statusMessageTimeoutRef = useRef<number | null>(null);
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
  const isDesktop = isDesktopRuntime();
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
    commitProjectState(nextState);
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
    getSetting("theme", "light").then((saved) => {
      setTheme(saved);
      applyTheme(saved);
    });
  }, []);

  useEffect(() => {
    loadViewerPreferences().then((preferences) => {
      setProjectState((current) => ({ ...current, ...preferences }));
      setViewerPreferencesLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!viewerPreferencesLoaded) return;
    void saveViewerPreferences({
      symbolScalePercent: projectState.symbolScalePercent,
      foregroundLayer: projectState.foregroundLayer,
      showGrid: projectState.showGrid,
    });
  }, [projectState.foregroundLayer, projectState.showGrid, projectState.symbolScalePercent, viewerPreferencesLoaded]);

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
  }, [projectState.pileCostSettings, projectState.pileOptionsByLoadPointId]);

  const runGreedyOptimization = async () => {
    const snapshot = projectState;
    const targetIds = getOptimizationTargetIds(
      snapshot.optimizationTargetScope,
      snapshot.loadPoints.map((loadPoint) => loadPoint.id),
      snapshot.selectedLoadPointIds,
      getActiveLockedLoadPointIds(snapshot.pilePlans, snapshot.activePilePlanId),
    );
    if (
      snapshot.optimizationRunning
      || targetIds.length === 0
      || snapshot.activePileSizes.length === 0
      || snapshot.activePileTipLevels.length === 0
    ) {
      return;
    }

    const targetSet = new Set(targetIds);
    const chosenOption = (loadPointId: number) => {
      const chosenKey = snapshot.selectedPileOptionKeysByLoadPoint.get(loadPointId);
      return snapshot.pileOptionsByLoadPointId.get(loadPointId)
        ?.find((option) => optionKey(option) === chosenKey) ?? null;
    };
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
      baselineOptions: snapshot.loadPoints
        .filter((loadPoint) => !targetSet.has(loadPoint.id))
        .map((loadPoint) => chosenOption(loadPoint.id)),
      maxUtilization: snapshot.optimizationSettings.max_utilization,
    });
    const optionsByLoadPoint = new Map(targetIds.map((id) => [
      id,
      snapshot.pileOptionsByLoadPointId.get(id) ?? [],
    ]));

    setProjectState((current) => ({
      ...current,
      optimizationSettings: settings,
      optimizationRunning: true,
      optimizationError: null,
      optimizationSummary: null,
    }));

    try {
      const choices = await greedyOptimizeCore({
        optionsByLoadPoint,
        costSettings: snapshot.pileCostSettings,
        settings,
      });
      const applied = applyOptimizationChoices({
        previousChoices: snapshot.selectedPileOptionKeysByLoadPoint,
        targetIds,
        choices,
      });
      commitProjectState((current) => {
        if (current.analysisRequest !== snapshot.analysisRequest) return current;
        const pilePlanTransition = snapshot.optimizationCreatesPilePlan
          ? createOptimizationPilePlan({
              ...current,
              optimizedChoices: applied.choices,
              language: pilePlanLanguage(),
            })
          : { selectedPileOptionKeysByLoadPoint: applied.choices };
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
    replaceProjectState(project);
    setProjectPath(path);
    updateSavedProjectSignature(JSON.stringify(projectFromState(project)));
    setIsDirty(false);
  };

  const openSampleProject = async () => {
    if (!await confirmProjectReplacement()) return;
    installOpenedProject(createInitialProjectState(sampleProjectText, {
      initializeDefaultPiles: true,
      viewerPreferences: projectState,
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
      viewerPreferences: projectState,
    }), path);
  };

  const chooseDesktopProject = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, filters: [{ name: "IFCPP project", extensions: ["ifcpp"] }] });
    if (typeof path === "string") await openDesktopProjectPath(path);
  };

  return (
    <>
      <div className="app-shell" data-testid="openaec-shell">
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
        />
        <Ribbon
          onFileTabClick={() => setBackstageOpen(true)}
          onOpenProjectInformation={() => setProjectInformationOpen(true)}
          onOpenRightPanel={(mode) => {
            setRightTaskPanel(null);
            setProjectState((current) => ({ ...current, ...switchRightPanelMode(current, mode) }));
          }}
          onOpenTaskPanel={setRightTaskPanel}
          onRunOptimization={runGreedyOptimization}
          optimizationDisabled={optimizationDisabled}
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
          onSymbolScaleChange={(symbolScalePercent) => setProjectState((current) => ({
            ...current,
            symbolScalePercent,
          }))}
          onViewerUtilizationRangeChange={(minimum, maximum) => handleProjectStateChange({
            ...projectState,
            viewerUtilizationSettings: { minimum, maximum },
          })}
          onForegroundLayerChange={(foregroundLayer) => setProjectState((current) => ({
            ...current,
            foregroundLayer,
          }))}
          onGridVisibilityChange={(showGrid) => setProjectState((current) => ({
            ...current,
            showGrid,
          }))}
        />
        <div
          className="app-content"
          ref={appContentRef}
          style={{
            "--explorer-width": `${DEFAULT_EXPLORER_WIDTH}px`,
            "--right-panel-width": `${DEFAULT_RIGHT_PANEL_WIDTH}px`,
          } as CSSProperties}
        >
          <PilePlanExplorer
            activePilePlanId={projectState.activePilePlanId}
            costSummaries={pilePlanCostSummaries}
            createDisabled={
              projectState.pileOptionsByLoadPointId.size !== projectState.loadPoints.length
              || projectState.analysisError !== null
            }
            creating={creatingPilePlan}
            isDirty={isDirty}
            pilePlans={projectState.pilePlans}
            projectName={projectState.name}
            onActivate={activatePilePlan}
            onCreate={() => void createFreshPilePlan()}
            onDelete={deleteProjectPilePlan}
            onDuplicate={duplicateProjectPilePlan}
            onRename={renameProjectPilePlan}
          />
          <div
            aria-label={t("explorer")}
            className="explorer-splitter"
            role="separator"
            onPointerDown={beginExplorerResize}
          />
          <main className="workspace" aria-label="Pile plan workspace">
            <PilePlanWorkspace state={projectState} onStateChange={handleProjectStateChange} />
            <HistoryNotice message={historyNotice.message} noticeId={historyNotice.id} />
          </main>
          <div
            aria-label={t("properties")}
            className="right-panel-splitter"
            role="separator"
            onPointerDown={beginRightPanelResize}
          />
          <RightPanel
            state={projectState}
            onStateChange={handleProjectStateChange}
            onRunOptimization={runGreedyOptimization}
            taskPanel={rightTaskPanel}
            onCloseTaskPanel={() => setRightTaskPanel(null)}
          />
        </div>
        <StatusBar
          zoomPercent={projectState.viewport.scale * 100}
          message={statusMessage}
        />
      </div>
      <Backstage
        open={backstageOpen}
        onClose={() => setBackstageOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        commands={projectFileCommands}
        loadPoints={projectState.loadPoints}
        cpts={projectState.cpts}
        availablePileConfigurations={availablePileConfigurations}
        activePilePlanName={activePilePlanName}
        onImportPilePlan={importPilePlan}
        onImportProject={async (mode, projectName: string | null, sources: ImportSourceInput[]) => {
          if (mode === "refresh") {
            const refreshedProject = await refreshProjectFromFilesCore({
              currentProject: projectFromState(projectState),
              sources,
            });
            defaultSelectionKeepsDirtyRef.current = true;
            commitProjectState(createInitialProjectState(refreshedProject, {
              initializeDefaultPiles: true,
              viewerPreferences: projectState,
            }));
            setIsDirty(true);
            return getImportSummary(refreshedProject);
          }

          if (!await confirmProjectReplacement()) return null;
          const project = await importProjectFromFilesCore({
            projectName: projectName ?? projectState.name,
            sources,
          });
          const withCosts = applyDefaultPileCostSettings(project, BUILT_IN_PILE_COST_DEFAULTS);
          defaultSelectionKeepsDirtyRef.current = false;
          replaceProjectState(createInitialProjectState(withCosts, {
            initializeDefaultPiles: true,
            viewerPreferences: projectState,
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
            { initializeDefaultPiles: false, viewerPreferences: projectState },
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
        theme={theme}
        onThemeChange={setTheme}
      />
      <ProjectInformationDialog
        open={projectInformationOpen}
        projectName={projectState.name}
        onClose={() => setProjectInformationOpen(false)}
        onSave={(name) => handleProjectStateChange({ ...projectState, name })}
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
    const startX = event.clientX;
    let currentWidth = startWidth;
    document.body.classList.add("is-resizing-panel");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      currentWidth = resizeExplorerWidth({ startWidth, startX, currentX: moveEvent.clientX });
      appContentRef.current?.style.setProperty("--explorer-width", `${currentWidth}px`);
    };
    const handlePointerUp = () => {
      explorerWidthRef.current = currentWidth;
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
    const startX = event.clientX;
    let currentWidth = startWidth;
    document.body.classList.add("is-resizing-panel");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      currentWidth = resizeRightPanelWidth({ startWidth, startX, currentX: moveEvent.clientX });
      appContentRef.current?.style.setProperty("--right-panel-width", `${currentWidth}px`);
    };
    const handlePointerUp = () => {
      rightPanelWidthRef.current = currentWidth;
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

function projectFromState(state: ProjectState) {
  const normalized = normalizeProjectContentState(state);
  return projectFromContent(captureProjectContent(normalized), normalized.activePilePlanId);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.matches("input, textarea, select") || target.isContentEditable
  );
}
