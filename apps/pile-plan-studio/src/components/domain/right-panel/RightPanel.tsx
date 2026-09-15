import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/projectState.ts";
import type { PileConfigurationKey, PileCostSettings } from "../../../core/projectTypes.ts";
import { getSelectedLoadPoints, formatLoadPointPanelTitle } from "./rightPanelModel.ts";
import OptimizationPanel from "../pile-plans/OptimizationPanel.tsx";
import type { LoadPointGroup } from "../../../core/loadPointGroupContract.ts";
import type { TechnicalAssignmentSnapshot } from "../technicalAssignmentController.ts";
import "./rightPanel.css";
import CptPanel from "./CptPanel.tsx";
import LoadPointPanel from "./LoadPointPanel.tsx";
import GroupingSettingsPanel from "./GroupingSettingsPanel.tsx";
import CostSettingsPanel from "./CostSettingsPanel.tsx";
import CptSettingsPanel from "./CptSettingsPanel.tsx";
import { PanelTab, localizeLoadPointName } from "./PanelControls.tsx";

export type RightTaskPanel = "cpt-settings" | "cost-settings" | "grouping-settings" | "optimization";

export type RightPanelProps = {
  state: ProjectState;
  loadPointGroups?: LoadPointGroup[];
  technicalAssignment?: TechnicalAssignmentSnapshot;
  onStateChange: (nextState: ProjectState) => void;
  pileAssignmentPending?: boolean;
  onApplyPileConfiguration?: (
    selectedLoadPointIds: number[],
    configuration: PileConfigurationKey | null,
  ) => void;
  onRunOptimization?: () => void;
  taskPanel?: RightTaskPanel | null;
  onCloseTaskPanel?: () => void;
  hasPersonalCostDefault?: boolean;
  onSaveCostDefault?: (settings: PileCostSettings) => void;
  onLoadCostDefault?: () => void;
  onRemoveCostDefault?: () => void;
  onLoadBuiltInCosts?: () => void;
};

export default function RightPanel({
  state,
  loadPointGroups = [],
  technicalAssignment = {
    status: "idle",
    assessment: null,
    issuesByLoadPointId: new Map(),
    error: null,
  },
  onStateChange,
  pileAssignmentPending = false,
  onApplyPileConfiguration = () => undefined,
  onRunOptimization = () => undefined,
  taskPanel = null,
  onCloseTaskPanel = () => undefined,
  hasPersonalCostDefault = false,
  onSaveCostDefault = () => undefined,
  onLoadCostDefault = () => undefined,
  onRemoveCostDefault = () => undefined,
  onLoadBuiltInCosts = () => undefined,
}: RightPanelProps) {
  const { t } = useTranslation("rightPanel");
  const selectedLoadPoints = getSelectedLoadPoints(state);
  const selectedLabel = selectedLoadPoints.length === 1
    ? localizeLoadPointName(formatLoadPointPanelTitle(selectedLoadPoints[0].name), t)
    : t("loadPoints.count", { count: selectedLoadPoints.length });

  return (
    <aside className="properties-panel" aria-label={t("aria.properties")}>
      <div className="right-panel-tabs" aria-label={t("aria.views")}>
        <PanelTab active={taskPanel === null} label={t("tabs.loadPoint")} mode="load-point" state={state} onActivate={onCloseTaskPanel} onStateChange={onStateChange} />
        <PanelTab active={taskPanel === null} label={t("tabs.cpts")} mode="cpts" state={state} onActivate={onCloseTaskPanel} onStateChange={onStateChange} />
      </div>
      {taskPanel === "optimization" ? (
        <OptimizationPanel state={state} technicalAssessmentStatus={technicalAssignment.status} onStateChange={onStateChange} onRunOptimization={onRunOptimization} onClose={onCloseTaskPanel} />
      ) : taskPanel === "cost-settings" ? (
        <CostSettingsPanel
          state={state}
          onStateChange={onStateChange}
          onClose={onCloseTaskPanel}
          hasPersonalCostDefault={hasPersonalCostDefault}
          onSaveCostDefault={onSaveCostDefault}
          onLoadCostDefault={onLoadCostDefault}
          onRemoveCostDefault={onRemoveCostDefault}
          onLoadBuiltInCosts={onLoadBuiltInCosts}
        />
      ) : taskPanel === "cpt-settings" ? (
        <CptSettingsPanel state={state} onStateChange={onStateChange} onClose={onCloseTaskPanel} />
      ) : taskPanel === "grouping-settings" ? (
        <GroupingSettingsPanel state={state} onStateChange={onStateChange} onClose={onCloseTaskPanel} />
      ) : state.rightPanelMode === "cpts" ? (
        <CptPanel state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} />
      ) : selectedLoadPoints.length === 0 ? (
        <div className="right-panel-empty">
          <strong>{t("empty.noLoadPoint")}</strong>
          <span>{t("empty.selectLoadPoints")}</span>
        </div>
      ) : (
        <LoadPointPanel
          state={state}
          onStateChange={onStateChange}
          pileAssignmentPending={pileAssignmentPending}
          onApplyPileConfiguration={onApplyPileConfiguration}
          selectedLabel={selectedLabel}
          selectedLoadPoints={selectedLoadPoints}
          loadPointGroups={loadPointGroups}
          technicalAssignment={technicalAssignment}
        />
      )}
    </aside>
  );
}

