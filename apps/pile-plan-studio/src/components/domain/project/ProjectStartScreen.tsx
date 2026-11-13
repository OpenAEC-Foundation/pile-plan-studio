import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, IconButton, OpenAECProvider, Tile } from "../../../openaec/react/src/index";
import type { RecentFile } from "../../../domain/project/recentProjects.ts";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "./projectStartScreen.css";

export type ProjectStartPage = "home" | "new";

type Props = {
  page: ProjectStartPage;
  currentProjectName?: string;
  busy: boolean;
  fromEditor?: boolean;
  notice?: ReactNode;
  children?: ReactNode;
  recentFiles?: readonly RecentFile[];
  onShowPage: (page: ProjectStartPage) => void;
  onResume: () => void;
  onSample: () => void;
  onTour: () => void;
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
};

export default function ProjectStartScreen({
  page, currentProjectName, busy, fromEditor = false, notice, children, recentFiles = [],
  onShowPage, onResume, onSample, onTour, onOpenProject, onOpenRecent, onRemoveRecent,
}: Props) {
  const { t } = useTranslation();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const scrollArea = useRef<HTMLElement>(null);
  const previousPage = useRef<ProjectStartPage | null>(null);
  useEffect(() => {
    if (scrollArea.current) scrollArea.current.scrollTop = 0;
    if ((previousPage.current !== null && previousPage.current !== page) || fromEditor) {
      heading.current?.focus({ preventScroll: true });
    }
    previousPage.current = page;
  }, [fromEditor, page]);

  return <OpenAECProvider sprite={spriteUrl}>
    <section ref={scrollArea} className="oa-app project-start-screen" aria-labelledby={headingId}>
      <div className={`project-start-body project-start-body--${page}`}>
        {page !== "home" && <Button kind="quiet" icon="nav.back" disabled={busy}
          onClick={fromEditor ? onResume : () => onShowPage("home")}>
          {t(fromEditor ? "startScreen.resume" : "startScreen.title")}
        </Button>}
        <h1 ref={heading} id={headingId} tabIndex={-1} className="oa-heading oa-heading--page">
          {t(page === "home" ? "startScreen.title" : "startScreen.newProject")}
        </h1>
        {notice}
        {page === "home" ? <>
          {currentProjectName !== undefined && <div className="project-start-current">
            <span>{currentProjectName}</span>
            <Button kind="primary" onClick={onResume} disabled={busy}>{t("startScreen.resume")}</Button>
          </div>}
          <div className="project-start-columns">
            <fieldset className="project-start-actions" disabled={busy}>
              <legend className="oa-mono-label">{t("startScreen.actions")}</legend>
              <Tile icon="file.new" title={t("startScreen.newProject")} text={t("startScreen.newDescription")}
                onClick={() => onShowPage("new")} />
              <Tile icon="file.open" title={t("startScreen.openProject")} text={t("startScreen.openDescription")}
                onClick={onOpenProject} />
              <Tile icon="file.type-project" title={t("startScreen.sample")} text={t("startScreen.sampleDescription")}
                onClick={onSample} />
              <Tile icon="ui.about" title={t("startScreen.tour")} text={t("startScreen.tourDescription")} onClick={onTour} />
            </fieldset>
            <RecentStartProjects files={recentFiles} busy={busy} onOpen={onOpenRecent} onRemove={onRemoveRecent} />
          </div>
        </> : children}
      </div>
    </section>
  </OpenAECProvider>;
}

function RecentStartProjects({ files, busy, onOpen, onRemove }: {
  files: readonly RecentFile[];
  busy: boolean;
  onOpen: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const projectsHeading = useId();
  const formatDate = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium" });

  return <section className="project-start-recents" aria-labelledby={projectsHeading}>
      <h2 className="oa-mono-label" id={projectsHeading}>{t("startScreen.recentProjects")}</h2>
      {files.length === 0
        ? <EmptyState icon="file.open" title={t("backstage:openPanel.noRecent")} />
        : <ul className="project-start-cards">
          {files.map(file => <li key={file.path}>
            <button type="button" className="oa-tile oa-project-card" disabled={busy}
              aria-label={t("backstage:openPanel.openRecent", { name: file.name })}
              title={file.storage === "browser" ? undefined : file.path}
              onClick={() => onOpen(file.path)}>
              <span className="oa-preview" aria-hidden="true">
                <img src={`${import.meta.env.BASE_URL}pile-plan-studio-icon.png`} alt="" />
              </span>
              <span className="oa-card-body">
                <span className="oa-tile-title">{file.name}</span>
                <span className="oa-meta">{formatDate.format(file.timestamp)}</span>
                {file.storage === "browser" && <span className="oa-meta">{t("backstage:openPanel.localCopy")}</span>}
              </span>
            </button>
            <IconButton className="project-start-remove" icon="ui.close" small disabled={busy}
              label={t("backstage:openPanel.removeFile", { name: file.name })}
              data-oa-tip={undefined} data-tooltip={t("backstage:openPanel.removeFile", { name: file.name })}
              onClick={() => onRemove(file.path)} />
          </li>)}
        </ul>}
      {files.some(file => file.storage === "browser") && <p className="oa-secondary">
        {t("backstage:openPanel.localCopiesHelp")}
      </p>}
  </section>;
}
