import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { arrowFocus, cx, Icon } from "./base";
import { Button } from "./controls";
import type { Tone } from "./tiles";

const WORD: Record<Tone, string> = { error: "Fout.", warning: "Let op.", success: "Gelukt.", info: "Info." };
const ICON: Record<Tone, string> = { error: "status.error", warning: "status.warning", success: "status.success", info: "status.info" };

export interface BannerProps {
  tone: Tone;
  children: ReactNode;
  /** The bold word before the text; by default "Fout.", "Let op.", "Gelukt." or "Info.". */
  word?: string;
  /** An action, such as a compact button. */
  action?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}

/**
 * A message in the page: tint, bar, icon and a word, so colour is never the only
 * signal. An error is announced at once (role alert), the others politely (status).
 */
export function Banner({ tone, children, word, action, onClose, closeLabel = "Sluiten" }: BannerProps) {
  return (
    <div className={cx("oa-banner", `oa-banner--${tone}`)} role={tone === "error" ? "alert" : "status"}>
      <Icon id={ICON[tone]} />
      <b>{word ?? WORD[tone]}</b>
      <span>{children}</span>
      {action}
      {onClose && (
        <button type="button" className="oa-icon-button oa-icon-button--small" aria-label={closeLabel} onClick={onClose}>
          <Icon id="ui.close" />
        </button>
      )}
    </div>
  );
}

/**
 * A message at the bottom right. It goes after five seconds; an error stays until
 * it is closed (04-componenten.md, decision 3).
 */
export function Toast({ tone = "success", title, children, onClose, closeLabel = "Sluiten" }: { tone?: Tone; title: string; children?: ReactNode; onClose: () => void; closeLabel?: string }) {
  useEffect(() => {
    if (tone === "error") return;
    const timer = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timer);
  }, [tone, onClose]);
  return (
    <div className="oa-toast" role={tone === "error" ? "alert" : "status"}>
      <Icon id={ICON[tone]} />
      <div><b>{title}</b>{children && <span className="oa-secondary">{children}</span>}</div>
      <button type="button" className="oa-icon-button oa-icon-button--small" aria-label={closeLabel} onClick={onClose}>
        <Icon id="ui.close" />
      </button>
    </div>
  );
}

export type MenuEntry =
  | { label: string; icon?: string; keys?: string; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | "separator";

/** A menu: arrow keys, Home and End move between the items. */
export function Menu({ label, items, className }: { label: string; items: MenuEntry[]; className?: string }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => arrowFocus(event, "[role=menuitem]", true);
  return (
    <div className={cx("oa-menu", className)} role="menu" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item, i) =>
        item === "separator" ? (
          <hr key={`sep-${i}`} />
        ) : (
          <button key={item.label} type="button" role="menuitem" className={item.danger ? "oa-danger" : undefined} disabled={item.disabled} onClick={item.onSelect} aria-keyshortcuts={item.keys?.replace(/Ctrl/g, "Control")}>
            {item.icon && <Icon id={item.icon} />}
            {item.label}
            {item.keys && <kbd>{item.keys}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  /** The buttons at the bottom right, primary last. */
  actions?: ReactNode;
}

/**
 * A modal dialog on the browser's own <dialog>: focus stays inside, Escape closes
 * it through `onClose`, and focus returns to where it was.
 */
export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="oa-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h3 className="oa-heading oa-heading--dialog" id={titleId}>{title}</h3>
      {children}
      {actions && <div className="oa-dialog-actions">{actions}</div>}
    </dialog>
  );
}

/**
 * The update notice for the title bar (issue #33), as `design::update::notice` in
 * openaec-ui: the new version and a compact "Bijwerken" button. The app gets
 * `latest` and `current` from the plugin openaec-update (command `check`), runs
 * its close plan in `onUpdate` and then calls `update_now`, which hands the
 * update to the OpenAEC Installer.
 */
export function UpdateNotice({ latest, current, onUpdate, label = "Bijwerken" }: { latest: string; current: string; onUpdate: () => void; label?: string }) {
  const text = `Versie ${latest} staat klaar`;
  return (
    <span className="oa-update-notice" role="status" aria-label={`${text}. Nu ${current}. ${label} opent de OpenAEC Installer.`}>
      <span aria-hidden="true">{text}</span>
      <Button kind="primary" compact onClick={onUpdate}>
        {label}
      </Button>
    </span>
  );
}
