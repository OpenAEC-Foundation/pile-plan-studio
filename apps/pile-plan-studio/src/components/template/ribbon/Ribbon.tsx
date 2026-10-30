import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import RibbonGroup from "./RibbonGroup";
import RibbonTab from "./RibbonTab";
import type { RightPanelMode } from "../../../domain/workspace/selectionState.ts";
import type { ForegroundLayer } from "../../../domain/settings/viewerPreferences.ts";
import {
  cptIcon,
  compressionIcon,
  tensionIcon,
  applyIcon,
  gridIcon,
  groupsIcon,
  explorerPanelIcon,
  lassoIcon,
  loadPointIcon,
  lockIcon,
  optimizeIcon,
  projectIcon,
  propertiesPanelIcon,
  removeIcon,
  settingsIcon,
  tipLevelRegionsIcon,
  unlockIcon,
} from "./icons";
import { getTipLevelRegionToggle } from "./tipLevelRegionToggle.ts";
import "./Ribbon.css";
import {useLoadDirection} from "../../../app/derived-state/LoadDirectionContext.tsx";
import UtilizationRangeSlider from "./UtilizationRangeSlider.tsx";
import RibbonNumericValue from "./RibbonNumericValue.tsx";

type TabId = "plan" | "view";
type TaskPanel = "cpt-settings" | "cost-settings" | "grouping-settings" | "ilp-optimization" | "pile-cap-changes";

const TABS: TabId[] = ["plan", "view"];

