import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import RibbonGroup from "./RibbonGroup";
import { Button, Slider, Tabs } from "../../../openaec/react/src/index";
import "../../../openaec/openaec-components.css";
import BlueprintIcon from "../BlueprintIcon.tsx";
import type { ForegroundLayer } from "../../../domain/settings/viewerPreferences.ts";
import PilePlanIcon from "../PilePlanIcon.tsx";
import { getTipLevelRegionToggle } from "./tipLevelRegionToggle.ts";
import "./Ribbon.css";
import "./PlanRibbon.css";
import {useLoadDirection} from "../../../app/derived-state/LoadDirectionContext.tsx";
import UtilizationRangeSlider from "./UtilizationRangeSlider.tsx";
import RibbonNumericValue from "./RibbonNumericValue.tsx";
import type { RightTaskPanel } from "../../domain/right-panel/RightPanel.tsx";

type TabId = "plan" | "view";

const TABS: TabId[] = ["plan", "view"];

interface RibbonProps {
  onFileTabClick?: () => void;
  onOpenProjectInformation?: () => void;
  onOpenTaskPanel?: (panel: RightTaskPanel) => void;
  isLassoSelectionActive: boolean;
  lassoSelectionDisabled: boolean;
  onToggleLassoSelection: () => void;
  isLockEditing: boolean;
  onStartLockEditing: () => void;
  onApplyLockEditing: () => void;
  onCancelLockEditing: () => void;
  onUnlockAll: () => void;
  symbolScalePercent: number;
  viewerUtilizationMinimum: number;
  viewerUtilizationMaximum: number;
  foregroundLayer: ForegroundLayer;
  showGrid: boolean;
  showTipLevelRegions: boolean;
  showLoadPointGroups: boolean;
  explorerVisible: boolean;
  propertiesVisible: boolean;
  onSymbolScaleChangeStart: () => void;
  onSymbolScaleChange: (value: number) => void;
  onSymbolScaleChangeEnd: () => void;
  onViewerUtilizationRangeChange: (minimum: number, maximum: number) => void;
  onForegroundLayerChange: (value: ForegroundLayer) => void;
  onGridVisibilityChange: (visible: boolean) => void;
  onTipLevelRegionVisibilityChange: (visible: boolean) => void;
  onLoadPointGroupVisibilityChange: (visible: boolean) => void;
  onExplorerVisibilityChange: (visible: boolean) => void;
  onPropertiesVisibilityChange: (visible: boolean) => void;
}

