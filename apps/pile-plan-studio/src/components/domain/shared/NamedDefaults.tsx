import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  defaultNameInUse,
  type NamedDefault,
  type NamedDefaultEdit,
} from "../../../domain/settings/namedDefaults.ts";
import { Button, Select, TextField } from "../../../openaec/react/src/index";
import "./NamedDefaults.css";

export type NamedDefaultsBinding<T> = {
  profiles: NamedDefault<T>[];
  onEdit: (edit: NamedDefaultEdit<T>) => boolean;
};

type Props<T> = NamedDefaultsBinding<T> & {
  currentValue: T;
  disabled?: boolean;
  updateConfirmation: (name: string) => string;
  onLoad: (value: T) => string | Promise<string>;
  children?: ReactNode;
};

type Action = "save" | "rename" | "update" | "delete";

export default function NamedDefaults<T>({
  profiles, onEdit, currentValue, disabled = false, updateConfirmation, onLoad, children,
}: Props<T>) {
  const { t } = useTranslation("common");
  const root = useRef<HTMLDetailsElement>(null);
  const manageId = useId();
  const confirmationId = useId();
  const [selectedName, setSelectedName] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [managing, setManaging] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const selected = profiles.find(({ name }) => name === selectedName) ?? profiles[0];
  const renaming = action === "rename" && selected !== undefined;
  const editingName = action === "save" || renaming || !selected;
  const confirming = action === "update" || action === "delete";
  const name = nameDraft.trim();
  const duplicate = defaultNameInUse(profiles, name, renaming ? selected.name : undefined);
  const busy = disabled || loading;

  return (
    <details className="named-defaults" ref={root}>
      <summary>
        <span>{t("userDefaults.title")}</span>
        <span className="named-defaults-selection">{selected?.name ?? t("userDefaults.empty")}</span>
        <span aria-hidden="true" className="named-defaults-chevron" />
      </summary>
      <div className="named-defaults-content" onKeyDown={handleEscape}>
        {selected && (
          <>
            <Select compact label={t("userDefaults.choose")} value={selected.name} disabled={busy || action !== null}
              data-defaults-focus="select"
              options={profiles.map(({ name }) => ({ value: name, label: name }))}
              onChange={(event) => {
                setSelectedName(event.target.value);
                setFeedback("");
              }} />
            <div className="named-defaults-actions" hidden={action !== null}>
              <Button compact disabled={busy} onClick={() => void load(selected.value)}>
                {t("userDefaults.load")}
              </Button>
              <Button compact disabled={busy} data-defaults-focus="new" onClick={() => startAction("save")}>
                {t("userDefaults.new")}
              </Button>
              <Button compact kind="quiet" className="named-defaults-manage" disabled={busy}
                data-defaults-focus="manage" aria-controls={manageId} aria-expanded={managing}
                onClick={() => setManaging((open) => !open)}>
                {t("userDefaults.manage")}
                <span className="named-defaults-chevron" aria-hidden="true" />
              </Button>
            </div>
            <div id={manageId} className="named-defaults-actions named-defaults-management" hidden={!managing || action !== null}
              role="group" aria-label={t("userDefaults.manage")}>
              <Button compact kind="quiet" icon="object.rename" disabled={busy} onClick={() => startAction("rename")}>
                {t("userDefaults.rename")}
              </Button>
              <Button compact kind="quiet" disabled={busy} onClick={() => startAction("update")}>
                {t("userDefaults.update")}
              </Button>
              <Button compact kind="quiet" icon="edit.delete" disabled={busy} onClick={() => startAction("delete")}>
                {t("userDefaults.remove")}
              </Button>
            </div>
          </>
        )}
        {editingName && (
          <form onSubmit={saveName} className="named-defaults-name">
            <TextField compact label={t("userDefaults.name")} autoComplete="off" value={nameDraft}
              disabled={busy} autoFocus={action !== null}
              error={duplicate ? t("userDefaults.nameInUse") : undefined}
              onFocus={renaming ? (event) => event.currentTarget.select() : undefined}
              onChange={(event) => setNameDraft(event.target.value)} />
            <div className="named-defaults-actions">
              {selected && <Button compact kind="quiet" onClick={() => finishAction()}>
                {t("cancel")}
              </Button>}
              <Button compact type="submit" disabled={busy || !name || duplicate || (renaming && name === selected.name)}>
                {t(renaming ? "userDefaults.saveName" : "userDefaults.save")}
              </Button>
            </div>
          </form>
        )}
        {confirming && selected && (
          <div className="named-defaults-confirmation" role="group" aria-labelledby={confirmationId}>
            <p id={confirmationId}>{action === "delete"
              ? t("userDefaults.removeConfirm", { name: selected.name })
              : updateConfirmation(selected.name)}</p>
            <div className="named-defaults-actions">
              <Button compact kind="quiet" autoFocus onClick={() => finishAction()}>{t("cancel")}</Button>
              <Button compact kind={action === "delete" ? "danger" : "secondary"} disabled={busy}
                onClick={confirmAction}>
                {t(action === "delete" ? "userDefaults.remove" : "userDefaults.update")}
              </Button>
            </div>
          </div>
        )}
        <p className="named-defaults-feedback" role="status">{feedback}</p>
        {children && !action && <div className="named-defaults-extra">{children}</div>}
      </div>
    </details>
  );

  async function load(value: T) {
    setLoading(true);
    try {
      setFeedback(await onLoad(value));
    } catch {
      setFeedback(t("userDefaults.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  function edit(action: NamedDefaultEdit<T>, successKey: string): boolean {
    const changed = onEdit(action);
    setFeedback(t(changed ? successKey : "userDefaults.editFailed"));
    return changed;
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !name || duplicate || (renaming && name === selected.name)) return;
    const saved = renaming
      ? edit({ kind: "rename", name: selected.name, nextName: name }, "userDefaults.renamed")
      : edit({ kind: "save", name, value: currentValue }, "userDefaults.saved");
    if (saved) {
      setSelectedName(name);
      finishAction("select");
    }
  }

  function startAction(next: Action) {
    setNameDraft(next === "rename" ? selected.name : "");
    setFeedback("");
    setAction(next);
  }

  function confirmAction() {
    if (!selected || busy) return;
    if (action === "update" && edit({ kind: "update", name: selected.name, value: currentValue }, "userDefaults.saved")) {
      finishAction();
    }
    if (action === "delete" && edit({ kind: "delete", name: selected.name }, "userDefaults.removed")) {
      const index = profiles.indexOf(selected);
      setSelectedName((profiles[index + 1] ?? profiles[index - 1])?.name ?? "");
      setManaging(false);
      finishAction("select");
    }
  }

  function finishAction(focusTarget = action === "save" ? "new" : "manage") {
    setAction(null);
    setNameDraft("");
    requestAnimationFrame(() => {
      const target = root.current?.querySelector<HTMLElement>(`[data-defaults-focus="${focusTarget}"]`)
        ?? root.current?.querySelector<HTMLElement>("summary");
      target?.focus();
    });
  }

  function handleEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || event.target instanceof HTMLSelectElement || (!action && !managing)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!action) setManaging(false);
    finishAction();
  }
}
