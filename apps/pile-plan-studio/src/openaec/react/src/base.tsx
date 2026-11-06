import { createContext, useContext, type KeyboardEvent, type ReactNode } from "react";

/** Joins class names, leaving out empty ones. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

interface Settings {
  /** URL of the B2 sprite, such as `/icons/standard.svg` or `/icons/planner.svg` (web/icons). */
  sprite: string;
}

const SettingsContext = createContext<Settings>({ sprite: "icons/standard.svg" });

/** Tells the components where the B2 sprite of the app is. */
export function OpenAECProvider({ sprite, children }: { sprite: string; children: ReactNode }) {
  return <SettingsContext.Provider value={{ sprite }}>{children}</SettingsContext.Provider>;
}

/**
 * A B2 icon from the app's sprite. 16 px uses the 16 px drawing, 24 px the 24 px one.
 * It is decoration: name the control around it, not the icon.
 */
export function Icon({ id, size = 16, mono, className }: { id: string; size?: 16 | 24; mono?: boolean; className?: string }) {
  const { sprite } = useContext(SettingsContext);
  return (
    <svg className={cx("oa-icon", size === 24 && "oa-icon--24", mono && "oa-icon--mono", className)} aria-hidden="true" focusable="false">
      <use href={`${sprite}#i${size}-${id}`} />
    </svg>
  );
}

export type Theme = "light" | "dark" | "blueprint" | "high-contrast-dark" | "high-contrast-light";

export interface Display {
  theme?: Theme;
  /** Werkruimte: follow the theme, or always light or dark. */
  workspace?: "theme" | "light" | "dark";
  /** Statusbalk: follow the theme, or always dark. */
  statusbar?: "theme" | "dark";
  /** Tekstgrootte (issue #27). */
  text?: "compact" | "standard" | "large";
}

/** Applies the display settings to `<html>`, as the data-oa-* attributes of the tokens. */
export function applyDisplay(display: Display, root: HTMLElement = document.documentElement) {
  const set = (name: string, value: string | undefined, standard: string) => {
    if (!value || value === standard) root.removeAttribute(name);
    else root.setAttribute(name, value);
  };
  set("data-oa-theme", display.theme, "light");
  set("data-oa-workspace", display.workspace, "theme");
  set("data-oa-statusbar", display.statusbar, "theme");
  set("data-oa-text", display.text, "standard");
}

/** Moves focus between items with the arrow keys, Home and End (roving focus). */
export function arrowFocus(event: KeyboardEvent<HTMLElement>, selector: string, vertical = false) {
  const keys = vertical ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
  if (![...keys, "Home", "End"].includes(event.key)) return null;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)].filter((el) => !el.hasAttribute("disabled"));
  if (!items.length) return null;
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "Home" ? 0
    : event.key === "End" ? items.length - 1
    : event.key === keys[1] ? (current + 1) % items.length
    : (current - 1 + items.length) % items.length;
  event.preventDefault();
  items[next].focus();
  return next;
}
