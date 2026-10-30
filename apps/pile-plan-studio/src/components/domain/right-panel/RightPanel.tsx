import PileCapProposalControl from "./PileCapProposalControl.tsx";
import PileCapChangesPanel from "./PileCapChangesPanel.tsx";
import { findSelectedPileCapGroup, pileCapGroupKey } from "../../../domain/pile-plans/pileCapProposals.ts";
import type { PileCapProposalResult, PileCapProposal } from "../../../core/pileCapProposalTypes.ts";
import { useTranslation } from "react-i18next";
import { useState, type ReactNode } from "react";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import type { PileConfigurationKey, PileCostSettings } from "../../../core/projectTypes.ts";
import type { CostCatalogAction } from "../../../core/settingsEditCoreClient.ts";
import { getSelectedLoadPoints } from "./rightPanelModel.ts";
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
import { PanelTab } from "./PanelControls.tsx";
import { getLoadPointSelectionContext } from "../../../domain/workspace/loadPointSelectionList.ts";
import { synchronizeManualCptSelection } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import SelectionOverview, { type SelectionOverviewLayout } from "./SelectionOverview.tsx";
import LoadPointGroupEditButton from "./LoadPointGroupEditButton.tsx";
import { setLoadPointSelection } from "../../../domain/workspace/selectionState.ts";
import type { CptEditCompletion, CptSelectionMethod } from "../../../app/project/manualCptEditController.ts";

export type RightTaskPanel = "cpt-settings" | "cost-settings" | "grouping-settings" | "ilp-optimization" | "pile-cap-changes";

export type RightPanelProps = {
  pileCapResult?: PileCapProposalResult | null;
  pileCapPending?: boolean;
  pileCapError?: boolean;
  onEditPileCap?: (proposal:PileCapProposal,remove?:boolean)=>void;
  onResetAllPileCaps?: () => void;

  columnLayouts?: PileOptionColumnLayouts;
  onColumnLayoutChange?: (mode: keyof PileOptionColumnLayouts, layout: PileOptionColumnLayout) => void;
  splitRatio?: number;
  selectionRows?: number;
  selectionCollapsed?: boolean;
  onSelectionLayoutChange?: (patch: Partial<SelectionOverviewLayout>) => void;
  onSplitRatioChange?: (ratio: number) => void;
  ilpResult?: ReactNode;
  state: ProjectState;
  cptEditPending?: boolean;
  onSaveCptSelection?: (afterSave?: CptEditCompletion) => Promise<void>;
  onApplyCptMethod?: (method: CptSelectionMethod) => Promise<void>;
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
  onSelectLoadPoints?: (ids: number[]) => void;
  pileAssignmentPending?: boolean;
  onApplyPileConfiguration?: (
    selectedLoadPointIds: number[],
    configuration: PileConfigurationKey | null,
  ) => void;
  taskPanel?: RightTaskPanel | null;
  onCloseTaskPanel?: () => void;
  hasPersonalCostDefault?: boolean;
  onEditCosts?: (actions: CostCatalogAction[]) => Promise<boolean>;
  onSaveCostDefault?: (settings: PileCostSettings) => void;
  onLoadCostDefault?: () => void;
  onRemoveCostDefault?: () => void;
  onLoadBuiltInCosts?: () => void;
};

