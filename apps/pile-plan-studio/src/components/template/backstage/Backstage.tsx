import { useState, useEffect } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useRecentFiles, type RecentFile } from "../../../hooks/useRecentFiles";
import ProjectImportPanel from "../../domain/ProjectImportPanel";
import type { ImportSourceInput } from "../../.././core/coreImportContract";
import type { ImportSummary } from "../../.././core/projectFile";
import type { ProjectFileCommands } from "../../../domain/projectPersistence.ts";
import "./Backstage.css";

const ICONS = {
  new: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6m-3 3h6"/></svg>',
  open: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  save: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z"/><path d="M17 3v4a1 1 0 01-1 1H8"/><path d="M7 14h10v7H7z"/></svg>',
  saveAs: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z"/><path d="M17 3v4a1 1 0 01-1 1H8"/><path d="M12 12v6m-3-3h6"/></svg>',
  print: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  export: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  import: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  preferences: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  about: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  exit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  extensions: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>',
};

function MenuItem({
  icon,
  label,
  shortcut,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`backstage-item${active ? " active" : ""}`}
      onClick={onClick}
    >
      <span
        className="backstage-item-icon"
        dangerouslySetInnerHTML={{ __html: icon }}
      />
      <span className="backstage-item-label">{label}</span>
      {shortcut && (
        <span className="backstage-item-shortcut">{shortcut}</span>
      )}
    </button>
  );
}

function Divider() {
  return <div className="backstage-divider" />;
}

interface BackstageProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenFile?: (path: string) => void;
  onImportProject: (projectName: string, sources: ImportSourceInput[]) => Promise<ImportSummary | null>;
  onOpenProjectFile: (file: File) => Promise<void>;
  onDownloadProject: () => Promise<void>;
  onExportPilePlanXlsx: () => Promise<void>;
  onExportPilePlanCsv: () => Promise<void>;
  onChooseDesktopProject: () => Promise<void>;
  onSaveProject: () => Promise<void>;
  onSaveProjectAs: () => Promise<void>;
  commands: ProjectFileCommands;
}

