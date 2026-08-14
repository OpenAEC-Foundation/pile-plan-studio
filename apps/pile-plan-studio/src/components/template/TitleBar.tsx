import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./TitleBar.css";

interface TitleBarProps {
  projectAction?: () => void;
  projectActionKind: "save" | "download";
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  onUndo: () => void;
  onRedo: () => void;
  onSettingsClick?: () => void;
  onFeedbackClick?: () => void;
  interfaceScaleControl?: ReactNode;
}

function TitleBar({
  projectAction,
  projectActionKind,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  onSettingsClick,
  onFeedbackClick,
  interfaceScaleControl,
}: TitleBarProps) {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setAppVersion)
      .catch(() => setAppVersion(""));
  }, []);

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <div className="titlebar-icon">
          <img src="/pile-plan-studio-icon.svg" alt="" aria-hidden="true" />
        </div>

        <div className="titlebar-quick-access">
          <button
            className="titlebar-quick-btn"
            title={`${t(projectActionKind === "save" ? "save" : "downloadIfcpp")} (Ctrl+S)`}
            aria-label={t(projectActionKind === "save" ? "save" : "downloadIfcpp")}
            tabIndex={-1}
            onClick={projectAction}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {projectActionKind === "save" ? (
                <><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></>
              ) : (
                <><path d="M12 3v12" /><polyline points="7 10 12 15 17 10" /><path d="M5 21h14" /></>
              )}
            </svg>
          </button>
          <button
            className="titlebar-quick-btn"
            disabled={!canUndo}
            title={undoLabel}
            aria-label={undoLabel}
            tabIndex={-1}
            onClick={onUndo}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
          <button
            className="titlebar-quick-btn"
            disabled={!canRedo}
            title={redoLabel}
            aria-label={redoLabel}
            tabIndex={-1}
            onClick={onRedo}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 4 5 5-5 5" />
              <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
            </svg>
          </button>
          <button
            className="titlebar-quick-btn"
            title={t("preferences")}
            aria-label={t("preferences")}
            tabIndex={-1}
            onClick={onSettingsClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      <span className="titlebar-title">
        {t("appName")}
        <span
          className="titlebar-alpha-badge"
          title={t("engineeringDisclaimer")}
          aria-label={`${t("alphaLabel")}: ${t("engineeringDisclaimer")}`}
        >
          {t("alphaLabel")}
        </span>
        {appVersion && <span className="titlebar-version">v{appVersion}</span>}
      </span>

      <div className="titlebar-actions">
        <div className="titlebar-scale-anchor">
          {interfaceScaleControl}
        </div>
        <button
          className="send-feedback-btn"
          onClick={onFeedbackClick}
          tabIndex={-1}
        >
          {t("sendFeedback")}
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