export default function RightPanel({
  pileCapResult=null, pileCapPending=false, pileCapError=false, onEditPileCap=()=>{},
  onResetAllPileCaps = () => undefined,
  columnLayouts = normalizePileOptionColumnLayouts(undefined),
  onColumnLayoutChange = () => undefined,
  ilpResult,
  splitRatio = DEFAULT_RIGHT_PANEL_SPLIT,
  selectionRows = 4,
  selectionCollapsed = false,
  onSelectionLayoutChange = () => undefined,
  onSplitRatioChange = () => undefined,
  state,
  cptEditPending = false,
  onSaveCptSelection,
  onApplyCptMethod,
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
  onStateChange: publishState,
  onSelectLoadPoints,
  pileAssignmentPending = false,
  onApplyPileConfiguration = () => undefined,
  taskPanel = null,
  onCloseTaskPanel = () => undefined,
  hasPersonalCostDefault = false,
  onEditCosts = async () => false,
  onSaveCostDefault = () => undefined,
  onLoadCostDefault = () => undefined,
  onRemoveCostDefault = () => undefined,
  onLoadBuiltInCosts = () => undefined,
}: RightPanelProps) {
  const { t } = useTranslation("rightPanel");
  const selectedLoadPoints = getSelectedLoadPoints(state);
  const [pileCapOpen,setPileCapOpen]=useState(false);
  const capIds=findSelectedPileCapGroup(state.selectedLoadPointIds,loadPointGroups);
  const capPlan=state.pilePlans.find(p=>p.id===state.activePilePlanId);
  const capProposal=capIds?capPlan?.pileCapProposals?.find(p=>pileCapGroupKey(p.load_point_ids)===pileCapGroupKey(capIds))??null:null;
  const capPreview=capProposal?pileCapResult?.plans.find(p=>p.plan_id===state.activePilePlanId)?.previews.find(p=>pileCapGroupKey(p.proposal.load_point_ids)===pileCapGroupKey(capProposal.load_point_ids))??null:null;
  const invalidCaps=(pileCapResult?.plans.find(p=>p.plan_id===state.activePilePlanId)?.previews??[]).filter(p=>p.status==='group_changed'&&(p.proposal.load_point_ids.some(id=>state.selectedLoadPointIds.includes(id))||!p.proposal.load_point_ids.some(id=>state.loadPoints.some(point=>point.id===id))));
  const capDisabled=groupEditPending||cptEditPending||pileCapPending||pileAssignmentPending||state.cptSelectionEditDraft!==null||state.loadPointLockDraft!==null;

  const selectionContextIds = getLoadPointSelectionContext(state, loadPointGroups);
  const onStateChange = (next: ProjectState) => publishState(synchronizeManualCptSelection(next));
  const changePanelView = (next: ProjectState) => {
    if (state.cptSelectionEditDraft && next.rightPanelMode === "load-point") {
      void onSaveCptSelection?.(current => ({ ...current, ...switchRightPanelMode(current, "load-point") }));
    } else onStateChange(next);
  };

  const loadPointContent = selectedLoadPoints.length === 0 ? (
    <div className="right-panel-empty">
      <strong>{t("empty.noLoadPoint")}</strong>
      <span>{t("empty.selectLoadPoints")}</span>
    </div>
  ) : (
    <LoadPointPanel
      pileCapProposal={state.cptSelectionEditDraft||state.loadPointLockDraft?null:capProposal} pileCapPreview={capPreview} pileCapPending={pileCapPending} pileCapError={pileCapError}
      onPileCapConfigurationChange={configuration=>capProposal&&onEditPileCap({...capProposal,configuration})}
      state={state}
      onStateChange={onStateChange}
      pileAssignmentPending={pileAssignmentPending}
      onApplyPileConfiguration={onApplyPileConfiguration}
      selectedLoadPoints={selectedLoadPoints}
      loadPointGroups={loadPointGroups}
      technicalAssignment={technicalAssignment}
      groupAssignmentAssessment={groupAssignmentAssessment}
      columnLayouts={columnLayouts}
      onColumnLayoutChange={onColumnLayoutChange}
    />
  );
  const cptContent = <CptPanel saving={cptEditPending} onSave={onSaveCptSelection} onApplyMethod={onApplyCptMethod} state={state} onStateChange={onStateChange} selectedLoadPoints={selectedLoadPoints} />;

  return (
    <aside className="properties-panel" aria-label={t("aria.properties")}>
      <div className="right-panel-tabs" aria-label={t("aria.views")}>
        <PanelTab active={taskPanel === null} label={t("tabs.loadPoint")} mode="load-point" state={state} onActivate={onCloseTaskPanel} onStateChange={changePanelView} />
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
      {taskPanel === null ? <SelectionOverview loadPoints={state.loadPoints} selectedIds={state.selectedLoadPointIds}
        restrictToContext={state.loadPointSelectionContext?.exclusive??false}
        onSelectOnly={id=>onStateChange({...state,...setLoadPointSelection(state,[id],{context:{loadPoints:state.loadPoints,ids:[id],exclusive:true}})})}
        contextIds={selectionContextIds} groups={loadPointGroups} rows={selectionRows} collapsed={selectionCollapsed}
        onLayoutChange={onSelectionLayoutChange} disabled={cptEditPending}
        onSelect={ids => onStateChange({ ...state, ...setLoadPointSelection(state, ids,
          { context: { loadPoints: state.loadPoints, ids: selectionContextIds } }) })}
        groupControl={<span className="selection-overview-actions">{selectedLoadPoints.length > 1 ? <LoadPointGroupEditButton editPending={groupEditPending || cptEditPending}
          groups={loadPointGroups} selectedLoadPointIds={state.selectedLoadPointIds}
          onApply={onApplyLoadPointGroupEdit} onPreview={onPreviewLoadPointGroupEdit} /> : null}
          {capIds?<button className="pile-cap-toggle" type="button" aria-expanded={pileCapOpen} onClick={()=>setPileCapOpen(!pileCapOpen)}>{t("pileCap.title")}</button>:null}</span>}
        extraContent={<>{pileCapOpen&&capIds?<PileCapProposalControl state={state} ids={capIds} proposal={capProposal} preview={capPreview} pending={capDisabled} onEdit={onEditPileCap}/>:null}
          {invalidCaps.map(cap=><div className="pile-cap-invalid" role="status" key={pileCapGroupKey(cap.proposal.load_point_ids)}><span>{t("pileCap.groupChanged")}</span><button type="button" disabled={capDisabled} onClick={()=>onEditPileCap(cap.proposal,true)}>{t("pileCap.remove")}</button></div>)}</>}/>:null}
      {taskPanel === "pile-cap-changes" ? <PileCapChangesPanel
        state={state}
        previews={pileCapResult?.plans.find(plan => plan.plan_id === state.activePilePlanId)?.previews ?? []}
        selectionPending={cptEditPending}
        resetDisabled={capDisabled}
        onResetAll={onResetAllPileCaps}
        selectionControls={capIds ? <section className="pile-cap-changes-selection" aria-label={t("selectionOverview.title")}>
          <h3>{t("selectionOverview.title")} <span>{capIds.join(", ")}</span></h3>
          <PileCapProposalControl state={state} ids={capIds} proposal={capProposal} preview={capPreview}
            pending={capDisabled} onEdit={onEditPileCap} />
        </section> : null}
        onSelect={ids => onSelectLoadPoints ? onSelectLoadPoints(ids)
          : onStateChange({ ...state, ...setLoadPointSelection({ ...state, rightPanelMode: "load-point" }, ids) })}
        onClose={onCloseTaskPanel}
      /> : taskPanel === "ilp-optimization" ? ilpResult : taskPanel === "cost-settings" ? (
        <CostSettingsPanel
          state={state}
          onEditCosts={onEditCosts}
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

