import PilePlanExportPanel, {type ExportFeatureProps} from "../../domain/exports/PilePlanExportPanel.tsx";
import { Banner, Button, Heading, OpenAECProvider } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import type {ExportOptions, LoadPointRefreshSelection} from "../../../core/exportRevisionContract.ts";
import type {PrepareLoadPointRefresh} from "../../../app/import/useLoadPointRefreshReview.ts";
import type { ProjectImportPreview } from "../../../core/adviceImportContract.ts";
import { useState, useEffect, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import type { RecentFile } from "../../../hooks/useRecentFiles";
import ProjectImportPanel from "../../domain/imports/ProjectImportPanel";
import type { ProjectImportProperties } from "../../domain/imports/ProjectImportPanel.tsx";
import type { ProjectImportMode } from "../../../domain/imports/projectImportModel.ts";
import type { ImportFileRole } from "../../../core/importFiles.ts";
import PilePlanImportPanel from "../../domain/imports/PilePlanImportPanel.tsx";
import type { ImportSourceInput } from "../../.././core/coreImportContract";
import type { ImportSummary } from "../../.././core/projectFile";
import type { PilePlanImportPatch } from "../../../core/pilePlanImportContract.ts";
import type { Cpt, LoadPoint, PileConfigurationKey, PileSizeExportFormat } from "../../../core/projectTypes.ts";
import type { ProjectFileCommands } from "../../../domain/project/projectPersistence.ts";
import AboutPanel from "./AboutPanel";
import OpenProjectPanel from "./OpenProjectPanel";
import BlueprintIcon from "../BlueprintIcon.tsx";
import "./Backstage.css";
import "./BackstageBlueprint.css";

const ICONS = {
  open: <BlueprintIcon id="file.open" size={24} />,
  save: <BlueprintIcon id="file.save" size={24} />,
  saveAs: <BlueprintIcon id="file.save-as" size={24} />,
  export: <BlueprintIcon id="file.export" size={24} />,
  import: <BlueprintIcon id="file.import" size={24} />,
  preferences: <BlueprintIcon id="ui.settings" size={24} />,
  about: <BlueprintIcon id="ui.about" size={24} />,
  exit: <BlueprintIcon id="ui.close" size={24} />,
};

function MenuItem({
  icon,
  label,
  shortcut,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button kind="quiet" disabled={disabled}
      aria-current={active ? "page" : undefined}
      aria-keyshortcuts={shortcut?.replace("Ctrl+", "Control+")}
      className={`backstage-item${active ? " active" : ""}`}
      onClick={onClick}
    >
      <span className="backstage-item-icon" aria-hidden="true">{icon}</span>
      <span className="backstage-item-label">{label}</span>
      {shortcut && (
        <span className="backstage-item-shortcut">{shortcut}</span>
      )}
    </Button>
  );
}

function Divider() {
  return <hr className="oa-divider backstage-divider" />;
}

interface BackstageProps extends ExportFeatureProps {
  open: boolean;
  suspended?: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenFile?: (path: string) => void;
  recentFiles?: RecentFile[];
  onRemoveRecentFile?: (path: string) => void;
  onClearRecentFiles?: () => void;
  onImportProject: (mode: ProjectImportMode, projectName: string | null, sources: ImportSourceInput[], properties: ProjectImportProperties | null, selection?: LoadPointRefreshSelection) => Promise<ImportSummary | null>;
  onPrepareLoadPointRefresh?: PrepareLoadPointRefresh;
  onPreviewProjectImport?: (mode: ProjectImportMode, sources: ImportSourceInput[]) => Promise<ProjectImportPreview>;
  importPreviewContextKey?: string;
  defaultCurrencyCode: string;
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  availablePileConfigurations: PileConfigurationKey[];
  activePilePlanName: string;
  onImportPilePlan: (patch: PilePlanImportPatch, fileName: string) => void;
  onOpenProjectFile: (file: File) => Promise<void>;
  onOpenSampleProject: () => Promise<void>;
  onDownloadProject: () => Promise<void>;
  onExportPilePlanXlsx: (pileSizeFormat: PileSizeExportFormat, options?: ExportOptions) => Promise<void>;
  onExportPilePlanCsv: (pileSizeFormat: PileSizeExportFormat, options?: ExportOptions) => Promise<void>;
  pileSizeFormat?: PileSizeExportFormat;
  onPileSizeFormatChange?: (pileSizeFormat: PileSizeExportFormat) => void;
  onChooseDesktopProject: () => Promise<void>;
  onSaveProject: () => Promise<void>;
  onSaveProjectAs: () => Promise<void>;
  commands: ProjectFileCommands;
  docsOpenPanel?: ReactNode;
  initialPanel?: "open";
  readOnly?: boolean;
  initialImportSource?: { role: ImportFileRole; file: File } | null;
}

export default function Backstage({ open, suspended = false, onClose, onOpenSettings, onOpenFile, recentFiles = [], onRemoveRecentFile = () => {}, onClearRecentFiles = () => {}, onImportProject, onPreviewProjectImport, onPrepareLoadPointRefresh, importPreviewContextKey, defaultCurrencyCode, loadPoints, cpts, availablePileConfigurations, activePilePlanName, onImportPilePlan, onOpenProjectFile, onOpenSampleProject, onDownloadProject, onExportPilePlanXlsx, onExportPilePlanCsv, pileSizeFormat = "numeric", onPileSizeFormatChange, exportPlans, exportPlanId, onExportPlanChange, exportPlan, exportContextKey, exportOptions, onExportOptionsChange, onExportRevision, onChooseDesktopProject, onSaveProject, onSaveProjectAs, commands, docsOpenPanel, initialPanel, readOnly = false, initialImportSource = null }: BackstageProps) {
  const { t } = useTranslation("backstage");
  const [activePanel, setActivePanel] = useState<string>("none");

  useEffect(() => {
    if (!open) {
      setActivePanel("none");
      return;
    }
    if (suspended) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, suspended]);

  useEffect(() => {
    if (open && initialPanel) setActivePanel(initialPanel);
    if (open && initialImportSource && !readOnly) setActivePanel("import");
  }, [initialImportSource, initialPanel, open, readOnly]);

  if (!open) return null;

  const hasActivePanel =
    activePanel === "open" ||
    activePanel === "about" ||
    activePanel === "import" ||
    activePanel === "pile-plan-import" ||
    activePanel === "export";

  return (
    <OpenAECProvider sprite={spriteUrl}><div className="oa-app backstage-overlay backstage-blueprint" style={suspended ? {display: "none"} : undefined}
      onKeyDown={event=>{
        if(event.key===" "||event.key==="Enter")event.stopPropagation();
        if(event.key==="Escape"&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();onClose();}
      }}>
      <nav className="backstage-sidebar" aria-label={t("file")}>
        <Button kind="primary" className="backstage-back" onClick={onClose}>
          <BlueprintIcon id="nav.back" />
          <span>{t("file")}</span>
        </Button>
        <div className="backstage-items">
          <MenuItem
            icon={ICONS.open}
            label={t("open")}
            shortcut="Ctrl+O"
            active={activePanel === "open"}
            onClick={() => setActivePanel("open")}
          />
          {commands.save ? <MenuItem icon={ICONS.save} label={t("save")} shortcut="Ctrl+S" disabled={readOnly} onClick={() => void onSaveProject().then(onClose)} /> : null}
          {commands.saveAs ? <MenuItem icon={ICONS.saveAs} label={t("saveAs")} onClick={() => void onSaveProjectAs().then(onClose)} /> : null}
          <Divider />
          <MenuItem
            icon={ICONS.import}
            label={t("import")}
            disabled={readOnly}
            active={activePanel === "import"}
            onClick={() => setActivePanel("import")}
          />
          <MenuItem
            icon={ICONS.import}
            label={t("importPilePlan")}
            disabled={readOnly}
            active={activePanel === "pile-plan-import"}
            onClick={() => setActivePanel("pile-plan-import")}
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
          {commands.save && !docsOpenPanel ? <>
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
      </nav>
      {hasActivePanel && (
        <div className="backstage-content">
          {activePanel === "open" && (docsOpenPanel ?? (
            <OpenProjectPanel
              recentFiles={recentFiles}
              onOpenFile={(path) => { onClose(); onOpenFile?.(path); }}
              onRemoveFile={onRemoveRecentFile}
              onClearAll={onClearRecentFiles}
              onOpenProjectFile={async (file) => {
                await onOpenProjectFile(file);
                onClose();
              }}
              isDesktop={commands.save}
              onChooseDesktopProject={async () => {
                await onChooseDesktopProject();
                onClose();
              }}
              onOpenSampleProject={async () => {
                await onOpenSampleProject();
                onClose();
              }}
            />
          ))}
          {activePanel === "about" && <AboutPanel hideLinks={!!docsOpenPanel} />}
          {activePanel === "import" && !readOnly && <ProjectImportPanel onPrepareLoadPointRefresh={onPrepareLoadPointRefresh} onPreviewProjectImport={onPreviewProjectImport} importPreviewContextKey={importPreviewContextKey} defaultCurrencyCode={defaultCurrencyCode} initialSource={initialImportSource} onImportProject={async (mode, name, sources, properties, selection) => {
            return selection ? onImportProject(mode, name, sources, properties, selection) : onImportProject(mode, name, sources, properties);
          }} />}
          {activePanel === "pile-plan-import" && !readOnly && (
            <PilePlanImportPanel
              loadPoints={loadPoints}
              cpts={cpts}
              availablePileConfigurations={availablePileConfigurations}
              onImportPilePlan={(patch, fileName) => {
                onImportPilePlan(patch, fileName);
                onClose();
              }}
            />
          )}
          {activePanel === "export" && (
            <ExportPanel
              exportPlans={exportPlans} exportPlanId={exportPlanId} onExportPlanChange={onExportPlanChange}
              exportPlan={exportPlan}
              exportContextKey={exportContextKey}
              exportOptions={exportOptions}
              onExportOptionsChange={onExportOptionsChange}
              onExportRevision={onExportRevision}
              canDownloadProject={commands.download}
              activePilePlanName={activePilePlanName}
              onDownloadProject={onDownloadProject}
              onExportPilePlanXlsx={onExportPilePlanXlsx}
              onExportPilePlanCsv={onExportPilePlanCsv}
              pileSizeFormat={pileSizeFormat}
              onPileSizeFormatChange={onPileSizeFormatChange}
            />
          )}
        </div>
      )}
      {/* Click anywhere outside the menu/panel to close */}
      <div className="backstage-dismiss-area" onClick={onClose} />
    </div></OpenAECProvider>
  );
}

function ExportPanel({ canDownloadProject, activePilePlanName, onDownloadProject, onExportPilePlanXlsx, onExportPilePlanCsv, pileSizeFormat, onPileSizeFormatChange, ...features }: ExportFeatureProps & {
  canDownloadProject: boolean;
  activePilePlanName: string;
  onDownloadProject: () => Promise<void>;
  onExportPilePlanXlsx: (format: PileSizeExportFormat, options?: ExportOptions) => Promise<void>;
  onExportPilePlanCsv: (format: PileSizeExportFormat, options?: ExportOptions) => Promise<void>;
  pileSizeFormat: PileSizeExportFormat;
  onPileSizeFormatChange?: (format: PileSizeExportFormat) => void;
}) {
  const { t } = useTranslation("backstage");
  const [runningExport, setRunningExport] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const runExport = (action: () => Promise<void>) => {
    flushSync(() => setRunningExport(true));
    setExportError(null);
    void action().catch((error: unknown) => setExportError(error instanceof Error ? error.message : t("exportPanel.error")))
      .finally(() => setRunningExport(false));
  };
  return <OpenAECProvider sprite={spriteUrl}><div className={`oa-app export-blueprint bs-export-panel${runningExport ? " is-exporting" : ""}`} aria-busy={runningExport}>
    <Heading level="page">{t("exportPanel.title")}</Heading>
    <p className="backstage-panel-intro">{t("exportPanel.intro")}</p>
    <div className="bs-export-cards">
      {canDownloadProject && <ExportOption title={t("exportPanel.ifcpp")} description={t("exportPanel.ifcppDesc")} format="IFCPP" disabled={runningExport}
        icon="project" actionLabel={t("exportPanel.download")} onClick={() => runExport(onDownloadProject)} />}
      <PilePlanExportPanel {...features} activePilePlanName={activePilePlanName} pileSizeFormat={pileSizeFormat} onPileSizeFormatChange={onPileSizeFormatChange}
        onExportPilePlanXlsx={onExportPilePlanXlsx} onExportPilePlanCsv={onExportPilePlanCsv} running={runningExport} runExport={runExport} />
    </div>
    {exportError && <Banner tone="error" word="">{exportError}</Banner>}
  </div></OpenAECProvider>;
}

function ExportOption({
  title,
  description,
  format,
  disabled,
  icon,
  actionLabel,
  onClick,
  children,
  additionalAction,
}: {
  title: string;
  description: string;
  format: string;
  disabled: boolean;
  icon: "project" | "table" | "rows";
  actionLabel: string;
  onClick: () => void;
  children?: ReactNode;
  additionalAction?: { label: string; onClick: () => void };
}) {
  return (
    <div className={`bs-export-card${children ? " has-options" : ""}`}>
      <div className="bs-export-card-icon" aria-hidden="true">
        <BlueprintIcon id={icon === "project" ? "file.open" : icon === "table" ? "view.grid" : "file.type-other"} size={24} />
      </div>
      <div className="bs-export-card-info">
        <div className="bs-export-card-heading">
          <Heading>{title}</Heading>
          <span className="bs-export-format">{format}</span>
        </div>
        <p>{description}</p>
        {children ? <div className="bs-export-card-options">{children}</div> : null}
      </div>
      <div className="bs-export-card-actions">
        {[{ label: actionLabel, onClick }, ...(additionalAction ? [additionalAction] : [])].map(action => (
          <Button key={action.label} kind="primary" icon="file.save" disabled={disabled} onClick={action.onClick}>
            <span>{action.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
