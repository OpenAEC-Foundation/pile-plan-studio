import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import SourceDataViewer from "./SourceDataViewer.tsx";
import { projectFixture } from "../../../test/projectFixture.ts";

let resizeCallbacks: Array<() => void> = [];
beforeEach(() => {
  resizeCallbacks = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resizeCallbacks.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
function props() {
  const state = projectFixture();
  return { source: state.inputSources.find(s => s.kind === "load_points")!, loadPoints: state.loadPoints.slice(0, 3),
    cpts: state.cpts.slice(0, 3), bearingCapacities: state.bearingCapacities,
    selectedLoadPointId: null, selectedLoadPointIds: [], selectedCptId: null, lockedLoadPointIds: new Set<number>(),
    selectionDisabled: false, onSelectLoadPoints: vi.fn(), onSelectCpt: vi.fn(), onClearSelection: vi.fn(), onClose: vi.fn() };
}
test("source rows select load points but locked rows and edit modes reject selection", () => {
  const p = props(); const view = render(<SourceDataViewer {...p} />);
  const rows = () => view.container.querySelectorAll('.source-table-row');
  fireEvent.click(rows()[0]); expect(p.onSelectLoadPoints).toHaveBeenCalledOnce();
  const id = p.loadPoints[0].id;
  expect(p.onSelectLoadPoints.mock.calls[0][0].loadPointIds).toEqual([id]);
  view.rerender(<SourceDataViewer {...p} lockedLoadPointIds={new Set([id])} />);
  fireEvent.click(rows()[0]); expect(p.onSelectLoadPoints).toHaveBeenCalledOnce();
  view.rerender(<SourceDataViewer {...p} selectionDisabled />);
  fireEvent.click(rows()[1]); expect(p.onSelectLoadPoints).toHaveBeenCalledOnce();
});
test("CPT rows use their own callback and advice rows never select a load point or CPT", () => {
  const p = props(); const state = projectFixture();
  const view = render(<SourceDataViewer {...p} source={state.inputSources.find(s => s.kind === "cpts")!} />);
  fireEvent.click(view.container.querySelector('.source-table-row')!);
  expect(p.onSelectCpt).toHaveBeenCalledWith(p.cpts[0].id); expect(p.onSelectLoadPoints).not.toHaveBeenCalled();
  view.rerender(<SourceDataViewer {...p} source={state.inputSources.find(s => s.kind === "bearing_capacities")!} />);
  fireEvent.click(view.container.querySelector('.source-table-row')!); expect(p.onSelectCpt).toHaveBeenCalledOnce();
});
test("typing a column filter changes the rendered rows and outside clicks dismiss the filter", () => {
  const p = props(); const view = render(<SourceDataViewer {...p} />);
  fireEvent.click(view.container.querySelector('.source-filter-trigger')!);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: String(p.loadPoints[1].id) } });
  expect(view.container.querySelectorAll('.source-table-row')).toHaveLength(1);
  fireEvent.pointerDown(document.body); expect(screen.queryByRole("textbox")).toBeNull();
});
test("Escape and the header clear selection, while interactive header controls do not", () => {
  const p = props(); const view = render(<SourceDataViewer {...p} />);
  fireEvent.keyDown(window, { key: "Escape" }); expect(p.onClearSelection).toHaveBeenCalledOnce();
  fireEvent.pointerDown(view.container.querySelector('h2')!); expect(p.onClearSelection).toHaveBeenCalledTimes(2);
  fireEvent.pointerDown(view.container.querySelector('.source-close-button')!); expect(p.onClearSelection).toHaveBeenCalledTimes(2);
});
test("large source tables render a bounded window and scroll to a different set of rows", () => {
  const p = props(); const points = Array.from({ length: 500 }, (_, i) => ({ ...p.loadPoints[0], id: i + 1, name: String(i + 1) }));
  const view = render(<SourceDataViewer {...p} loadPoints={points} />);
  const rows = () => [...view.container.querySelectorAll('.source-table-row')].map(row => row.textContent);
  const before = rows(); expect(before.length).toBeLessThan(50);
  fireEvent.scroll(view.container.querySelector('.source-table-scroll')!, { target: { scrollTop: 3000 } });
  expect(rows()).not.toEqual(before); expect(rows().length).toBeLessThan(50);
});

test("sorting cycles through numeric ID order and keyboard activation selects the displayed row", () => {
  const p = props(); const points = [3, 1, 2].map(id => ({ ...p.loadPoints[0], id }));
  const view = render(<SourceDataViewer {...p} loadPoints={points} />);
  const ids = () => [...view.container.querySelectorAll('.source-table-row')].map(row => row.firstElementChild?.textContent);
  const sort = view.container.querySelector('.source-sort-button')!;
  fireEvent.click(sort); expect(ids()).toEqual(["1", "2", "3"]);
  fireEvent.click(sort); expect(ids()).toEqual(["3", "2", "1"]);
  fireEvent.keyDown(view.container.querySelector('.source-table-row')!, { key: "Enter" });
  expect(p.onSelectLoadPoints.mock.calls[0][0].loadPointIds).toEqual([3]);
  fireEvent.click(sort); expect(ids()).toEqual(["3", "1", "2"]);
});

test("viewport height is measured initially and resize updates the rendered window", () => {
  const p = props(); let height = 600;
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => height);
  const points = Array.from({ length: 500 }, (_, i) => ({ ...p.loadPoints[0], id: i + 1 }));
  const view = render(<SourceDataViewer {...p} loadPoints={points} />);
  const count = () => view.container.querySelectorAll('.source-table-row').length;
  const initial = count(); height = 300;
  act(() => resizeCallbacks.forEach(callback => callback()));
  expect(count()).toBeLessThan(initial); expect(count()).toBeGreaterThan(0);
});

test("replacement passes the selected file and allows choosing the same file again", () => {
  const p = props(), replace = vi.fn(); const view = render(<SourceDataViewer {...p} onReplaceSource={replace} />);
  const input = view.container.querySelector('input[type=file]')!;
  const file = new File(["data"], "replacement.csv");
  fireEvent.change(input, { target: { files: [file] } });
  expect(replace).toHaveBeenCalledWith(file); expect((input as HTMLInputElement).value).toBe("");
  fireEvent.change(input, { target: { files: [file] } }); expect(replace).toHaveBeenCalledTimes(2);
});
