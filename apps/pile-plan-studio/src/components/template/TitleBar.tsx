import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton, OpenAECProvider, Status } from "../../openaec/react/src/index";
import spriteUrl from "../../openaec/studioSprite.ts";
import ApplicationSettingsIcon from "./ApplicationSettingsIcon.tsx";
import "../../openaec/openaec-components.css";
import "./TitleBar.css";

interface TitleBarProps {
  projectAction?: () => void;
  projectActionKind: "save" | "download";
  projectActionDisabled?: boolean;
  hideFeedback?: boolean;
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

function shortcutTip(label: string, keys: string) {
  return label.includes(keys) ? label : label + " (" + keys + ")";
}

export default function TitleBar({
  projectAction, projectActionKind, projectActionDisabled, hideFeedback, canUndo, canRedo, undoLabel, redoLabel,
  onUndo, onRedo, onSettingsClick, onFeedbackClick, interfaceScaleControl,
}: TitleBarProps) {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState("");
  const projectActionLabel = t(projectActionKind === "save" ? "save" : "saveProjectDownload");
  useEffect(() => {
    let active = true;
    import("@tauri-apps/api/app").then(api => api.getVersion())
      .then(version => { if (active) setAppVersion(version); })
      .catch(() => { if (active) setAppVersion(""); });
    return () => { active = false; };
  }, []);

  return <OpenAECProvider sprite={spriteUrl}>
    <header className="oa-app titlebar titlebar-blueprint" role="banner" onKeyDown={event => {
      if (event.key === " " || event.key === "Enter") event.stopPropagation();
    }}>
      <div className="titlebar-left">
        <div className="titlebar-icon"><img src={`${import.meta.env.BASE_URL}pile-plan-studio-icon.png`} alt="" aria-hidden="true" /></div>
        <div className="titlebar-quick-access">
          <IconButton className="titlebar-quick-btn" icon="file.save" label={projectActionLabel} keys="Ctrl+S"
            data-oa-tip={undefined} data-tooltip={shortcutTip(projectActionLabel, "Ctrl+S")} onClick={projectAction} disabled={projectActionDisabled} />
          <IconButton className="titlebar-quick-btn" icon="edit.undo" label={undoLabel} keys="Ctrl+Z"
            disabled={!canUndo} onClick={onUndo} data-oa-tip={undefined}
            data-tooltip={canUndo ? shortcutTip(undoLabel, "Ctrl+Z") : undefined} />
          <IconButton className="titlebar-quick-btn" icon="edit.redo" label={redoLabel} keys="Ctrl+Y"
            disabled={!canRedo} onClick={onRedo} data-oa-tip={undefined}
            data-tooltip={canRedo ? shortcutTip(redoLabel, "Ctrl+Y") : undefined} />
          <Button kind="quiet" className="titlebar-quick-btn titlebar-settings-button" aria-label={t("preferences")}
            aria-keyshortcuts="Control+," data-tooltip={shortcutTip(t("preferences"), "Ctrl+,")} onClick={onSettingsClick}>
            <ApplicationSettingsIcon />
          </Button>
        </div>
      </div>
      <div className="titlebar-title">
        <span className="titlebar-name">{t("appName")}</span>
        <span className="titlebar-alpha-badge" data-tooltip={t("engineeringDisclaimer")}
          aria-label={t("alphaLabel") + ": " + t("engineeringDisclaimer")} tabIndex={0}>
          <Status tone="warning">{t("alphaLabel")}</Status>
        </span>
        {appVersion && <span className="titlebar-version">v{appVersion}</span>}
      </div>
      <div className="titlebar-actions">
        <div className="titlebar-scale-anchor">{interfaceScaleControl}</div>
        {!hideFeedback && <Button kind="quiet" icon="ui.feedback" className="send-feedback-btn" onClick={onFeedbackClick}>
          <span>{t("sendFeedback")}</span>
        </Button>}
      </div>
    </header>
  </OpenAECProvider>;
}
