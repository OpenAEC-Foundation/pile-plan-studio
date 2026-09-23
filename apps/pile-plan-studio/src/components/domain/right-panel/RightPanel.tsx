import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import type { PileConfigurationKey, PileCostSettings } from "../../../core/projectTypes.ts";
import { getSelectedLoadPoints, formatLoadPointPanelTitle } from "./rightPanelModel.ts";
import type {
  LoadPointGroup,
  LoadPointGroupEditAction,
  LoadPointGroupEditPreview,
} from "../../../core/loadPointGroupContract.ts";
import type { TechnicalAssignmentSnapshot } from "../../../app/derived-state/technicalAssignmentController.ts";
import type { GroupAssignmentAssessmentSnapshot } from "../../../app/derived-state/groupAssignmentAssessmentController.ts";
import "./rightPanel.css";
import SplitRightPanel from "./SplitRightPanel.tsx";
import { DEFAULT_RIGHT_PANEL_SPLIT } from "../../../domain/workspace/rightPanelLayout.ts";
import { switchRightPanelMode } from "../../../domain/workspace/selectionState.ts";
import { normalizePileOptionColumnLayouts, type PileOptionColumnLayouts, type PileOptionColumnLayout } from "../../../domain/pile-options/pileOptionColumnLayout.ts";
import CptPanel from "./CptPanel.tsx";
import LoadPointPanel from "./LoadPointPanel.tsx";
import GroupingSettingsPanel from "./GroupingSettingsPanel.tsx";
import CostSettingsPanel from "./CostSettingsPanel.tsx";
import CptSettingsPanel from "./CptSettingsPanel.tsx";
import { PanelTab, localizeLoadPointName } from "./PanelControls.tsx";

export type RightTaskPanel = "cpt-settings" | "cost-settings" | "grouping-settings" | "ilp-optimization";

export type RightPanelProps = {
  columnLayouts?: PileOptionColumnLayouts;
  onColumnLayoutChange?: (mode: keyof PileOptionColumnLayouts, layout: PileOptionColumnLayout) => void;
  splitRatio?: number;
  onSplitRatioChange?: (ratio: number) => void;
  ilpResult?: ReactNode;
  state: ProjectState;
  loadPointGroups?: LoadPointGroup[];
  technicalAssignment?: TechnicalAssignmentSnapshot;
  groupAssignmentAssessment?: GroupAssignmentAssessmentSnapshot;
  groupEditPending?: boolean;
  onPreviewLoadPointGroupEdit?: (
    action: LoadPointGroupEditAction,
    selectedLoadPointIds?: number[],
  ) => Promise<LoadPointGroupEditPreview | null>;
  onApplyLoadPointGroupEdit?: (
    action: LoadPointGroupEditAction,
    selectedLoadPointIds?: number[],
  ) => Promise<void>;
  onStateChange: (nextState: ProjectState) => void;
  pileAssignmentPending?: boolean;
  onApplyPileConfiguration?: (
    selectedLoadPointIds: number[],
    configuration: PileConfigurationKey | null,
  ) => void;
  taskPanel?: RightTaskPanel | null;
  onCloseTaskPanel?: () => void;
  hasPersonalCostDefault?: boolean;
  onSaveCostDefault?: (settings: PileCostSettings) => void;
  onLoadCostDefault?: () => void;
  onRemoveCostDefault?: () => void;
  onLoadBuiltInCosts?: () => void;
};

export default function RightPanel({
  columnLayouts = normalizePileOptionColumnLayouts(undefined),
  onColumnLayoutChange = () => undefined,
  ilpResult,
  splitRatio = DEFAULT_RIGHT_PANEL_SPLIT,
  onSplitRatioChange = () => undefined,
  state,
  loadPointGroups = [],
  technicalAssignment = {
    status: "idle",
    assessment: null,
    issuesByLoadPointId: new Map(),
    error: null,
  },
  groupAssignmentAssessment = {
    conflicts: [],
    conflictsByLoadPointId: new Map(),
    pending: false,
    error: null,
  },
  groupEditPending = false,
  onPreviewLoadPointGroupEdit = async () => null,
  onApplyLoadPointGroupEdit = async () => undefined,
  onStateChange,
  pileAssignmentPending = false,
  onApplyPileConfiguration = () => undefined,
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

  const loadPointContent = selectedLoadPoints.length === 0 ? (
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
      groupAssignmentAssessment={groupAssignmentAssessment}
      groupEditPending={groupEditPending}
      onPreviewLoadPointGroupEdit={onPreviewLoadPointGroupEdit}
      onApplyLoadPointGroupEdit={onApplyLoadPointGroupEdit}
      columnLayouts={columnLayouts}
      onColumnLayoutChange={onColumnLayoutChange}
    />
  );
  const cptContent = <CptPanel state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} />;

  return (
    <aside className="properties-panel" aria-label={t("aria.properties")}>
      <div className="right-panel-tabs" aria-label={t("aria.views")}>
        <PanelTab active={taskPanel === null} label={t("tabs.loadPoint")} mode="load-point" state={state} onActivate={onCloseTaskPanel} onStateChange={onStateChange} />
        <PanelTab active={taskPanel === null} label={t("tabs.cpts")} mode="cpts" state={state} onActivate={onCloseTaskPanel} onStateChange={onStateChange} />
        <button className={`right-panel-tab right-panel-combined-toggle${taskPanel === null && state.rightPanelMode === "combined" ? " is-active" : ""}`}
          type="button" title={t("tabs.combined")} aria-label={t("tabs.combined")}
          aria-pressed={taskPanel === null && state.rightPanelMode === "combined"}
          onClick={() => { onCloseTaskPanel(); onStateChange({ ...state, ...switchRightPanelMode(state, "combined") }); }}>
          <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2.5" y="2.5" width="15" height="15" rx="1.5" /><path d="M3 12h14" />
          </svg>
        </button>
      </div>
      {taskPanel === "ilp-optimization" ? ilpResult : taskPanel === "cost-settings" ? (
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
        <GroupingSettingsPanel
          state={state}
          loadPointGroups={loadPointGroups}
          groupEditPending={groupEditPending}
          onPreviewLoadPointGroupEdit={onPreviewLoadPointGroupEdit}
          onApplyLoadPointGroupEdit={onApplyLoadPointGroupEdit}
          onStateChange={onStateChange}
          onClose={onCloseTaskPanel}
        />
      ) : state.rightPanelMode === "cpts" ? cptContent : state.rightPanelMode === "combined" ? (
        <SplitRightPanel top={loadPointContent} bottom={cptContent} ratio={splitRatio} onRatioChange={onSplitRatioChange} />
      ) : loadPointContent}
    </aside>
  );
}

