import type { PointerEvent as ReactPointerEvent } from "react";
import { classifyAppShortcut } from "../../domain/workspace/appShortcuts.ts";
import { DEFAULT_INTERFACE_SCALE, stepInterfaceScale } from "../../domain/settings/interfaceScale.ts";

type Dependencies = {
  isDesktop: boolean;
  saveInFlight: { current: boolean };
  save: () => (() => Promise<unknown>) | null;
  open: () => (() => Promise<unknown>) | null;
  currentScale: () => number;
  applyScale: (scale: number) => void;
};

export function createAppShortcutHandler(dependencies: Dependencies) {
  return (event: KeyboardEvent) => {
    const action = classifyAppShortcut(event, dependencies.isDesktop);
    if (!action) return;
    event.preventDefault();
    if (action === "save") {
      const save = dependencies.save();
      if (dependencies.saveInFlight.current || !save) return;
      dependencies.saveInFlight.current = true;
      void save().finally(() => { dependencies.saveInFlight.current = false; });
      return;
    }
    if (action === "open") {
      const open = dependencies.open();
      if (open) void open();
      return;
    }
    const scale = action === "zoom-reset" ? DEFAULT_INTERFACE_SCALE
      : stepInterfaceScale(dependencies.currentScale(), action === "zoom-in" ? 1 : -1);
    dependencies.applyScale(scale);
  };
}

export function dispatchHistoryShortcut(event: KeyboardEvent, request: (action: "undo" | "redo") => void) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditableTarget(event.target)) return;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) {
    event.preventDefault(); request("undo");
  } else if (key === "y" || (key === "z" && event.shiftKey)) {
    event.preventDefault(); request("redo");
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.matches("input:not([type='range']), textarea, select") || target.isContentEditable
  );
}

const POINTER_FOCUS_CONTROL_SELECTOR = "button, [role='option'], [role='tab'], [role='row'][tabindex='0']";
export function releasePointerActivatedControlFocus(event: ReactPointerEvent<HTMLDivElement>) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const control = target.closest<HTMLElement>(POINTER_FOCUS_CONTROL_SELECTOR);
  if (control && event.currentTarget.contains(control)) control.blur();
}
