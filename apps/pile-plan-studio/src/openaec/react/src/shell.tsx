import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { arrowFocus, cx, Icon } from "./base";

export function Heading({ level = "panel", children, id }: { level?: "panel" | "dialog" | "page"; children: ReactNode; id?: string }) {
  const Tag = level === "page" ? "h2" : level === "dialog" ? "h3" : "h4";
  return <Tag id={id} className={cx("oa-heading", `oa-heading--${level}`)}>{children}</Tag>;
}

export function MonoLabel({ children }: { children: ReactNode }) {
  return <span className="oa-mono-label">{children}</span>;
}

export interface TabItem {
  id: string;
  label: string;
}

/** Ribbon tabs: a tab list with arrow keys; only the active tab is in the Tab order. */
export function Tabs({ label, tabs, active, onSelect }: { label: string; tabs: TabItem[]; active: string; onSelect: (id: string) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = arrowFocus(event, "[role=tab]");
    if (index !== null) onSelect(tabs[index].id);
  };
  return (
    <div className="oa-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === active} tabIndex={t.id === active ? 0 : -1} onClick={() => onSelect(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export interface DocumentTab {
  id: string;
  title: string;
  /** Unsaved changes: an amber dot, and "niet opgeslagen" for screen readers. */
  dirty?: boolean;
}

/** Document tabs with a close button each. */
export function DocumentTabs({ tabs, active, onSelect, onClose, label = "Documenten", closeLabel = "Sluiten", unsavedLabel = "niet opgeslagen" }: {
  tabs: DocumentTab[];
  active: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  label?: string;
  closeLabel?: string;
  unsavedLabel?: string;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = arrowFocus(event, "[role=tab]");
    if (index !== null) onSelect(tabs[index].id);
  };
  return (
    <div className="oa-document-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <span key={t.id} className="oa-document-tab" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} title={t.title}
            onClick={() => onSelect(t.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(t.id); } }}>
            <span className="oa-truncate">{t.title}</span>
            {t.dirty && <span className="oa-dirty" role="img" aria-label={unsavedLabel} />}
            <button type="button" className="oa-icon-button oa-icon-button--small" aria-label={`${closeLabel}: ${t.title}`} tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onClose(t.id); }}>
              <Icon id="ui.close" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

/** A side panel with a header of 24 px. */
export function Panel({ title, actions, children, className, style }: { title: string; actions?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={cx("oa-panel", className)} style={style} aria-label={title}>
      <div className="oa-panel-header"><span className="oa-mono-label">{title}</span>{actions}</div>
      {children}
    </section>
  );
}

/** A row of the property grid: name and value. */
export function PropertyRow({ name, children }: { name: string; children: ReactNode }) {
  return <div className="oa-property"><span>{name}</span>{children}</div>;
}

export interface Column<Row> {
  key: keyof Row & string;
  label: string;
  /** Numbers and amounts: mono, right-aligned. */
  numeric?: boolean;
  /** Longer text is shortened with "…"; the full text shows as tooltip. */
  maxWidth?: number;
}

/**
 * A table without zebra stripes. With `onSelect` the rows are selectable: click,
 * or Up and Down on the focused row.
 */
export function Table<Row extends Record<string, ReactNode>>({ label, columns, rows, selected, onSelect, rowKey }: {
  label: string;
  columns: Column<Row>[];
  rows: Row[];
  selected?: number;
  onSelect?: (index: number) => void;
  rowKey?: (row: Row, index: number) => string;
}) {
  const move = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (!onSelect) return;
    const next = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : -2;
    if (next === -2 || next < 0 || next >= rows.length) return;
    event.preventDefault();
    onSelect(next);
    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <table className="oa-table" aria-label={label}>
      <thead>
        <tr>{columns.map((c) => <th key={c.key} scope="col" style={c.numeric ? { textAlign: "right" } : undefined}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const on = selected === i;
          return (
            <tr key={rowKey ? rowKey(row, i) : i} aria-selected={onSelect ? on : undefined} tabIndex={onSelect ? (on || (selected === undefined && i === 0) ? 0 : -1) : undefined}
              onClick={onSelect && (() => onSelect(i))} onKeyDown={(e) => move(e, i)}>
              {columns.map((c) => {
                const value = row[c.key];
                if (c.numeric) return <td key={c.key} className="oa-number">{value}</td>;
                if (c.maxWidth && typeof value === "string") {
                  return <td key={c.key} data-oa-tip={value}><span className="oa-truncate" style={{ maxWidth: c.maxWidth }}>{value}</span></td>;
                }
                return <td key={c.key}>{value}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The status bar: a message on the left, facts on the right. */
export function StatusBar({ message, items = [] }: { message: ReactNode; items?: ReactNode[] }) {
  return (
    <footer className="oa-statusbar" role="status">
      <span>{message}</span>
      <span className="oa-spacer" />
      {items.map((item, i) => <span key={i}>{item}</span>)}
    </footer>
  );
}

export interface SidebarItem {
  id: string;
  label: string;
  icon?: string;
  href?: string;
}

/** The sidebar of a workflow app; the current page is marked with aria-current. */
export function Sidebar({ title, items, current, onSelect }: { title: string; items: SidebarItem[]; current: string; onSelect?: (id: string) => void }) {
  return (
    <nav className="oa-sidebar" aria-label={title}>
      <span className="oa-mono-label">{title}</span>
      {items.map((item) => (
        <a key={item.id} href={item.href ?? "#"} aria-current={item.id === current ? "page" : undefined}
          onClick={onSelect && ((e) => { e.preventDefault(); onSelect(item.id); })}>
          {item.icon && <Icon id={item.icon} />} {item.label}
        </a>
      ))}
    </nav>
  );
}

/** The step bar of a workflow app. Steps before `current` are done. */
export function Steps({ steps, current, label = "Stappen" }: { steps: string[]; current: number; label?: string }) {
  return (
    <ol className="oa-steps" aria-label={label}>
      {steps.map((step, i) => (
        <li key={step} className={i < current ? "oa-done" : undefined} aria-current={i === current ? "step" : undefined}>{step}</li>
      ))}
    </ol>
  );
}

/** The action bar at the bottom of a workflow step. */
export function ActionBar({ info, children }: { info?: ReactNode; children: ReactNode }) {
  return <div className="oa-action-bar">{info && <span className="oa-secondary">{info}</span>}{children}</div>;
}

/** An empty state: icon, title, a line of help and an optional action. */
export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="oa-empty">
      <Icon id={icon} size={24} />
      <b style={{ color: "var(--oa-text)" }}>{title}</b>
      {children && <span>{children}</span>}
      {action}
    </div>
  );
}
