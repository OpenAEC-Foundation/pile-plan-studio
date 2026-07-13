import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import RibbonGroup from "./RibbonGroup";
import RibbonTab from "./RibbonTab";
import {
  helpIcon,
  ifcStatsIcon,
  ifcValidateIcon,
  projectIcon,
  redoIcon,
  settingsIcon,
  undoIcon,
  viewerFitIcon,
  viewerLoadIcon,
  viewerMeasureIcon,
  viewerWireframeIcon,
} from "./icons";
import "./Ribbon.css";

type TabId = "project" | "plan" | "optimize" | "view";

const TABS: TabId[] = ["project", "plan", "optimize", "view"];

interface RibbonProps {
  onFileTabClick?: () => void;
  onSettingsClick?: () => void;
  onOpenOptimizationSettings?: () => void;
  onRunOptimization?: () => void;
  optimizationDisabled?: boolean;
}

export default function Ribbon({
  onFileTabClick,
  onSettingsClick,
  onOpenOptimizationSettings,
  onRunOptimization,
  optimizationDisabled = false,
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
                <RibbonButton icon={projectIcon} label={t("project.settings")} onClick={onSettingsClick} />
                <RibbonButton icon={ifcStatsIcon} label={t("project.sources")} disabled />
              </RibbonGroup>
              <RibbonGroup label={t("project.checks")}>
                <RibbonButtonStack>
                  <RibbonButton icon={ifcValidateIcon} label={t("project.validate")} size="small" disabled />
                  <RibbonButton icon={viewerFitIcon} label={t("project.refreshSources")} size="small" disabled />
                </RibbonButtonStack>
              </RibbonGroup>
            </div>
          </div>
        );
      case "plan":
        return (
          <div className="ribbon-content">
            <div className="ribbon-groups">
              <RibbonGroup label={t("plan.inspect")}>
                <RibbonButton icon={projectIcon} label={t("plan.loadPoints")} disabled />
                <RibbonButton icon={viewerMeasureIcon} label={t("plan.cpts")} disabled />
              </RibbonGroup>
              <RibbonGroup label={t("plan.settings")}>
                <RibbonButtonStack>
                  <RibbonButton icon={settingsIcon} label={t("plan.cptSettings")} size="small" disabled />
                  <RibbonButton icon={settingsIcon} label={t("plan.costSettings")} size="small" disabled />
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
                <RibbonButton icon={viewerFitIcon} label={t("optimize.run")} disabled={optimizationDisabled} onClick={onRunOptimization} />
                <RibbonButton icon={settingsIcon} label={t("optimize.settings")} onClick={onOpenOptimizationSettings} />
              </RibbonGroup>
            </div>
          </div>
        );
      case "view":
        return (
          <div className="ribbon-content">
            <div className="ribbon-groups">
              <RibbonGroup label={t("view.map")}>
                <RibbonButton icon={viewerFitIcon} label={t("view.fit")} disabled />
                <RibbonButton icon={viewerLoadIcon} label={t("view.legend")} disabled />
              </RibbonGroup>
              <RibbonGroup label={t("view.panels")}>
                <RibbonButton icon={viewerWireframeIcon} label={t("view.panels")} disabled />
              </RibbonGroup>
              <RibbonGroup label={t("view.help")}>
                <RibbonButtonStack>
                  <RibbonButton icon={undoIcon} label={t("view.undo")} size="small" disabled />
                  <RibbonButton icon={redoIcon} label={t("view.redo")} size="small" disabled />
                  <RibbonButton icon={helpIcon} label={t("view.help")} size="small" disabled />
                </RibbonButtonStack>
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
