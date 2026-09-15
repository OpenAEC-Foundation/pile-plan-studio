import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import sampleProjectText from "../../../sample_project/sample_project.ifcpp?raw";

import AppSession, { type AppSessionProps } from "./app/session/AppSession.tsx";
import { readProjectDocumentCore } from "./core/coreClient.ts";
import { ProjectDocumentReadError, type ProjectDocumentOutcome } from "./core/projectDocumentContract.ts";
import { isDesktopRuntime } from "./domain/projectPersistence.ts";
import { validateOpenedProject } from "./domain/openedProject.ts";
import {
  createIndexedDbRecoveryStore,
  type BrowserRecoveryStore,
} from "./domain/browserRecoveryStore.ts";
import { loadBrowserRecovery } from "./domain/browserRecoveryStartup.ts";

type AppBootstrap =
  | { kind: "loading" }
  | ({ kind: "ready" } & AppSessionProps);

export default function App() {
  const { t } = useTranslation();
  const isDesktop = isDesktopRuntime();
  const [bootstrap, setBootstrap] = useState<AppBootstrap>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const loadSampleProject = async () => (
        requireValidProjectDocument(await readProjectDocumentCore(sampleProjectText))
      );
      if (isDesktop) {
        const initialProject = await loadSampleProject();
        if (!cancelled) setBootstrap({
          kind: "ready",
          initialProject,
          initializeDefaultPiles: true,
        });
        return;
      }
      if (!window.indexedDB) {
        const initialProject = await loadSampleProject();
        if (!cancelled) setBootstrap({
          kind: "ready",
          initialProject,
          initializeDefaultPiles: true,
          initialStatusKey: "recovery.unavailable",
        });
        return;
      }
      const recoveryStore: BrowserRecoveryStore = createIndexedDbRecoveryStore(window.indexedDB);
      const result = await loadBrowserRecovery({
        isDesktop: false,
        store: recoveryStore,
        validateProject: (text) => validateOpenedProject(text, {
          readProjectDocument: readProjectDocumentCore,
        }),
      });
      if (cancelled) return;
      if (result.kind === "restored") {
        setBootstrap({
          kind: "ready",
          initialProject: result.project,
          initializeDefaultPiles: false,
          initialSavedProjectSignature: result.record.savedProjectSignature,
          initialWasDirty: result.record.isDirty,
          initialStatusKey: "recovery.restored",
          recoveryStore,
        });
      } else {
        const initialProject = await loadSampleProject();
        setBootstrap({
          kind: "ready",
          initialProject,
          initializeDefaultPiles: true,
          initialStatusKey: result.kind === "invalid"
            ? "recovery.invalid"
            : result.kind === "unavailable"
              ? "recovery.unavailable"
              : undefined,
          recoveryStore: result.kind === "unavailable" ? undefined : recoveryStore,
        });
      }
      void navigator.storage?.persist?.().catch(() => false);
    };
    void start();
    return () => { cancelled = true; };
  }, [isDesktop]);

  if (bootstrap.kind === "loading") {
    return <div className="app-bootstrap" role="status">{t("recovery.loading")}</div>;
  }

  return <AppSession {...bootstrap} />;
}

function requireValidProjectDocument(
  outcome: ProjectDocumentOutcome,
): Extract<ProjectDocumentOutcome, { status: "valid" }> {
  if (outcome.status === "invalid") throw new ProjectDocumentReadError(outcome.error);
  return outcome;
}
