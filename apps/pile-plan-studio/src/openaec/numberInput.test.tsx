import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { NumberField, NumberInput, type NumberInputProps } from "./number-field-preview";

afterEach(() => vi.useRealTimers());
function Field({ value: initial = "1,25", onValueChange = () => {}, ...props }: Partial<NumberInputProps>) {
  const [value, setValue] = useState(initial);
  return <NumberInput type="text" aria-label="Value" incrementLabel="Increase" decrementLabel="Decrease"
    {...props} value={value} onValueChange={next => { setValue(next); onValueChange(next); }} />;
}
test("number drafts retain comma and incomplete input without committing application values", () => {
  const change = vi.fn(); render(<Field onValueChange={change} />);
  const input = screen.getByRole("textbox", { name: "Value" }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "-" } }); expect(input.value).toBe("-");
  fireEvent.change(input, { target: { value: "" } }); expect(input.value).toBe("");
  fireEvent.change(input, { target: { value: "1,75" } }); expect(change).toHaveBeenLastCalledWith("1,75");
});
test("keyboard and accessible button actions share decimal stepping and bounds", () => {
  render(<Field value="2,45" min={0} max={2.5} step={0.1} />);
  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.keyDown(input, { key: "ArrowUp" }); expect(input.value).toBe("2.5");
  fireEvent.click(screen.getByRole("button", { name: "Decrease" })); expect(input.value).toBe("2.4");
});
test("holding repeats, a pointer click does not double-step, and releasing stops", () => {
  vi.useFakeTimers(); render(<Field step={1} />);
  const increase = screen.getByRole("button", { name: "Increase" });
  fireEvent.pointerDown(increase, { button: 0 });
  act(() => vi.advanceTimersByTime(510));
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("4.25");
  fireEvent.pointerUp(increase); fireEvent.click(increase, { detail: 1 });
  act(() => vi.advanceTimersByTime(500));
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("4.25");
  expect(vi.getTimerCount()).toBe(0);
});
test("inherited disabled state and read-only inputs reject every step route", () => {
  const change = vi.fn();
  const view = render(<fieldset disabled><Field onValueChange={change} /></fieldset>);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Increase" }), { button: 0 });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowUp" });
  expect(change).not.toHaveBeenCalled();
  view.rerender(<Field readOnly onValueChange={change} />);
  expect((screen.getByRole("button", { name: "Increase" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowDown" }); expect(change).not.toHaveBeenCalled();
});
test("window blur and unmount cancel pending repeat timers", () => {
  vi.useFakeTimers(); const change = vi.fn(); const view = render(<Field onValueChange={change} />);
  const increase = screen.getByRole("button", { name: "Increase" });
  fireEvent.pointerDown(increase, { button: 0 }); fireEvent(window, new Event("blur"));
  act(() => vi.advanceTimersByTime(1000)); expect(change).toHaveBeenCalledTimes(1);
  fireEvent.pointerDown(increase, { button: 0 }); view.unmount(); expect(vi.getTimerCount()).toBe(0);
});
test("caller keyboard guards run before stepping and ref targets the native input", () => {
  const change = vi.fn(), ref = { current: null as HTMLInputElement | null };
  const view = render(<Field inputRef={ref} onValueChange={change} onKeyDown={event => event.preventDefault()} />);
  expect(ref.current).toBe(screen.getByRole("textbox"));
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowUp" }); expect(change).not.toHaveBeenCalled();
  view.unmount(); expect(ref.current).toBeNull();
});
test("labelled field associates errors and keeps the same input control", () => {
  render(<NumberField label="Count" value="2" error="Invalid count" onValueChange={() => {}} />);
  const input = screen.getByLabelText("Count");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe("Invalid count");
});
