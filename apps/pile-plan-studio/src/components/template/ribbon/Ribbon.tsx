import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import RibbonGroup from "./RibbonGroup";
import RibbonTab from "./RibbonTab";
import type { RightPanelMode } from "../../../domain/selectionState.ts";
import type { ForegroundLayer } from "../../../domain/viewerPreferences.ts";
import {
  cptIcon,
  loadPointIcon,
  optimizeIcon,
  projectIcon,
  settingsIcon,
} from "./icons";
import "./Ribbon.css";

type TabId = "project" | "plan" | "optimize" | "view";

const TABS: TabId[] = ["project", "plan", "optimize", "view"];

interface RibbonProps {
  onFileTabClick?: () => void;
  onOpenProjectInformation?: () => void;
  onOpenRightPanel?: (mode: RightPanelMode) => void;
  onOpenOptimizationSettings?: () => void;
  onRunOptimization?: () => void;
  optimizationDisabled?: boolean;
  symbolScalePercent: number;
  viewerUtilizationMinimum: number;
  viewerUtilizationMaximum: number;
  foregroundLayer: ForegroundLayer;
  onSymbolScaleChange: (value: number) => void;
  onViewerUtilizationRangeChange: (minimum: number, maximum: number) => void;
  onForegroundLayerChange: (value: ForegroundLayer) => void;
}

export default function Ribbon({
  onFileTabClick,
  onOpenProjectInformation,
  onOpenRightPanel,
  onOpenOptimizationSettings,
  onRunOptimization,
  optimizationDisabled = false,
  symbolScalePercent,
  viewerUtilizationMinimum,
  viewerUtilizationMaximum,
  foregroundLayer,
  onSymbolScaleChange,
  onViewerUtilizationRangeChange,
  onForegroundLayerChange,
}: RibbonProps) {
  const { t, i18n } = useTranslation("ribbon");
  const [activeTab, setActiveTab] = useState<TabId>("project");
  const tabsRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);
  const gapRef = useRef<HTMLDivElement>(null);

  const updateHighlight = useCallback(() => {
    const tabsEl = tabsRef.current;
    const borderEl = borderRef.current;
    const gapEl = gapRef.current;
    if (!tabsEl || !borderEl || !gapEl) return;

    const activeEl = tabsEl.querySelector(".ribbon-tab.active") as HTMLElement | null;
    if (!activeEl) {
      borderEl.style.opacity = "0";
      gapEl.style.opacity = "0";
      return;
    }

    const tabsRect = tabsEl.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const left = activeRect.left - tabsRect.left;
    const top = activeRect.top - tabsRect.top;

    borderEl.style.opacity = "1";
    borderEl.style.left = `${left}px`;
    borderEl.style.top = `${top}px`;
    borderEl.style.width = `${activeRect.width}px`;
    borderEl.style.height = `${activeRect.height}px`;

    gapEl.style.opacity = "1";
    gapEl.style.left = `${left + 1}px`;
    gapEl.style.width = `${activeRect.width - 2}px`;
  }, []);

  useEffect(() => {
    updateHighlight();
    requestAnimationFrame(updateHighlight);
  }, [activeTab, i18n.language, updateHighlight]);

  useEffect(() => {
    window.addEventListener("resize", updateHighlight);
    return () => window.removeEventListener("resize", updateHighlight);
  }, [updateHighlight]);

  const renderContent = () => {
    switch (activeTab) {
      case "project":
        return (
          <div className="ribbon-content">
            <div className="ribbon-groups">
              <RibbonGroup label={t("project.overview")}>
                <RibbonButton icon={projectIcon} label={t("project.information")} onClick={onOpenProjectInformation} />
              </RibbonGroup>
            </div>
          </div>
        );
      case "plan":
        return (
          <div className="ribbon-content">
            <div className="ribbon-groups">
              <RibbonGroup label={t("plan.inspect")}>
                <RibbonButton icon={loadPointIcon} label={t("plan.loadPoints")} onClick={() => onOpenRightPanel?.("load-point")} />
                <RibbonButton icon={cptIcon} label={t("plan.cpts")} onClick={() => onOpenRightPanel?.("cpts")} />
              </RibbonGroup>
              <RibbonGroup label={t("plan.settings")}>
                <RibbonButtonStack>
                  <RibbonButton icon={settingsIcon} label={t("plan.cptSettings")} size="small" onClick={() => onOpenRightPanel?.("cpt-settings")} />
                  <RibbonButton icon={settingsIcon} label={t("plan.costSettings")} size="small" onClick={() => onOpenRightPanel?.("cost-settings")} />
                </RibbonButtonStack>
              </RibbonGroup>
            </div>
          </div>
        );
      case "optimize":
        return (
          <div className="ribbon-content">
            <div className="ribbon-groups">
              <RibbonGroup label={t("optimize.greedy")}>
                <RibbonButton icon={optimizeIcon} label={t("optimize.run")} disabled={optimizationDisabled} onClick={onRunOptimization} />
                <RibbonButton icon={settingsIcon} label={t("optimize.settings")} onClick={onOpenOptimizationSettings} />
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
                  <strong>{Math.round(viewerUtilizationMinimum * 100)}-{Math.round(viewerUtilizationMaximum * 100)}%</strong>
                  <div className="ribbon-dual-range">
                    <span
                      aria-hidden="true"
                      className="ribbon-dual-range-selection"
                      style={{
                        left: `${viewerUtilizationMinimum * 100}%`,
                        width: `${(viewerUtilizationMaximum - viewerUtilizationMinimum) * 100}%`,
                      }}
                    />
                    <input
                      aria-label={t("view.minimumUtilization")}
                      max="100"
                      min="0"
                      step="1"
                      type="range"
                      value={Math.round(viewerUtilizationMinimum * 100)}
                      onChange={(event) => onViewerUtilizationRangeChange(
                        Math.min(Number(event.currentTarget.value) / 100, viewerUtilizationMaximum),
                        viewerUtilizationMaximum,
                      )}
                    />
                    <input
                      aria-label={t("view.maximumUtilization")}
                      max="100"
                      min="0"
                      step="1"
                      type="range"
                      value={Math.round(viewerUtilizationMaximum * 100)}
                      onChange={(event) => onViewerUtilizationRangeChange(
                        viewerUtilizationMinimum,
                        Math.max(Number(event.currentTarget.value) / 100, viewerUtilizationMinimum),
                      )}
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
            </div>
          </div>
        );
    }
  };

  return (
    <div className="ribbon-container">
      <div className="ribbon-tabs" ref={tabsRef}>
        <RibbonTab label={t("tabs.file")} isFileTab onClick={() => onFileTabClick?.()} />
        {TABS.map((tab) => (
          <RibbonTab
            key={tab}
            label={t(`tabs.${tab}`)}
            isActive={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          />
        ))}
        <div className="ribbon-tab-border" ref={borderRef} />
        <div className="ribbon-tab-gap" ref={gapRef} />
      </div>

      <div className="ribbon-content-wrapper">
        <div className="ribbon-content-panel">{renderContent()}</div>
      </div>
    </div>
  );
}