export default function Backstage({ open, onClose, onOpenSettings, onOpenFile, onImportProject, onOpenProjectFile, onDownloadProject, onExportPilePlanXlsx, onExportPilePlanCsv, onChooseDesktopProject, onSaveProject, onSaveProjectAs, commands }: BackstageProps) {
  const { t } = useTranslation("backstage");
  const [activePanel, setActivePanel] = useState<string>("none");
  const { recentFiles, removeRecentFile, clearRecentFiles } = useRecentFiles();

  useEffect(() => {
    if (!open) {
      setActivePanel("none");
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const hasActivePanel =
    activePanel === "open" ||
    activePanel === "about" ||
    activePanel === "import" ||
    activePanel === "export";

  return (
    <div className="backstage-overlay">
      <div className="backstage-sidebar">
        <button className="backstage-back" onClick={onClose}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>{t("file")}</span>
        </button>
        <div className="backstage-items">
          <MenuItem
            icon={ICONS.open}
            label={t("open")}
            shortcut="Ctrl+O"
            active={activePanel === "open"}
            onClick={() => setActivePanel("open")}
          />
          {commands.save ? <MenuItem icon={ICONS.save} label={t("save")} shortcut="Ctrl+S" onClick={() => void onSaveProject().then(onClose)} /> : null}
          {commands.saveAs ? <MenuItem icon={ICONS.saveAs} label={t("saveAs")} onClick={() => void onSaveProjectAs().then(onClose)} /> : null}
          <Divider />
          <MenuItem
            icon={ICONS.import}
            label={t("import")}
            active={activePanel === "import"}
            onClick={() => setActivePanel("import")}
          />
          <MenuItem
            icon={ICONS.export}
            label={t("exportMenu")}
            active={activePanel === "export"}
            onClick={() => setActivePanel("export")}
          />
          <Divider />
          <MenuItem
            icon={ICONS.preferences}
            label={t("preferences")}
            shortcut="Ctrl+,"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
          />
          <Divider />
          <MenuItem
            icon={ICONS.about}
            label={t("about")}
            active={activePanel === "about"}
            onClick={() => setActivePanel("about")}
          />
          {commands.save ? <>
            <Divider />
            <MenuItem
              icon={ICONS.exit}
              label={t("exit")}
              shortcut="Alt+F4"
              onClick={() => {
                onClose();
                import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
                  getCurrentWindow().close()
                );
              }}
            />
          </> : null}
        </div>
      </div>
      {hasActivePanel && (
        <div className="backstage-content">
          {activePanel === "open" && (
            <OpenPanel
              recentFiles={recentFiles}
              onOpenFile={(path) => { onClose(); onOpenFile?.(path); }}
              onRemoveFile={removeRecentFile}
              onClearAll={clearRecentFiles}
              onOpenProjectFile={async (file) => {
                await onOpenProjectFile(file);
                onClose();
              }}
              isDesktop={commands.save}
              onChooseDesktopProject={async () => {
                await onChooseDesktopProject();
                onClose();
              }}
            />
          )}
          {activePanel === "about" && <AboutPanel />}
          {activePanel === "import" && <ProjectImportPanel onImportProject={async (name, sources) => {
            return onImportProject(name, sources);
          }} />}
          {activePanel === "export" && (
            <ExportPanel
              canDownloadProject={commands.download}
              onDownloadProject={onDownloadProject}
              onExportPilePlanXlsx={onExportPilePlanXlsx}
              onExportPilePlanCsv={onExportPilePlanCsv}
            />
          )}
        </div>
      )}
      {/* Click anywhere outside the menu/panel to close */}
      <div className="backstage-dismiss-area" onClick={onClose} />
    </div>
  );
}

function AboutPanel() {
  const { t } = useTranslation("backstage");

  const openExternal = (url: string) => async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="bs-about-panel">
      <h2 className="bs-about-title">{t("aboutPanel.title")}</h2>
      <div className="bs-about-app">
        <div className="bs-about-logo">
          <svg
            viewBox="0 0 1024 1024"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="40" y="40" width="944" height="944" rx="180" fill="var(--theme-accent)" />
            <text
              x="512"
              y="600"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--theme-accent-text)"
              fontSize="320"
              fontFamily="'Space Grotesk', 'Inter', Arial, sans-serif"
              fontWeight="700"
            >
              OA
            </text>
          </svg>
        </div>
        <div className="bs-about-app-info">
          <h1 className="bs-about-app-name">{t("aboutPanel.appName")}</h1>
          <p className="bs-about-version">{t("aboutPanel.version")} 0.1.2</p>
        </div>
      </div>
      <p className="bs-about-tagline">{t("aboutPanel.tagline")}</p>
      <p className="bs-about-description">{t("aboutPanel.description")}</p>
      <div className="bs-about-company">
        <h3 className="bs-about-company-name">{t("aboutPanel.companyName")}</h3>
        <p className="bs-about-company-desc">{t("aboutPanel.companyDescription")}</p>
        <p className="bs-about-company-meta">
          {t("aboutPanel.stichting")}
        </p>
      </div>
      <div className="bs-about-links">
        <a
          href="https://www.open-aec.com/"
          className="bs-about-link"
          onClick={openExternal("https://www.open-aec.com/")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" />
          </svg>
          {t("aboutPanel.website")}
        </a>
        <a
          href="https://github.com/OpenAEC-Foundation"
          className="bs-about-link"
          onClick={openExternal("https://github.com/OpenAEC-Foundation")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
          </svg>
          {t("aboutPanel.github")}
        </a>
      </div>
      <div className="bs-about-footer">
        <p className="bs-about-copyright">
          {t("aboutPanel.copyright")}
        </p>
      </div>
    </div>
  );
}

function OpenPanel({
  recentFiles,
  onOpenFile,
  onRemoveFile,
  onClearAll,
  onOpenProjectFile,
  isDesktop,
  onChooseDesktopProject,
}: {
  recentFiles: RecentFile[];
  onOpenFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onClearAll: () => void;
  onOpenProjectFile: (file: File) => Promise<void>;
  isDesktop: boolean;
  onChooseDesktopProject: () => Promise<void>;
}) {
  const { t } = useTranslation("backstage");

  const typeIcon = (type: RecentFile["type"]) => {
    switch (type) {
      case "ifc":
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>';
      case "report":
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>';
      case "project":
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
      default:
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/></svg>';
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t("openPanel.justNow", "Just now");
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="bs-open-panel">
      <header className="bs-open-heading">
        <div>
          <h2 className="backstage-panel-title">{t("openPanel.title")}</h2>
          <p className="backstage-panel-intro">{t("openPanel.intro")}</p>
        </div>
        {recentFiles.length > 0 && (
          <button
            className="bs-open-clear"
            onClick={onClearAll}
          >
            {t("openPanel.clearAll")}
          </button>
        )}
      </header>
      {isDesktop ? (
        <button className="bs-open-project-option" type="button" onClick={() => void onChooseDesktopProject()}>
          <OpenProjectOptionContent t={t} />
        </button>
      ) : (
        <label className="bs-open-project-option">
          <OpenProjectOptionContent t={t} />
          <input className="bs-open-native-file" type="file" accept=".ifcpp,application/json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onOpenProjectFile(file);
          }} />
        </label>
      )}
      <div className="bs-open-recent-heading">{t("openPanel.recent")}</div>
      {recentFiles.length === 0 ? (
        <p className="bs-open-empty">{t("openPanel.noRecent")}</p>
      ) : (
        <div className="bs-recent-list">
          {recentFiles.map((file) => (
            <div
              key={file.path}
              className="bs-recent-item"
              onClick={() => onOpenFile(file.path)}
            >
              <span className="bs-recent-icon" dangerouslySetInnerHTML={{ __html: typeIcon(file.type) }} />
              <div className="bs-recent-info">
                <div className="bs-recent-name">{file.name}</div>
                <div className="bs-recent-path">{file.path}</div>
              </div>
              <span className="bs-recent-date">{formatDate(file.timestamp)}</span>
              <button
                className="bs-recent-remove"
                onClick={(e) => { e.stopPropagation(); onRemoveFile(file.path); }}
                title={t("openPanel.remove")}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OpenProjectOptionContent({ t }: { t: (key: string) => string }) {
  return (
    <>
      <span className="bs-open-project-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          <path d="M12 11v5M9.5 13.5H14.5" />
        </svg>
      </span>
      <span className="bs-open-project-info">
        <span className="bs-open-project-heading">
          <strong>{t("openPanel.chooseProject")}</strong>
          <span className="bs-export-format">IFCPP</span>
        </span>
        <span>{t("openPanel.chooseProjectDesc")}</span>
      </span>
      <span className="bs-open-project-action">
        {t("openPanel.choose")}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M14 7l5 5-5 5" />
        </svg>
      </span>
    </>
  );
}

function ExportPanel({ canDownloadProject, onDownloadProject, onExportPilePlanXlsx, onExportPilePlanCsv }: {
  canDownloadProject: boolean;
  onDownloadProject: () => Promise<void>;
  onExportPilePlanXlsx: () => Promise<void>;
  onExportPilePlanCsv: () => Promise<void>;
}) {
  const { t } = useTranslation("backstage");
  const [runningExport, setRunningExport] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const runExport = (action: () => Promise<void>) => {
    flushSync(() => setRunningExport(true));
    setExportError(null);
    void action()
      .catch((error: unknown) => {
        setExportError(error instanceof Error ? error.message : t("exportPanel.error"));
      })
      .finally(() => setRunningExport(false));
  };

  return (
    <div className={`bs-export-panel${runningExport ? " is-exporting" : ""}`} aria-busy={runningExport}>
      <h2 className="backstage-panel-title">{t("exportPanel.title")}</h2>
      <p className="backstage-panel-intro">{t("exportPanel.intro")}</p>
      <div className="bs-export-cards">
        {canDownloadProject ? (
          <ExportOption
            title={t("exportPanel.ifcpp")}
            description={t("exportPanel.ifcppDesc")}
            format="IFCPP"
            disabled={runningExport}
            icon="project"
            actionLabel={t("exportPanel.download")}
            onClick={() => runExport(onDownloadProject)}
          />
        ) : null}
        <ExportOption
          title={t("exportPanel.excel")}
          description={t("exportPanel.excelDesc")}
          format="XLSX"
          disabled={runningExport}
          icon="table"
          actionLabel={t("exportPanel.export")}
          onClick={() => runExport(onExportPilePlanXlsx)}
        />
        <ExportOption
          title={t("exportPanel.csv")}
          description={t("exportPanel.csvDesc")}
          format="CSV"
          disabled={runningExport}
          icon="rows"
          actionLabel={t("exportPanel.export")}
          onClick={() => runExport(onExportPilePlanCsv)}
        />
      </div>
      {exportError ? <p className="bs-export-error" role="alert">{exportError}</p> : null}
    </div>
  );
}

function ExportOption({
  title,
  description,
  format,
  disabled,
  icon,
  actionLabel,
  onClick,
}: {
  title: string;
  description: string;
  format: string;
  disabled: boolean;
  icon: "project" | "table" | "rows";
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="bs-export-card">
      <div className="bs-export-card-icon" aria-hidden="true">
        {icon === "project" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        ) : icon === "table" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="1" />
            <path d="M3 9h18M9 9v11M15 9v11" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M5 6h14M5 12h14M5 18h14" />
          </svg>
        )}
      </div>
      <div className="bs-export-card-info">
        <div className="bs-export-card-heading">
          <h3>{title}</h3>
          <span className="bs-export-format">{format}</span>
        </div>
        <p>{description}</p>
      </div>
      <button type="button" className="bs-export-action" disabled={disabled} onClick={onClick}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        {actionLabel}
      </button>
    </div>
  );
}
