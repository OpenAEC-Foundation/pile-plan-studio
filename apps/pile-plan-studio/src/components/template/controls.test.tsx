import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ThemedNumberInput from "./ThemedNumberInput.tsx";
import InterfaceScaleNotice from "./InterfaceScaleNotice.tsx";

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
  fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowUp" }); expect(change).toHaveBeenCalledWith("2");
  change.mockClear(); view.rerender(<ThemedNumberInput aria-label="Size" type="text" value="2"
    onValueChange={change} onKeyDown={event => event.preventDefault()} />);
  fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowDown" }); expect(change).not.toHaveBeenCalled();
});

test.each([
  { start: "0.9", min: 0, max: 1, step: 0.3, expected: "0.9" },
  { start: "3", step: 2, expected: "4" },
  { start: "0", step: 1e-11, expected: "1e-11" },
])("number stepper follows the native grid from $start with step $step", ({ start, expected, ...bounds }) => {
  function Field() {
    const [value, setValue] = useState(start);
    return <form><ThemedNumberInput aria-label="Size" value={value} onValueChange={setValue} {...bounds} /></form>;
  }
  render(<Field />);
  const input = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Size" });
  act(() => input.focus());
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(input.value).toBe(expected);
  expect(input.form?.checkValidity()).toBe(true);
});

test("number stepper starts each action from the value accepted by the caller", () => {
  const change = vi.fn();
  render(<ThemedNumberInput aria-label="Size" value="1" onValueChange={change} />);
  const input = screen.getByRole("spinbutton", { name: "Size" });
  fireEvent.keyDown(input, { key: "ArrowUp" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(change.mock.calls).toEqual([["2"], ["0"]]);
});

test("a held stepper stops when focus moves to another field", () => {
  vi.useFakeTimers();
  try {
    const change = vi.fn();
    render(<><ThemedNumberInput aria-label="Size" value="1" onValueChange={change} /><input aria-label="Other" /></>);
    fireEvent.pointerDown(screen.getByRole("button", { name: /increase/i }), { button: 0 });
    const other = screen.getByRole("textbox", { name: "Other" });
    act(() => other.focus());
    act(() => vi.advanceTimersByTime(1000));
    expect(change.mock.calls).toEqual([["2"]]);
    expect(document.activeElement).toBe(other);
  } finally {
    vi.useRealTimers();
  }
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
