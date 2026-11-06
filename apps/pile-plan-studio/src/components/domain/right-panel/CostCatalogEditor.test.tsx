import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import CostCatalogEditor from "./CostCatalogEditor.tsx";
import { projectFixture } from "../../../test/projectFixture.ts";
import type { ComponentProps } from "react";

function props() {
  const capacity = { ...projectFixture().bearingCapacities[0], pile_size_mm: 290 };
  return {
    settings: { schema_version: 1, items: [
      { pile_size_mm: 290, shape: "square" as const, cost_per_m3: 545 },
      { pile_size_mm: 320, shape: "round" as const, cost_per_m3: 600 },
    ] },
    bearingCapacities: [capacity], currencyCode: "EUR", hasPersonalDefault: false,
    onEditCosts: vi.fn().mockResolvedValue(true), onSavePersonalDefault: vi.fn(),
    onLoadPersonalDefault: vi.fn(), onRemovePersonalDefault: vi.fn(),
    onLoadBuiltInDefault: vi.fn(), onClose: vi.fn(),
  } satisfies ComponentProps<typeof CostCatalogEditor>;
}

test("the project table has labelled native shape and currency fields", () => {
  render(<CostCatalogEditor {...props()} />);
  const table = screen.getByRole("table", { name: "Pile sizes in this project" });
  expect((within(table).getByRole("combobox", { name: "Shape, 290 mm" }) as HTMLSelectElement).value).toBe("square");
  expect((within(table).getByRole("spinbutton", { name: "Cost per m³, 290 mm (EUR)" }) as HTMLInputElement).value).toBe("545");
  expect((screen.getByRole("button", { name: "Remove pile size, 290 mm" }) as HTMLButtonElement).disabled).toBe(true);
});

test("row drafts commit on blur, roll back rejected edits and synchronize restored values", async () => {
  const p = props();
  p.onEditCosts.mockResolvedValueOnce(false).mockResolvedValue(true);
  const view = render(<CostCatalogEditor {...p} />);
  const price = screen.getByRole("spinbutton", { name: "Cost per m³, 290 mm (EUR)" }) as HTMLInputElement;
  fireEvent.change(price, { target: { value: "600" } });
  expect(p.onEditCosts).not.toHaveBeenCalled();
  fireEvent.blur(price);
  await waitFor(() => expect(price.value).toBe("545"));
  expect(p.onEditCosts).toHaveBeenLastCalledWith([{ action: "update", pile_size_mm: 290, cost_per_m3: 600 }]);
  fireEvent.change(price, { target: { value: "620" } });
  act(() => price.focus());
  fireEvent.keyDown(price, { key: "Enter" });
  await waitFor(() => expect(price.value).toBe("620"));
  view.rerender(<CostCatalogEditor {...p} settings={{ ...p.settings, items: p.settings.items.map(item => ({ ...item, cost_per_m3: 500 })) }} />);
  expect(price.value).toBe("500");
  expect(p.settings.items[0].cost_per_m3).toBe(545);
});

test("native shape edits and removing unused rows keep their existing actions", async () => {
  const p = props();
  render(<CostCatalogEditor {...p} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Shape, 290 mm" }), { target: { value: "round" } });
  await waitFor(() => expect(p.onEditCosts).toHaveBeenCalledWith([{ action: "update", pile_size_mm: 290, shape: "round" }]));
  fireEvent.click(screen.getByText("Other saved pile sizes (1)", { exact: true }));
  const remove = screen.getByRole("button", { name: "Remove pile size, 320 mm" });
  await waitFor(() => expect(remove.matches(":disabled")).toBe(false));
  fireEvent.click(remove);
  await waitFor(() => expect(p.onEditCosts).toHaveBeenLastCalledWith([{ action: "remove", pile_size_mm: 320 }]));
});

test("pending edits disable catalog controls and unavailable personal-default actions stay disabled", async () => {
  const p = props();
  let finish!: (accepted: boolean) => void;
  p.onEditCosts.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
  render(<CostCatalogEditor {...p} />);
  expect(screen.getByRole("button", { name: "Load user default" }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Remove user default" }).matches(":disabled")).toBe(true);
  const price = screen.getByRole("spinbutton", { name: "Cost per m³, 290 mm (EUR)" });
  fireEvent.change(price, { target: { value: "610" } });
  fireEvent.blur(price);
  expect(screen.getByRole("button", { name: "Add" }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("combobox", { name: "Shape, 290 mm" }).matches(":disabled")).toBe(true);
  await act(async () => finish(true));
  expect(screen.getByRole("button", { name: "Add" }).matches(":disabled")).toBe(false);
});


test("catalog activation keys do not reach viewer shortcuts, while Undo remains available", () => {
  const keyDown = vi.fn();
  render(<div onKeyDown={keyDown}><CostCatalogEditor {...props()} /></div>);
  const add = screen.getByRole("button", { name: "Add" });
  fireEvent.keyDown(add, { key: " ", code: "Space" });
  fireEvent.keyDown(add, { key: "Enter" });
  fireEvent.keyDown(screen.getByText("Other saved pile sizes (1)", { exact: true }), { key: " ", code: "Space" });
  expect(keyDown).not.toHaveBeenCalled();
  fireEvent.keyDown(add, { key: "z", ctrlKey: true });
  expect(keyDown).toHaveBeenCalledOnce();
});
