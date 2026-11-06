import type { AnchorHTMLAttributes, ButtonHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { arrowFocus, cx, Icon } from "./base";

export type Tone = "success" | "warning" | "error" | "info";

/** A status label in mono. Colour is never the only signal: the text says it. */
export function Status({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("oa-status", tone && `oa-status--${tone}`)}>{children}</span>;
}

export function Chip({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("oa-chip", tone && `oa-chip--${tone}`)}>{children}</span>;
}

export interface PillProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  count?: number;
  /** A discipline letter, such as "C". */
  letter?: string;
  active: boolean;
}

/** A filter pill with a count; it is a toggle button. */
export function Pill({ label, count, letter, active, type = "button", ...rest }: PillProps) {
  return (
    <button type={type} className="oa-pill" aria-pressed={active} {...rest}>
      {letter && <span className="oa-pill-letter" aria-hidden="true">{letter}</span>}
      {label}
      {count !== undefined && <span className="oa-count">{count}</span>}
    </button>
  );
}

interface TileContent {
  icon: string;
  title: ReactNode;
  text?: ReactNode;
}

function TileBody({ icon, title, text }: TileContent) {
  return (
    <>
      <span className="oa-icon-tile"><Icon id={icon} size={24} /></span>
      <span>
        <span className="oa-tile-title">{title}</span>
        {text && <><br /><span className="oa-tile-text">{text}</span></>}
      </span>
    </>
  );
}

/** A task tile: a link with `href`, otherwise a button. */
export function Tile({ icon, title, text, href, onClick, ...rest }: TileContent & { href?: string; onClick?: () => void } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "title" | "onClick">) {
  if (href) {
    return <a className="oa-tile" href={href} onClick={onClick} {...rest}><TileBody icon={icon} title={title} text={text} /></a>;
  }
  return <button type="button" className="oa-tile" onClick={onClick}><TileBody icon={icon} title={title} text={text} /></button>;
}

export interface ChoiceTileOption extends TileContent {
  value: string;
}

/**
 * Choice tiles: one of several, as a radio group. Arrow keys move and choose;
 * only the chosen tile is in the Tab order.
 */
export function ChoiceTiles({ label, options, value, onChange, className }: { label: string; options: ChoiceTileOption[]; value: string; onChange: (value: string) => void; className?: string }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = arrowFocus(event, "[role=radio]", event.key === "ArrowUp" || event.key === "ArrowDown");
    if (index !== null) onChange(options[index].value);
  };
  return (
    <div role="radiogroup" aria-label={label} className={className} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} className="oa-tile oa-tile--choice" onClick={() => onChange(o.value)}>
            <span className="oa-icon-tile"><Icon id={o.icon} size={24} /></span>
            <span className="oa-radio-dot" aria-hidden="true" />
            <span className="oa-tile-title">{o.title}</span>
            {o.text && <span className="oa-tile-text">{o.text}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface RecentItem {
  name: string;
  path?: string;
  when?: string;
  href?: string;
  onOpen?: () => void;
}

/** The list of recent projects on the start screen. */
export function RecentList({ items, label = "Recente projecten" }: { items: RecentItem[]; label?: string }) {
  return (
    <nav className="oa-recent" aria-label={label}>
      {items.map((item) => (
        <a key={(item.path ?? "") + item.name} href={item.href ?? "#"} onClick={item.onOpen && ((e) => { e.preventDefault(); item.onOpen?.(); })}>
          <Icon id="project.folder" />
          <span><b>{item.name}</b> {item.path && <span className="oa-secondary">{item.path}</span>}</span>
          {item.when && <span className="oa-meta">{item.when}</span>}
        </a>
      ))}
    </nav>
  );
}

/** A card with labelled facts, as a description list. */
export function InfoCard({ title, facts }: { title: string; facts: [string, ReactNode][] }) {
  return (
    <div className="oa-info-card">
      <span className="oa-mono-label">{title}</span>
      <dl>{facts.map(([term, value]) => <div key={term} style={{ display: "contents" }}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
    </div>
  );
}

/** A large figure with its label, as on the installer. */
export function FigureTile({ value, label, accent }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="oa-figure-tile">
      <div className={cx("oa-figure", accent && "oa-figure--accent")}>{value}</div>
      <span className="oa-mono-label">{label}</span>
    </div>
  );
}