export default function Ribbon({
  onFileTabClick,
  onOpenProjectInformation,
  onOpenTaskPanel,
  isLassoSelectionActive,
  lassoSelectionDisabled,
  onToggleLassoSelection,
  isLockEditing,
  onStartLockEditing,
  onApplyLockEditing,
  onCancelLockEditing,
  onUnlockAll,
  symbolScalePercent,
  viewerUtilizationMinimum,
  viewerUtilizationMaximum,
  foregroundLayer,
  showGrid,
  showTipLevelRegions,
  showLoadPointGroups,
  explorerVisible,
  propertiesVisible,
  onSymbolScaleChangeStart,
  onSymbolScaleChange,
  onSymbolScaleChangeEnd,
  onViewerUtilizationRangeChange,
  onForegroundLayerChange,
  onGridVisibilityChange,
  onTipLevelRegionVisibilityChange,
  onLoadPointGroupVisibilityChange,
  onExplorerVisibilityChange,
  onPropertiesVisibilityChange,
}: RibbonProps) {
  const { t } = useTranslation("ribbon");
  const {t:common}=useTranslation("common");
  const {mode,setMode}=useLoadDirection();
  const tipLevelRegionToggle = getTipLevelRegionToggle(showTipLevelRegions);
  const [activeTab, setActiveTab] = useState<TabId>("plan");
  const [utilizationDraft, setUtilizationDraft] = useState({
    minimum: viewerUtilizationMinimum,
    maximum: viewerUtilizationMaximum,
  });
  const utilizationDraftRef = useRef(utilizationDraft);
  const committedUtilizationRef = useRef(utilizationDraft);
  const symbolScaleKeyActiveRef = useRef(false);
  const [symbolScaleDraft,setSymbolScaleDraft]=useState(symbolScalePercent);
  const symbolScaleDraftRef=useRef(symbolScalePercent),committedSymbolScaleRef=useRef(symbolScalePercent);
  useEffect(()=>{
    symbolScaleDraftRef.current=symbolScalePercent;
    committedSymbolScaleRef.current=symbolScalePercent;
    setSymbolScaleDraft(symbolScalePercent);
  },[symbolScalePercent]);
  const finishSymbolScale=()=>{
    const value=symbolScaleDraftRef.current;
    if(value!==committedSymbolScaleRef.current){
      committedSymbolScaleRef.current=value;
      onSymbolScaleChange(value);
    }
    onSymbolScaleChangeEnd();
  };
  useEffect(() => {
    const range = {
      minimum: viewerUtilizationMinimum,
      maximum: viewerUtilizationMaximum,
    };
    utilizationDraftRef.current = range;
    committedUtilizationRef.current = range;
    setUtilizationDraft(range);
  }, [viewerUtilizationMinimum, viewerUtilizationMaximum]);

  const updateUtilizationDraft = (minimum: number, maximum: number) => {
    const range = { minimum, maximum };
    utilizationDraftRef.current = range;
    setUtilizationDraft(range);
  };

  const commitUtilizationRange = () => {
    const range = utilizationDraftRef.current;
    const committed = committedUtilizationRef.current;
    if (range.minimum === committed.minimum && range.maximum === committed.maximum) return;
    committedUtilizationRef.current = range;
    onViewerUtilizationRangeChange(range.minimum, range.maximum);
  };

  const handleSymbolScaleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (symbolScaleKeyActiveRef.current || !isRangeAdjustmentKey(event.key)) return;
    symbolScaleKeyActiveRef.current = true;
    onSymbolScaleChangeStart();
  };

  const handleSymbolScaleKeyUp = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!symbolScaleKeyActiveRef.current || !isRangeAdjustmentKey(event.key)) return;
    symbolScaleKeyActiveRef.current = false;
    finishSymbolScale();
  };

  const handleSymbolScaleBlur = () => {
    symbolScaleKeyActiveRef.current = false;
    finishSymbolScale();
  };

  const renderContent = () => {
    switch (activeTab) {
      case "plan":
        return (
          <div className="ribbon-content ribbon-content--blueprint">
            <div className="ribbon-groups">
              <RibbonGroup label={t("project.overview")}>
                <RibbonButton icon={<BlueprintIcon id="project.properties" size={24} />} label={t("project.information")} wide onClick={onOpenProjectInformation} />
              </RibbonGroup>
              <RibbonGroup label={t("plan.selection")}>
                <RibbonButton
                  active={isLassoSelectionActive}
                  disabled={lassoSelectionDisabled}
                  icon={<PilePlanIcon id="edit.select-rectangle" size={24} />}
                  label={t("plan.lassoSelection")}
                  title={t("plan.lassoSelectionTooltip")}
                  wide
                  onClick={onToggleLassoSelection}
                />
              </RibbonGroup>
              <RibbonGroup label={common("loadDirection.view")}>
                <div className="ribbon-load-direction">
                  {(["compression","tension"] as const).map(value=><RibbonButton key={value} icon={<PilePlanIcon id={value==="compression"?"pile.compression":"pile.tension"} />} active={mode===value} label={common(`loadDirection.${value}`)} title={common("loadDirection.displayOnly")} onClick={()=>setMode(value)}/>)}
                </div>
              </RibbonGroup>
              <RibbonGroup label={t("plan.inspect")}>
                <RibbonButton icon={<PilePlanIcon id="pile.cap-changes" size={24} />} label={t("plan.pileCapChanges")} wide onClick={() => onOpenTaskPanel?.("pile-cap-changes")} />
                <RibbonButton icon={<BlueprintIcon id="file.open" size={24} />} label={t("plan.pileDriving")} wide onClick={() => onOpenTaskPanel?.("pile-driving")} />
              </RibbonGroup>
              <RibbonGroup label={t("plan.settings")}>
                <div className="ribbon-settings-actions">
                  <RibbonButton icon={<PilePlanIcon id="pile.cpt-settings" />} label={t("plan.cptSettings")} title={t("plan.cptSettings")} wide onClick={() => onOpenTaskPanel?.("cpt-settings")} />
                  <RibbonButton icon={<PilePlanIcon id="pile.cost-settings" />} label={t("plan.costs")} title={t("plan.costSettings")} ariaLabel={t("plan.costSettings")} onClick={() => onOpenTaskPanel?.("cost-settings")} />
                  <RibbonButton icon={<PilePlanIcon id="pile.group-settings" />} label={t("plan.groups")} title={t("plan.groupingSettings")} ariaLabel={t("plan.groupingSettings")} onClick={() => onOpenTaskPanel?.("grouping-settings")} />
                </div>
              </RibbonGroup>
              <RibbonGroup label={t("plan.locking")}>
                {isLockEditing ? (
                  <>
                    <RibbonButton icon={<PilePlanIcon id="data.apply" size={24} />} label={t("plan.applyLocks")} onClick={onApplyLockEditing} />
                    <RibbonButtonStack>
                      <RibbonButton icon={<BlueprintIcon id="ui.close" />} label={t("plan.cancelLocks")} size="small" onClick={onCancelLockEditing} />
                      <RibbonButton icon={<BlueprintIcon id="object.unlock" />} label={t("plan.unlockAll")} size="small" onClick={onUnlockAll} />
                    </RibbonButtonStack>
                  </>
                ) : (
                  <RibbonButton icon={<BlueprintIcon id="object.unlock" size={24} />} label={t("plan.editLocks")} onClick={onStartLockEditing} />
                )}
              </RibbonGroup>
              <RibbonGroup label={t("optimize.ilp")}>
                <RibbonButton icon={<BlueprintIcon id="pile.optimization" size={24} />} label={t("ilp.run")} tourTarget="optimization" onClick={() => onOpenTaskPanel?.("ilp-optimization")} />
              </RibbonGroup>
            </div>
          </div>
        );
      case "view":
        return (
          <div className="ribbon-content ribbon-content--blueprint">
            <div className="ribbon-groups">
              <RibbonGroup label={t("view.symbols")}>
                <div className="ribbon-slider-control">
                  <span>{t("view.symbolSize")}</span>
                  <RibbonNumericValue label={t("view.symbolSize")} value={symbolScaleDraft} min={10} max={200}
                    onCommit={value=>{onSymbolScaleChangeStart();symbolScaleDraftRef.current=value;setSymbolScaleDraft(value);finishSymbolScale();}}/>
                  <Slider
                    label={t("view.symbolSize")}
                    max="200"
                    min="10"
                    step="1"
                    value={symbolScaleDraft}
                    onChange={(event) => {const value=Number(event.currentTarget.value);symbolScaleDraftRef.current=value;setSymbolScaleDraft(value);}}
                    onPointerDown={onSymbolScaleChangeStart}
                    onPointerUp={finishSymbolScale}
                    onPointerCancel={finishSymbolScale}
                    onKeyDown={handleSymbolScaleKeyDown}
                    onKeyUp={handleSymbolScaleKeyUp}
                    onBlur={handleSymbolScaleBlur}
                  />
                </div>
              </RibbonGroup>
              <RibbonGroup label={t("view.utilization")}>
                <div className="ribbon-slider-control ribbon-range-control">
                  <span>{t("view.preferredRange")}</span>
                  <span className="ribbon-numeric-range">
                    <RibbonNumericValue label={t("view.minimumUtilization")} value={Math.round(utilizationDraft.minimum*100)}
                      min={0} max={Math.round(utilizationDraft.maximum*100)} suffix=""
                      onCommit={value=>{updateUtilizationDraft(value/100,utilizationDraftRef.current.maximum);commitUtilizationRange();}}/>
                    <span aria-hidden="true">–</span>
                    <RibbonNumericValue label={t("view.maximumUtilization")} value={Math.round(utilizationDraft.maximum*100)}
                      min={Math.round(utilizationDraft.minimum*100)} max={100}
                      onCommit={value=>{updateUtilizationDraft(utilizationDraftRef.current.minimum,value/100);commitUtilizationRange();}}/>
                  </span>
                  <UtilizationRangeSlider minimum={utilizationDraft.minimum} maximum={utilizationDraft.maximum}
                    onChange={updateUtilizationDraft} onCommit={commitUtilizationRange}/>
                </div>
              </RibbonGroup>
              <RibbonGroup label={t("view.foreground")}>
                <div className="ribbon-foreground-control">
                  <RibbonButton
                    active={foregroundLayer === "load-points"}
                    label={t("view.loadPoints")}
                    onClick={() => onForegroundLayerChange("load-points")}
                    icon={<svg className="blueprint-icon" width="24" height="24" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.25" />
                      <circle cx="8" cy="8" r="2.5" fill="var(--icon-accent,currentColor)" />
                    </svg>}
                  />
                  <RibbonButton
                    active={foregroundLayer === "cpts"}
                    label={t("view.cpts")}
                    icon={<PilePlanIcon id="pile.cpts" size={24} />}
                    onClick={() => onForegroundLayerChange("cpts")}
                  />
                </div>
              </RibbonGroup>
              <RibbonGroup label={t("view.grid")}>
                <RibbonButton
                  active={showGrid}
                  icon={<BlueprintIcon id="view.grid" size={24} />}
                  label={t("view.grid")}
                  title={showGrid ? t("view.hideGrid") : t("view.showGrid")}
                  onClick={() => onGridVisibilityChange(!showGrid)}
                />
              </RibbonGroup>
              <RibbonGroup label={t("view.regions")}>
                <RibbonButton
                  className="tip-level-regions-toggle"
                  active={showTipLevelRegions}
                  icon={<PilePlanIcon id="pile.tip-regions" />}
                  label={t("view.tipLevelRegions")}
                  title={t(tipLevelRegionToggle.labelKey)}
                  onClick={() => onTipLevelRegionVisibilityChange(tipLevelRegionToggle.nextVisible)}
                />
                <RibbonButton
                  active={showLoadPointGroups}
                  icon={<PilePlanIcon id="pile.load-groups" />}
                  label={t("view.groups")}
                  title={showLoadPointGroups ? t("view.hideGroups") : t("view.showGroups")}
                  onClick={() => onLoadPointGroupVisibilityChange(!showLoadPointGroups)}
                />
              </RibbonGroup>
              <RibbonGroup label={t("view.windows")}>
                <RibbonButton
                  icon={<BlueprintIcon id="panel.left" size={24} />}
                  active={explorerVisible}
                  label={t("view.explorer")}
                  title={explorerVisible ? t("view.hideExplorer") : t("view.showExplorer")}
                  onClick={() => onExplorerVisibilityChange(!explorerVisible)}
                />
                <RibbonButton
                  icon={<BlueprintIcon id="panel.right" size={24} />}
                  active={propertiesVisible}
                  label={t("view.properties")}
                  title={propertiesVisible ? t("view.hideProperties") : t("view.showProperties")}
                  onClick={() => onPropertiesVisibilityChange(!propertiesVisible)}
                />
              </RibbonGroup>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="oa-app ribbon-container" onKeyDown={event => {
      // Keep native control activation available when the plan viewer listens globally.
      if (event.key === " " || event.key === "Enter") event.stopPropagation();
    }}>
      <div className="ribbon-tabs" data-tour-target="plan-tabs">
        <Button kind="primary" className="ribbon-file-button" onClick={onFileTabClick}>{t("tabs.file")}</Button>
        <Tabs label={t("tabs.label")} tabs={TABS.map(id => ({ id, label: t(`tabs.${id}`) }))}
          active={activeTab} onSelect={id => setActiveTab(id as TabId)} />
      </div>

      <div className="ribbon-content-wrapper">
        <div className="ribbon-content-panel" role="tabpanel" aria-label={t(`tabs.${activeTab}`)}>{renderContent()}</div>
      </div>
    </div>
  );
}

function isRangeAdjustmentKey(key: string): boolean {
  return ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"].includes(key);
}
