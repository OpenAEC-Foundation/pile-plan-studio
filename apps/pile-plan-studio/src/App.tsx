import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import sampleProjectText from "../../../sample_project/sample_project.ifcpp?raw";
import TitleBar from "./components/template/TitleBar";
import Ribbon from "./components/template/ribbon/Ribbon";
import Backstage from "./components/template/backstage/Backstage";
import SettingsDialog, { applyTheme } from "./components/template/settings/SettingsDialog";
import FeedbackDialog from "./components/template/feedback/FeedbackDialog";
import StatusBar from "./components/template/StatusBar";
import PilePlanWorkspace from "./components/domain/PilePlanWorkspace";
import RightPanel from "./components/domain/RightPanel";
import ProjectInformationDialog from "./components/domain/ProjectInformationDialog";
import UnsavedChangesDialog from "./components/domain/UnsavedChangesDialog.tsx";
import {
  calculatePileCostCore,
  calculateProjectAnalysisCore,
  chooseDefaultPileOptionsCore,
  greedyOptimizeCore,
  importProjectFromFilesCore,
} from "./core/coreClient";
import type { ImportSourceInput } from "./core/coreImportContract";
import { applyDefaultPileCostSettings, createIfcppProject, getImportSummary } from "./core/projectFile";
import { writeIfcppProjectCore } from "./core/coreClient";
import { createInitialProjectState, type ProjectState } from "./domain/projectState";
import { getSetting } from "./store";
import { optionKey } from "./components/domain/rightPanelModel";
import type { PileCostSettings } from "./core/projectTypes";
import { buildGreedyOptimizationSettings } from "./domain/optimizationSettings";
import {
  applyOptimizationChoices,
  clampOptimizationLimits,
  getOptimizationTargetIds,
} from "./components/domain/optimizationPanelModel";
import { switchRightPanelMode } from "./domain/selectionState";
import { getProjectFileCommands, isDesktopRuntime, projectFileName, saveGeneratedFile, savePreparedFile } from "./domain/projectPersistence.ts";
import { DEFAULT_RIGHT_PANEL_WIDTH, resizeRightPanelWidth } from "./viewer/panelLayout.ts";

const PILE_COST_DEFAULTS_KEY = "pile-cost-defaults";

