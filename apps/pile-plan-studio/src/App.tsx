import { useEffect, useRef, useState } from "react";
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
import { createInitialProjectState } from "./domain/projectState";
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
  const [theme, setTheme] = useState("light");
  const [costDefaultsLoaded, setCostDefaultsLoaded] = useState(false);
  const defaultSelectionRequestRef = useRef<typeof projectState.analysisRequest | null>(null);

  const downloadProject = async () => {
    const project = createIfcppProject({
      name: projectState.name,
      loadPoints: projectState.loadPoints,
      cpts: projectState.cpts,
      bearingCapacities: projectState.bearingCapacities,
      globalCptSelectionSettings: projectState.globalCptSelectionSettings,
      cptSelectionSettingsByLoadPoint: projectState.cptSelectionSettingsByLoadPoint,
      pileCostSettings: projectState.pileCostSettings,
      optimizationSettings: projectState.optimizationSettings,
      activePileSizes: projectState.activePileSizes,
      activePileTipLevels: projectState.activePileTipLevels,
      selectedPileOptionKeysByLoadPoint: projectState.selectedPileOptionKeysByLoadPoint,
      manualCptIdsByLoadPoint: projectState.manualCptIdsByLoadPoint,
    });
    const text = await writeIfcppProjectCore(project);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${projectState.name.replace(/[^a-z0-9-_]+/gi, "-") || "pile-plan-project"}.ifcpp`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    getSetting("theme", "light").then((saved) => {
      setTheme(saved);
      applyTheme(saved);
    });
  }, []);

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
      setProjectState((current) => current.analysisRequest !== analysisRequest ? current : ({
        ...current,
        selectedPileOptionKeysByLoadPoint: choices,
        defaultPileSelectionPending: false,
        analysisError: null,
      }));
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

  return (
    <>
      <div className="app-shell" data-testid="openaec-shell">
        <TitleBar onSave={() => void downloadProject()} onSettingsClick={() => setSettingsOpen(true)} onFeedbackClick={() => setFeedbackOpen(true)} />
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
        <div className="app-content">
          <aside className="project-explorer" aria-label="Project explorer">
            <div className="panel-heading">{t("explorer")}</div>
            <div className="project-tree">
              <div className="project-tree-section">
                <div className="project-tree-label">Project</div>
                <button className="project-tree-item active" type="button">
                  <span>{projectState.name}</span>
                  <small>IFCPP</small>
                </button>
                <button className="project-tree-item" type="button">
                  <span>Pile plan</span>
                  <small>Viewer</small>
                </button>
              </div>
              <div className="project-tree-section">
                <div className="project-tree-label">Input sources</div>
                {projectState.inputSources.map((source) => (
                  <button className="project-tree-item" type="button" key={source.kind}>
                    <span>{source.label}</span>
                    <small>{source.itemCount.toLocaleString("en-US")} rows · {source.status}</small>
                  </button>
                ))}
              </div>
            </div>
          </aside>
          <main className="workspace" aria-label="Pile plan workspace">
            <PilePlanWorkspace state={projectState} onStateChange={setProjectState} />
          </main>
          <RightPanel
            state={projectState}
            onStateChange={setProjectState}
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
        onImportProject={async (projectName: string, sources: ImportSourceInput[]) => {
          const project = await importProjectFromFilesCore({ projectName, sources });
          const withCosts = applyDefaultPileCostSettings(project, projectState.pileCostSettings);
          setProjectState(createInitialProjectState(withCosts, { initializeDefaultPiles: true }));
          return getImportSummary(project);
        }}
        onOpenProjectFile={async (file: File) => {
          const project = createInitialProjectState(
            await file.text(),
            { initializeDefaultPiles: false },
          );
          setProjectState(project);
        }}
        onDownloadProject={downloadProject}
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
        onSave={(name) => setProjectState((current) => ({ ...current, name }))}
      />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
