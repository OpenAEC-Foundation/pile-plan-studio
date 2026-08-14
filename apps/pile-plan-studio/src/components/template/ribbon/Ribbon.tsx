import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import RibbonGroup from "./RibbonGroup";
import RibbonTab from "./RibbonTab";
import type { RightPanelMode } from "../../../domain/selectionState.ts";
import type { ForegroundLayer } from "../../../domain/viewerPreferences.ts";
import {
  cptIcon,
  applyIcon,
  gridIcon,
  explorerPanelIcon,
  loadPointIcon,
  lockIcon,
  optimizeIcon,
  projectIcon,
  propertiesPanelIcon,
  removeIcon,
  settingsIcon,
  unlockIcon,
} from "./icons";
import "./Ribbon.css";

type TabId = "plan" | "view";
type TaskPanel = "cpt-settings" | "cost-settings" | "optimization";

const TABS: TabId[] = ["plan", "view"];

interface RibbonProps {
  onFileTabClick?: () => void;
  onOpenProjectInformation?: () => void;
  onOpenRightPanel?: (mode: RightPanelMode) => void;
  onOpenTaskPanel?: (panel: TaskPanel) => void;
  onRunOptimization?: () => void;
  optimizationDisabled?: boolean;
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
  explorerVisible: boolean;
  propertiesVisible: boolean;
  onSymbolScaleChange: (value: number) => void;
  onViewerUtilizationRangeChange: (minimum: number, maximum: number) => void;
  onForegroundLayerChange: (value: ForegroundLayer) => void;
  onGridVisibilityChange: (visible: boolean) => void;
  onExplorerVisibilityChange: (visible: boolean) => void;
  onPropertiesVisibilityChange: (visible: boolean) => void;
}

export default function Ribbon({
  onFileTabClick,
  onOpenProjectInformation,
  onOpenRightPanel,
  onOpenTaskPanel,
  onRunOptimization,
  optimizationDisabled = false,
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
  explorerVisible,
  propertiesVisible,
  onSymbolScaleChange,
  onViewerUtilizationRangeChange,
  onForegroundLayerChange,
  onGridVisibilityChange,
  onExplorerVisibilityChange,
  onPropertiesVisibilityChange,
}: RibbonProps) {
  const { t } = useTranslation("ribbon");
  const [activeTab, setActiveTab] = useState<TabId>("plan");
  const [utilizationDraft, setUtilizationDraft] = useState({
    minimum: viewerUtilizationMinimum,
    maximum: viewerUtilizationMaximum,
  });
  const utilizationDraftRef = useRef(utilizationDraft);
  const committedUtilizationRef = useRef(utilizationDraft);
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
              </RibbonGroup>
              <RibbonGroup label={t("plan.settings")}>
                <RibbonButtonStack>
                  <RibbonButton icon={settingsIcon} label={t("plan.cptSettings")} size="small" onClick={() => onOpenTaskPanel?.("cpt-settings")} />
                  <RibbonButton icon={settingsIcon} label={t("plan.costSettings")} size="small" onClick={() => onOpenTaskPanel?.("cost-settings")} />
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
              <RibbonGroup label={t("optimize.greedy")}>
                <RibbonButton icon={optimizeIcon} label={t("optimize.run")} disabled={optimizationDisabled} onClick={onRunOptimization} />
                <RibbonButton icon={settingsIcon} label={t("optimize.settings")} onClick={() => onOpenTaskPanel?.("optimization")} />
              </RibbonGroup>
            </div>
          </div>
        );
      case "view":
        return (
          <div className="ribbon-content">
            <div className="ribbon-groups">
              <RibbonGroup label={t("view.symbols")}>
                <label className="ribbon-slider-control">
                  <span>{t("view.symbolSize")}</span>
                  <strong>{symbolScalePercent}%</strong>
                  <input
                    aria-label={t("view.symbolSize")}
                    max="200"
                    min="10"
                    step="1"
                    type="range"
                    value={symbolScalePercent}
                    onChange={(event) => onSymbolScaleChange(Number(event.currentTarget.value))}
                  />
                </label>
              </RibbonGroup>
              <RibbonGroup label={t("view.utilization")}>
                <div className="ribbon-slider-control ribbon-range-control">
                  <span>{t("view.preferredRange")}</span>
                  <strong>{Math.round(utilizationDraft.minimum * 100)}-{Math.round(utilizationDraft.maximum * 100)}%</strong>
                  <div className="ribbon-dual-range">
                    <span
                      aria-hidden="true"
                      className="ribbon-dual-range-selection"
                      style={{
                        left: `${utilizationDraft.minimum * 100}%`,
                        width: `${(utilizationDraft.maximum - utilizationDraft.minimum) * 100}%`,
                      }}
                    />
                    <input
                      aria-label={t("view.minimumUtilization")}
                      max="100"
                      min="0"
                      step="1"
                      type="range"
                      value={Math.round(utilizationDraft.minimum * 100)}
                      onChange={(event) => updateUtilizationDraft(
                        Math.min(Number(event.currentTarget.value) / 100, utilizationDraft.maximum),
                        utilizationDraft.maximum,
                      )}
                      onPointerUp={commitUtilizationRange}
                      onKeyUp={commitUtilizationRange}
                      onBlur={commitUtilizationRange}
                    />
                    <input
                      aria-label={t("view.maximumUtilization")}
                      max="100"
                      min="0"
                      step="1"
                      type="range"
                      value={Math.round(utilizationDraft.maximum * 100)}
                      onChange={(event) => updateUtilizationDraft(
                        utilizationDraft.minimum,
                        Math.max(Number(event.currentTarget.value) / 100, utilizationDraft.minimum),
                      )}
                      onPointerUp={commitUtilizationRange}
                      onKeyUp={commitUtilizationRange}
                      onBlur={commitUtilizationRange}
                    />
                  </div>
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