export default function App() {
  const { t } = useTranslation();
  const [projectState, setProjectState] = useState(() => createInitialProjectState(
    sampleProjectText,
    { initializeDefaultPiles: true },
  ));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backstageOpen, setBackstageOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [projectInformationOpen, setProjectInformationOpen] = useState(false);
  const [rightTaskPanel, setRightTaskPanel] = useState<"optimization" | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [unsavedChangesOpen, setUnsavedChangesOpen] = useState(false);
  const appContentRef = useRef<HTMLDivElement | null>(null);
  const rightPanelWidthRef = useRef(DEFAULT_RIGHT_PANEL_WIDTH);
  const [theme, setTheme] = useState("light");
  const [costDefaultsLoaded, setCostDefaultsLoaded] = useState(false);
  const defaultSelectionRequestRef = useRef<typeof projectState.analysisRequest | null>(null);
  const replacementResolverRef = useRef<((proceed: boolean) => void) | null>(null);
  const savedProjectSignatureRef = useRef(JSON.stringify(projectFromState(projectState)));
  const preparedProjectRef = useRef<{ signature: string; blob: Blob } | null>(null);
  const isDesktop = isDesktopRuntime();
  const projectFileCommands = getProjectFileCommands(isDesktop);
  const persistedProject = projectFromState(projectState);
  const persistedProjectSignature = JSON.stringify(persistedProject);

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
    savedProjectSignatureRef.current = JSON.stringify(projectFromState(projectState));
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
    savedProjectSignatureRef.current = JSON.stringify(projectFromState(projectState));
    setIsDirty(false);
    return true;
  };

  const saveProject = async (): Promise<boolean> => {
    if (!isDesktop) return downloadProject();
    if (!projectPath) return saveProjectAs();
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_project_file", { path: projectPath, contents: await serializeProject() });
    savedProjectSignatureRef.current = JSON.stringify(projectFromState(projectState));
    setIsDirty(false);
    return true;
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
    setProjectState(nextState);
    setIsDirty(JSON.stringify(projectFromState(nextState)) !== savedProjectSignatureRef.current);
  };

  useEffect(() => {
    getSetting("theme", "light").then((saved) => {
      setTheme(saved);
      applyTheme(saved);
    });
  }, []);

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
    getSetting<PileCostSettings | null>(PILE_COST_DEFAULTS_KEY, null)
      .then((saved) => {
        if (saved?.items.length) {
          setProjectState((current) => ({ ...current, pileCostSettings: saved }));
        }
      })
      .finally(() => setCostDefaultsLoaded(true));
  }, []);

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
      !costDefaultsLoaded
      || !projectState.defaultPileSelectionPending
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
      setProjectState((current) => {
        if (current.analysisRequest !== analysisRequest) return current;
        const next = {
          ...current,
          selectedPileOptionKeysByLoadPoint: choices,
          defaultPileSelectionPending: false,
          analysisError: null,
        };
        if (savedProjectSignatureRef.current !== "") {
          savedProjectSignatureRef.current = JSON.stringify(projectFromState(next));
          setIsDirty(false);
        }
        return next;
      });
    }).catch((error: unknown) => {
      console.error("Failed to choose default pile options", error);
      setProjectState((current) => current.analysisRequest !== analysisRequest ? current : ({
        ...current,
        defaultPileSelectionPending: false,
        analysisError: error instanceof Error ? error.message : String(error),
      }));
    }).finally(() => {
      if (defaultSelectionRequestRef.current === analysisRequest) {
        defaultSelectionRequestRef.current = null;
      }
    });
  }, [
    costDefaultsLoaded,
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
      setProjectState((current) => current.analysisRequest !== snapshot.analysisRequest ? current : ({
        ...current,
        selectedPileOptionKeysByLoadPoint: applied.choices,
        activePileSizes: applied.activePileSizes,
        activePileTipLevels: applied.activePileTipLevels,
        optimizationSettings: settings,
        optimizationRunning: false,
        optimizationError: null,
        optimizationSummary: applied.summary,
      }));
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
    setProjectState(project);
    setProjectPath(path);
    savedProjectSignatureRef.current = JSON.stringify(projectFromState(project));
    setIsDirty(false);
  };

  const openDesktopProjectPath = async (path: string) => {
    if (!await confirmProjectReplacement()) return;
    const { invoke } = await import("@tauri-apps/api/core");
    const text = await invoke<string>("read_project_file", { path });
    installOpenedProject(createInitialProjectState(text, { initializeDefaultPiles: false }), path);
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
          onOpenOptimizationSettings={() => setRightTaskPanel("optimization")}
          onRunOptimization={runGreedyOptimization}
          optimizationDisabled={optimizationDisabled}
        />
        <div
          className="app-content"
          ref={appContentRef}
          style={{ "--right-panel-width": `${DEFAULT_RIGHT_PANEL_WIDTH}px` } as CSSProperties}
        >
          <aside className="project-explorer" aria-label={t("projectExplorer.aria")}>
            <div className="panel-heading">{t("explorer")}</div>
            <div className="project-tree">
              <div className="project-tree-section">
                <div className="project-tree-label">{t("projectExplorer.project")}</div>
                <button className="project-tree-item active" type="button">
                  <span>{projectState.name}{isDirty ? " *" : ""}</span>
                  <small>IFCPP</small>
                </button>
                <button className="project-tree-item" type="button">
                  <span>{t("projectExplorer.pilePlan")}</span>
                  <small>{t("projectExplorer.viewer")}</small>
                </button>
              </div>
              <div className="project-tree-section">
                <div className="project-tree-label">{t("projectExplorer.inputSources")}</div>
                {projectState.inputSources.map((source) => (
                  <button className="project-tree-item" type="button" key={source.kind}>
                    <span>{t(`projectExplorer.sources.${source.kind}`)}</span>
                    <small>{t("projectExplorer.rows", { count: source.itemCount })} · {t(`projectExplorer.statuses.${source.status}`)}</small>
                  </button>
                ))}
              </div>
            </div>
          </aside>
          <main className="workspace" aria-label="Pile plan workspace">
            <PilePlanWorkspace state={projectState} onStateChange={handleProjectStateChange} />
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
        <StatusBar />
      </div>
      <Backstage
        open={backstageOpen}
        onClose={() => setBackstageOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        commands={projectFileCommands}
        onImportProject={async (projectName: string, sources: ImportSourceInput[]) => {
          if (!await confirmProjectReplacement()) return null;
          const project = await importProjectFromFilesCore({ projectName, sources });
          const withCosts = applyDefaultPileCostSettings(project, projectState.pileCostSettings);
          setProjectState(createInitialProjectState(withCosts, { initializeDefaultPiles: true }));
          setProjectPath(null);
          savedProjectSignatureRef.current = "";
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
        onOpenFile={(path) => void openDesktopProjectPath(path)}
        onChooseDesktopProject={chooseDesktopProject}
        onDownloadProject={async () => { await downloadProject(); }}
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
  return createIfcppProject({
    name: state.name,
    loadPoints: state.loadPoints,
    cpts: state.cpts,
    bearingCapacities: state.bearingCapacities,
    globalCptSelectionSettings: state.globalCptSelectionSettings,
    cptSelectionSettingsByLoadPoint: state.cptSelectionSettingsByLoadPoint,
    pileCostSettings: state.pileCostSettings,
    optimizationSettings: state.optimizationSettings,
    activePileSizes: state.activePileSizes,
    activePileTipLevels: state.activePileTipLevels,
    selectedPileOptionKeysByLoadPoint: state.selectedPileOptionKeysByLoadPoint,
    manualCptIdsByLoadPoint: state.manualCptIdsByLoadPoint,
  });
}
