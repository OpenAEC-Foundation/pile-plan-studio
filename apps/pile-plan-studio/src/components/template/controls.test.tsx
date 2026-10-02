import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Modal from "./Modal.tsx";
import ThemedSelect from "./ThemedSelect.tsx";
import ThemedNumberInput from "./ThemedNumberInput.tsx";
import InterfaceScaleNotice from "./InterfaceScaleNotice.tsx";

test("modal wraps keyboard focus, closes on Escape and restores the opening control", async () => {
  const close = vi.fn();
  const opener = document.createElement("button"); document.body.append(opener); opener.focus();
  const view = render(<Modal open title="Project" closeLabel="Sluiten" onClose={close}>
    <button>First</button><button>Last</button>
  </Modal>);
  expect(screen.getByRole("dialog", { name: "Project" }).getAttribute("aria-modal")).toBe("true");
  const first = screen.getByRole("button", { name: "Sluiten" });
  const last = screen.getByRole("button", { name: "Last" });
  await waitFor(() => expect(document.activeElement).toBe(first));
  first.focus(); fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: "Tab" }); expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "Escape" }); expect(close).toHaveBeenCalledOnce();
  view.unmount(); expect(document.activeElement).toBe(opener); opener.remove();
});

test("only the topmost modal closes on Escape", () => {
  const outer = vi.fn(), inner = vi.fn();
  render(<><Modal open title="Outer" onClose={outer}>outer</Modal>
    <Modal open title="Inner" onClose={inner}>inner</Modal></>);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(inner).toHaveBeenCalledOnce(); expect(outer).not.toHaveBeenCalled();
});

test("a nested listbox consumes Escape before the enclosing modal", () => {
  const close = vi.fn(), change = vi.fn();
  const view = render(<Modal open title="Project" onClose={close}>
    <ThemedSelect ariaLabel="Currency" value="EUR" options={[
      { value: "EUR", label: "Euro" }, { value: "USD", label: "Dollar" },
      { value: "GBP", label: "Pound", disabled: true },
    ]} onChange={change} />
  </Modal>);
  const trigger = screen.getByRole("button", { name: "Currency" });
  fireEvent.click(trigger);
  const list = screen.getByRole("listbox", { name: "Currency" });
  expect(view.container.contains(list)).toBe(false);
  expect((screen.getByRole("option", { name: "Pound" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("option", { name: "Pound" })); expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull(); expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(trigger, { key: "Escape" }); expect(close).toHaveBeenCalledOnce();
});

test("listbox selects one value and closes on an outside click", () => {
  const change = vi.fn();
  render(<ThemedSelect ariaLabel="Currency" value="EUR" options={[
    { value: "EUR", label: "Euro" }, { value: "USD", label: "Dollar" },
  ]} onChange={change} />);
  const trigger = screen.getByRole("button", { name: "Currency" });
  fireEvent.click(trigger); fireEvent.click(screen.getByRole("option", { name: "Dollar" }));
  expect(change).toHaveBeenCalledExactlyOnceWith("USD"); expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.click(trigger); fireEvent.mouseDown(document.body); expect(screen.queryByRole("listbox")).toBeNull();
});

test("number stepper repeats after its delay and stops on pointer release and unmount", () => {
  vi.useFakeTimers(); const change = vi.fn();
  function Field() { const [value, set] = useState("1.2"); return <ThemedNumberInput aria-label="Size" value={value}
    step="0.1" onValueChange={next => { change(next); set(next); }} />; }
  const view = render(<Field />); const up = screen.getByRole("button", { name: /increase/i });
  fireEvent.pointerDown(up, { button: 0 }); expect(change).toHaveBeenLastCalledWith("1.3");
  act(() => vi.advanceTimersByTime(349)); expect(change).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(81)); expect(change).toHaveBeenLastCalledWith("1.4");
  fireEvent.pointerUp(up); act(() => vi.advanceTimersByTime(1000)); expect(change).toHaveBeenCalledTimes(2);
  fireEvent.pointerDown(up, { button: 0 }); view.unmount();
  act(() => vi.advanceTimersByTime(1000)); expect(change).toHaveBeenCalledTimes(3);
});

test("text-mode arrow keys honor bounds and a caller that prevents the key event", () => {
  const change = vi.fn();
  const view = render(<ThemedNumberInput aria-label="Size" type="text" value="2" max="2"
    onValueChange={change} />);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowUp" }); expect(change).toHaveBeenCalledWith("2");
  change.mockClear(); view.rerender(<ThemedNumberInput aria-label="Size" type="text" value="2"
    onValueChange={change} onKeyDown={event => event.preventDefault()} />);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowDown" }); expect(change).not.toHaveBeenCalled();
});

test("scale notice actions work and interaction postpones its expiry", () => {
  vi.useFakeTimers(); const expire = vi.fn(), decrease = vi.fn(), increase = vi.fn(), reset = vi.fn();
  render(<InterfaceScaleNotice notice={{ id: 4, percent: 125 }} onExpire={expire}
    onDecrease={decrease} onIncrease={increase} onReset={reset} />);
  const status = screen.getByRole("status"); expect(status.textContent).toBe("125%");
  fireEvent.click(screen.getByRole("button", { name: /zoom -/i })); expect(decrease).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: /zoom \+/i })); expect(increase).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: /reset/i })); expect(reset).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(1000)); fireEvent.pointerEnter(status.parentElement!);
  act(() => vi.advanceTimersByTime(3000)); expect(expire).not.toHaveBeenCalled();
  fireEvent.pointerLeave(status.parentElement!); act(() => vi.advanceTimersByTime(1999)); expect(expire).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1)); expect(expire).toHaveBeenCalledExactlyOnceWith(4);
});
