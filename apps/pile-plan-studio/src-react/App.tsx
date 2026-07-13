import { useEffect, useState } from "react";
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
import {
  calculatePileCostCore,
  calculateProjectAnalysisCore,
  importProjectFromFilesCore,
} from "../src/coreClient";
import type { ImportSourceInput } from "../src/coreImportContract";
import { applyDefaultPileCostSettings, createIfcppProject, getImportSummary } from "../src/projectFile";
import { writeIfcppProjectCore } from "../src/coreClient";
import { createInitialProjectState } from "./domain/projectState";
import { getSetting } from "./store";
import { optionKey } from "./components/domain/rightPanelModel";
import type { PileCostSettings } from "../src/projectTypes";

const PILE_COST_DEFAULTS_KEY = "pile-cost-defaults";

export default function App() {
  const { t } = useTranslation();
  const [projectState, setProjectState] = useState(() => createInitialProjectState(sampleProjectText));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backstageOpen, setBackstageOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [theme, setTheme] = useState("light");

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
    getSetting<PileCostSettings | null>(PILE_COST_DEFAULTS_KEY, null).then((saved) => {
      if (saved?.items.length) {
        setProjectState((current) => ({ ...current, pileCostSettings: saved }));
      }
    });
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

  return (
    <>
      <div className="app-shell" data-testid="openaec-shell">
        <TitleBar onSettingsClick={() => setSettingsOpen(true)} onFeedbackClick={() => setFeedbackOpen(true)} />
        <Ribbon
          onFileTabClick={() => setBackstageOpen(true)}
          onSettingsClick={() => setSettingsOpen(true)}
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
          <RightPanel state={projectState} onStateChange={setProjectState} />
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
          setProjectState(createInitialProjectState(withCosts));
          return getImportSummary(project);
        }}
        onOpenProjectFile={async (file: File) => {
          const project = createInitialProjectState(await file.text());
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
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
