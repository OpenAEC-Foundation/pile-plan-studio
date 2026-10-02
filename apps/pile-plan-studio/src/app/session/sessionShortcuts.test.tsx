import { act, fireEvent, render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createAppShortcutHandler, dispatchHistoryShortcut, releasePointerActivatedControlFocus } from "./sessionShortcuts.ts";

test("save shortcut uses the current action and suppresses concurrent saves until completion", async () => {
  let resolve!: () => void;
  let action = vi.fn(() => new Promise<void>(done => { resolve = done; }));
  const handler = createAppShortcutHandler({ isDesktop: true, saveInFlight: { current: false },
    save: () => action, open: () => null, currentScale: () => 100, applyScale: vi.fn() });
  const key = () => new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true });
  const event = key(); handler(event); handler(key()); expect(event.defaultPrevented).toBe(true); expect(action).toHaveBeenCalledOnce();
  await act(async () => resolve()); action = vi.fn().mockResolvedValue(undefined);
  handler(key()); expect(action).toHaveBeenCalledOnce(); await act(async () => {});
});
test("open and desktop zoom shortcuts read current callbacks and current scale", () => {
  const open = vi.fn(), scale = vi.fn(); let current = 100;
  const handler = createAppShortcutHandler({ isDesktop: true, saveInFlight: { current: false },
    save: () => null, open: () => open, currentScale: () => current, applyScale: scale });
  handler(new KeyboardEvent("keydown", { key: "o", ctrlKey: true })); expect(open).toHaveBeenCalledOnce();
  handler(new KeyboardEvent("keydown", { key: "+", ctrlKey: true })); expect(scale).toHaveBeenLastCalledWith(110);
  current = 150; handler(new KeyboardEvent("keydown", { key: "-", ctrlKey: true })); expect(scale).toHaveBeenLastCalledWith(140);
  handler(new KeyboardEvent("keydown", { key: "0", ctrlKey: true })); expect(scale).toHaveBeenLastCalledWith(100);
});
test("history shortcuts respect editors, allow sliders, and recognize both redo bindings", () => {
  const request = vi.fn(); const view = render(<div onKeyDown={event => dispatchHistoryShortcut(event.nativeEvent, request)}>
    <input aria-label="Text" /><input aria-label="Slider" type="range" /><textarea /><button>Action</button>
  </div>);
  const text = view.container.querySelector('input:not([type="range"])')!;
  fireEvent.keyDown(text, { key: "z", ctrlKey: true }); expect(request).not.toHaveBeenCalled();
  fireEvent.keyDown(view.container.querySelector("textarea")!, { key: "z", metaKey: true }); expect(request).not.toHaveBeenCalled();
  const slider = view.container.querySelector('input[type="range"]')!;
  fireEvent.keyDown(slider, { key: "z", ctrlKey: true }); expect(request).toHaveBeenLastCalledWith("undo");
  fireEvent.keyDown(slider, { key: "z", metaKey: true, shiftKey: true }); expect(request).toHaveBeenLastCalledWith("redo");
  fireEvent.keyDown(slider, { key: "y", ctrlKey: true }); expect(request).toHaveBeenCalledTimes(3);
  fireEvent.keyDown(slider, { key: "z", ctrlKey: true, altKey: true }); expect(request).toHaveBeenCalledTimes(3);
});
test("pointer activation releases control focus but preserves focus in text editors", () => {
  const view = render(<div onPointerUpCapture={releasePointerActivatedControlFocus}>
    <button><span>Action</span></button><input />
  </div>);
  const button = view.container.querySelector("button")!; button.focus(); fireEvent.pointerUp(button.firstChild!);
  expect(document.activeElement).not.toBe(button);
  const input = view.container.querySelector("input")!; input.focus(); fireEvent.pointerUp(input);
  expect(document.activeElement).toBe(input);
});
