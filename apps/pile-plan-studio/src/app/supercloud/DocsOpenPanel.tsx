import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Heading } from "../../openaec/react/src/index";
import type { SiteHost } from "./docsSession.ts";

export default function DocsOpenPanel({ host, onOpen }: {
  host?: SiteHost;
  onOpen: (id: string, reportError: (message: string) => void) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<Awaited<ReturnType<SiteHost["list"]>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [openError, setOpenError] = useState("");
  const [opening, setOpening] = useState(false);
  const open = async (id: string) => {
    setOpenError("");
    setOpening(true);
    try { await onOpen(id, setOpenError); }
    finally { setOpening(false); }
  };
  useEffect(() => {
    if (!host) return;
    let active = true;
    setFiles(null);
    setFailed(false);
    void host.list().then(list => { if (active) setFiles(list); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [host]);

  return <section className="bs-open-panel" aria-label={t("supercloud.open")}>
    <Heading level="page">{t("supercloud.open")}</Heading>
    {openError && <p role="alert">{openError}</p>}
    {!host || failed
      ? <p role="alert">{t(host ? "supercloud.listFailed" : "supercloud.unavailable")}</p>
      : files === null ? <p role="status">{t("supercloud.loading")}</p>
      : files.length === 0 ? <EmptyState icon="file.open" title={t("supercloud.empty")} />
      : <ul className="bs-recent-list">{files.map(file => <li className="bs-recent-item" key={file.id}>
        <Button kind="quiet" className="bs-recent-open" icon="file.type-project" disabled={opening} onClick={() => void open(file.id)}>
          {file.name}
        </Button>
      </li>)}</ul>}
  </section>;
}