interface RibbonProps {
  onFileTabClick?: () => void;
  onOpenProjectInformation?: () => void;
  onOpenRightPanel?: (mode: RightPanelMode) => void;
  onOpenTaskPanel?: (panel: TaskPanel) => void;
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
  onOpenRightPanel,
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
          <div className="ribbon-content">
            <div className="ribbon-groups">
              <RibbonGroup label={t("project.overview")}>
                <RibbonButton icon={projectIcon} label={t("project.information")} wide onClick={onOpenProjectInformation} />
              </RibbonGroup>
              <RibbonGroup label={t("plan.inspect")}>
                <RibbonButton icon={loadPointIcon} label={t("plan.loadPoints")} wide onClick={() => onOpenRightPanel?.("load-point")} />
                <RibbonButton icon={cptIcon} label={t("plan.cpts")} onClick={() => onOpenRightPanel?.("cpts")} />
                <RibbonButton icon={groupsIcon} label={t("plan.pileCapChanges")} wide onClick={() => onOpenTaskPanel?.("pile-cap-changes")} />
              </RibbonGroup>
              <RibbonGroup label={common("loadDirection.view")}>
                <div className="ribbon-load-direction" role="group" aria-label={common("loadDirection.view")}>
                  {(["compression","tension"] as const).map(value=><RibbonButton key={value} icon={value==="compression"?compressionIcon:tensionIcon} active={mode===value} label={common(`loadDirection.${value}`)} title={common("loadDirection.displayOnly")} onClick={()=>setMode(value)}/>)}
                </div>
              </RibbonGroup>
              <RibbonGroup label={t("plan.selection")}>
                <RibbonButton
                  active={isLassoSelectionActive}
                  disabled={lassoSelectionDisabled}
                  icon={lassoIcon}
                  label={t("plan.lassoSelection")}
                  title={t("plan.lassoSelectionTooltip")}
                  wide
                  onClick={onToggleLassoSelection}
                />
              </RibbonGroup>
              <RibbonGroup label={t("plan.settings")}>
                <RibbonButtonStack>
                  <RibbonButton icon={settingsIcon} label={t("plan.cptSettings")} size="small" onClick={() => onOpenTaskPanel?.("cpt-settings")} />
                  <RibbonButton icon={settingsIcon} label={t("plan.costSettings")} size="small" onClick={() => onOpenTaskPanel?.("cost-settings")} />
                  <RibbonButton icon={settingsIcon} label={t("plan.groupingSettings")} size="small" onClick={() => onOpenTaskPanel?.("grouping-settings")} />
                </RibbonButtonStack>
              </RibbonGroup>
              <RibbonGroup label={t("plan.locking")}>
                {isLockEditing ? (
                  <>
                    <RibbonButton icon={applyIcon} label={t("plan.applyLocks")} onClick={onApplyLockEditing} />
                    <RibbonButtonStack>
                      <RibbonButton icon={removeIcon} label={t("plan.cancelLocks")} size="small" onClick={onCancelLockEditing} />
                      <RibbonButton icon={unlockIcon} label={t("plan.unlockAll")} size="small" onClick={onUnlockAll} />
                    </RibbonButtonStack>
                  </>
                ) : (
                  <RibbonButton icon={lockIcon} label={t("plan.editLocks")} onClick={onStartLockEditing} />
                )}
              </RibbonGroup>
              <RibbonGroup label={t("optimize.ilp")}>
                <RibbonButton icon={optimizeIcon} label={t("ilp.run")} onClick={() => onOpenTaskPanel?.("ilp-optimization")} />
              </RibbonGroup>
            </div>
          </div>
        );
      case "view":
        return (
          <div className="ribbon-content">
            <div className="ribbon-groups">
              <RibbonGroup label={t("view.symbols")}>
                <div className="ribbon-slider-control">
                  <span>{t("view.symbolSize")}</span>
                  <RibbonNumericValue label={t("view.symbolSize")} value={symbolScaleDraft} min={10} max={200}
                    onCommit={value=>{onSymbolScaleChangeStart();symbolScaleDraftRef.current=value;setSymbolScaleDraft(value);finishSymbolScale();}}/>
                  <input
                    aria-label={t("view.symbolSize")}
                    max="200"
                    min="10"
                    step="1"
                    type="range"
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
                <div className="ribbon-foreground-control" role="group" aria-label={t("view.foreground")}>
                  <button
                    className={foregroundLayer === "load-points" ? "is-selected" : ""}
                    type="button"
                    onClick={() => onForegroundLayerChange("load-points")}
                  >{t("view.loadPoints")}</button>
                  <button
                    className={foregroundLayer === "cpts" ? "is-selected" : ""}
                    type="button"
                    onClick={() => onForegroundLayerChange("cpts")}
                  >{t("view.cpts")}</button>
                </div>
              </RibbonGroup>
              <RibbonGroup label={t("view.grid")}>
                <RibbonButton
                  icon={gridIcon}
                  label={showGrid ? t("view.hideGrid") : t("view.showGrid")}
                  onClick={() => onGridVisibilityChange(!showGrid)}
                />
              </RibbonGroup>
              <RibbonGroup label={t("view.regions")}>
                <RibbonButton
                  className="tip-level-regions-toggle"
                  icon={tipLevelRegionsIcon}
                  label={t(tipLevelRegionToggle.labelKey)}
                  onClick={() => onTipLevelRegionVisibilityChange(tipLevelRegionToggle.nextVisible)}
                />
                <RibbonButton
                  active={showLoadPointGroups}
                  icon={groupsIcon}
                  label={showLoadPointGroups ? t("view.hideGroups") : t("view.showGroups")}
                  onClick={() => onLoadPointGroupVisibilityChange(!showLoadPointGroups)}
                />
              </RibbonGroup>
              <RibbonGroup label={t("view.windows")}>
                <RibbonButton
                  icon={explorerPanelIcon}
                  label={explorerVisible ? t("view.hideExplorer") : t("view.showExplorer")}
                  onClick={() => onExplorerVisibilityChange(!explorerVisible)}
                />
                <RibbonButton
                  icon={propertiesPanelIcon}
                  label={propertiesVisible ? t("view.hideProperties") : t("view.showProperties")}
                  onClick={() => onPropertiesVisibilityChange(!propertiesVisible)}
                />
              </RibbonGroup>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="ribbon-container">
      <div className="ribbon-tabs">
        <RibbonTab label={t("tabs.file")} isFileTab onClick={() => onFileTabClick?.()} />
        {TABS.map((tab) => (
          <RibbonTab
            key={tab}
            label={t(`tabs.${tab}`)}
            isActive={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          />
        ))}
      </div>

      <div className="ribbon-content-wrapper">
        <div className="ribbon-content-panel">{renderContent()}</div>
      </div>
    </div>
  );
}

function isRangeAdjustmentKey(key: string): boolean {
  return ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"].includes(key);
}
