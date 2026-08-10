export type AppShortcut = "save" | "zoom-in" | "zoom-out" | "zoom-reset";

export type ShortcutEvent = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export function classifyAppShortcut(event: ShortcutEvent, isDesktop: boolean): AppShortcut | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.repeat) return null;

  const key = event.key.toLowerCase();
  if (key === "s") return "save";
  if (!isDesktop) return null;

  if (key === "+" || key === "=") return "zoom-in";
  if (key === "-" || key === "_") return "zoom-out";
  if (key === "0") return "zoom-reset";
  return null;
}
