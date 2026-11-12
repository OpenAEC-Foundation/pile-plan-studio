import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useState } from "react";
import type { PileDrivingFileResult, PileDrivingRecord } from "../../../core/pileDrivingCoreClient.ts";
import PileDrivingPanel from "./PileDrivingPanel.tsx";

const NO_SELECTION: readonly number[] = [];
const warningControls = { showWarningsInViewer: false, onShowWarningsInViewerChange: vi.fn() };

function drivingWith(result: PileDrivingFileResult) {
  return {
    files: [{ id: "day-1", name: "driving.csv", result, matchBy: "location-id" as const }], selectedId: null,
    example: { id: "day-1", csv: true, independent: false, customTable: false, table: null },
    matchBy: "revit-mark" as const, pileSizes: [], settings: null, comparison: null, pending: false, error: null,
    ignoreCsvLeadingZeros: true, setIgnoreCsvLeadingZeros: vi.fn(),
    addFiles: vi.fn(), selectFile: vi.fn(), selectExample: vi.fn(), removeFile: vi.fn(),
    setMatchBy: vi.fn(), setTable: vi.fn(), resetTable: vi.fn(), setIndependent: vi.fn(), setSettings: vi.fn(),
  };
}

test("read-only projects can inspect driving records with file editing disabled", () => {
  const driving = { ...drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records: [{
    pile_number: "45", rows: [["45"]], matching: { status: "matched", load_point_id: 45 }, checks: [],
  }] } }), selectedId: "day-1" };
  const { container } = render(<PileDrivingPanel {...warningControls} driving={driving} readOnly selectionDisabled={false}
    selectedLoadPointIds={NO_SELECTION} neighborhoodRecord={null}
    onNeighborhoodChange={vi.fn()} onSelect={vi.fn()} onClose={vi.fn()} />);
  expect(container.querySelector<HTMLButtonElement>(".source-file-picker button")?.disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Remove selected driving record from project" }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Location 45" }));
  expect(screen.getByRole("heading", { name: "Pile 45" })).toBeTruthy();
});

test("clicking a warning or the location button selects the pile and opens its details", () => {
  const result: PileDrivingFileResult = {
    status: "ready",
    preview: {
      columns: ["paalnummer", "datum"],
      records: [{
        pile_number: "A45",
        rows: [["A45", "10-11-2026"]],
        matching: { status: "matched", load_point_id: 45 },
        checks: [{ kind: "size", status: "warning" }],
      }],
    },
  };
  const select = vi.fn();
  render(<PileDrivingPanel {...warningControls} selectionDisabled={false} onSelect={select} onClose={vi.fn()}
    selectedLoadPointIds={NO_SELECTION}
    neighborhoodRecord={null} onNeighborhoodChange={vi.fn()}
    driving={drivingWith(result)} />);

  const table = screen.getByRole("table", { name: "Pile records" });
  const location = within(table).getByRole("button", { name: "Location 45" });
  fireEvent.click(within(table).getByText("Pile size"));
  expect(select).toHaveBeenCalledExactlyOnceWith([45]);
  expect(location.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("heading", { name: "Pile A45" })).toBeTruthy();

  fireEvent.click(location);
  expect(select).toHaveBeenCalledTimes(2);
});

test.each(["warning", "ok"] as const)("the comparison with status %s toggles only in the pile checks", status => {
  const record: PileDrivingRecord = {
    pile_number: "A45", rows: [["A45"]], matching: { status: "matched", load_point_id: 45 },
    checks: [
      { kind: "size", status: "warning", actual: 290, reference: 320 },
      { kind: "neighborhood", status, actual: 25, reference: 22.5, other: 11.11111, tolerance: 10 },
    ],
    neighborhood: {
      peer_count: 3, relaxed_selection: false,
      reference_piles: [
        { load_point_id: 16, mean_blows: 18, deviation_pct: 10, exceeds_tolerance: false },
        { load_point_id: 17, mean_blows: 20, deviation_pct: 0, exceeds_tolerance: false },
        { load_point_id: 18, mean_blows: 25, deviation_pct: 25, exceeds_tolerance: true },
      ],
    },
  };
  const driving = drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records: [record] } });
  const inspect = vi.fn();
  function Harness() {
    const [inspected, setInspected] = useState<PileDrivingRecord | null>(null);
    return <PileDrivingPanel {...warningControls} driving={driving} selectionDisabled={false}
      selectedLoadPointIds={NO_SELECTION}
      neighborhoodRecord={inspected} onNeighborhoodChange={next => { inspect(next); setInspected(next); }}
      onSelect={vi.fn()} onClose={vi.fn()} />;
  }
  render(<Harness />);
  const overview = screen.getByRole("table", { name: "Pile records" });
  expect(within(overview).queryByRole("button", { name: "Show comparable piles" })).toBeNull();
  fireEvent.click(status === "warning" ? within(overview).getByText("Neighbor comparison")
    : within(overview).getByRole("button", { name: "Location 45" }));
  expect(screen.queryByRole("table", { name: "Piles used for the median · 290 mm" })).toBeNull();
  expect(inspect).not.toHaveBeenCalled();

  const showPeers = screen.getByRole("button", { name: "Show comparable piles" });
  expect(showPeers.textContent).toBe("");
  fireEvent.click(showPeers);
  expect(inspect).toHaveBeenLastCalledWith(record);
  const hidePeers = screen.getByRole("button", { name: "Hide comparable piles" });
  expect(hidePeers.getAttribute("aria-expanded")).toBe("true");
  const peers = screen.getByRole("table", { name: "Piles used for the median · 290 mm" });
  expect(screen.getByText("25 blows per 250 mm · median 22.5 · 11.11% deviation (limit 10%)")).toBeTruthy();
  expect(within(peers).getByRole("cell", { name: /^10%$/ })).toBeTruthy();
  const flagged = within(peers).getByRole("cell", { name: "25% · Outside limit" });
  expect(flagged.querySelector(".oa-status--warning")?.textContent).toBe("25%");

  fireEvent.click(hidePeers);
  expect(inspect).toHaveBeenLastCalledWith(null);
  expect(screen.queryByRole("table", { name: "Piles used for the median · 290 mm" })).toBeNull();
});

test("follows single viewer selections and leaves the overview full-height without a matching selection", () => {
  const records: PileDrivingRecord[] = ["A45", "B45", "A46"].map((pile_number, index) => ({
    pile_number, rows: [[pile_number]], matching: { status: "matched", load_point_id: index < 2 ? 45 : 46 },
    checks: [],
  }));
  const driving = drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records } });
  const renderPanel = (selectedLoadPointIds: readonly number[]) => <PileDrivingPanel {...warningControls} driving={driving}
    selectedLoadPointIds={selectedLoadPointIds} selectionDisabled={false} neighborhoodRecord={null}
    onNeighborhoodChange={vi.fn()} onSelect={vi.fn()} onClose={vi.fn()} />;
  const view = render(renderPanel(NO_SELECTION));
  const overview = screen.getByRole("region", { name: "Pile records" });
  expect(overview.classList.contains("has-details")).toBe(false);

  view.rerender(renderPanel([45]));
  expect(screen.getByRole("heading", { name: "Pile A45" })).toBeTruthy();
  expect(overview.classList.contains("has-details")).toBe(true);

  fireEvent.click(within(overview).getAllByRole("button", { name: "Location 45" })[1]);
  view.rerender(renderPanel([45]));
  expect(screen.getByRole("heading", { name: "Pile B45" })).toBeTruthy();

  view.rerender(renderPanel([45, 46]));
  expect(screen.queryByRole("heading", { name: /^Pile [AB]/ })).toBeNull();
  expect(overview.classList.contains("has-details")).toBe(false);

  view.rerender(renderPanel([46]));
  expect(screen.getByRole("heading", { name: "Pile A46" })).toBeTruthy();
  view.rerender(renderPanel(NO_SELECTION));
  expect(screen.queryByRole("heading", { name: "Pile A46" })).toBeNull();
  expect(overview.classList.contains("has-details")).toBe(false);
});

test("filters registrations with warnings while keeping the viewer selection in the details", () => {
  const records: PileDrivingRecord[] = [
    { pile_number: "A45", rows: [["A45"]], matching: { status: "matched", load_point_id: 45 },
      checks: [{ kind: "size", status: "warning" }] },
    { pile_number: "A46", rows: [["A46"]], matching: { status: "matched", load_point_id: 46 },
      checks: [{ kind: "size", status: "ok" }] },
  ];
  const driving = drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records } });
  const onShowWarningsInViewerChange = vi.fn();
  const select = vi.fn();
  render(<PileDrivingPanel driving={driving} selectedLoadPointIds={[46]} selectionDisabled={false}
    showWarningsInViewer={false} onShowWarningsInViewerChange={onShowWarningsInViewerChange}
    neighborhoodRecord={null} onNeighborhoodChange={vi.fn()} onSelect={select} onClose={vi.fn()} />);

  const filter = screen.getByRole("checkbox", { name: "Warnings only" });
  const table = screen.getByRole("table", { name: "Pile records" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Mark warnings in viewer" }));
  expect(onShowWarningsInViewerChange).toHaveBeenCalledExactlyOnceWith(true);
  expect(select).not.toHaveBeenCalled();
  expect(within(table).getByRole("button", { name: "Location 46" })).toBeTruthy();
  fireEvent.click(filter);
  expect(within(table).queryByRole("button", { name: "Location 46" })).toBeNull();
  expect(within(table).getByRole("button", { name: "Location 45" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Pile A46" })).toBeTruthy();
  fireEvent.click(filter);
  expect(within(table).getByRole("button", { name: "Location 46" })).toBeTruthy();
});

test("the registrations table uses each file's effective matching field", () => {
  const result: PileDrivingFileResult = {
    status: "ready",
    preview: { columns: ["paalnummer"], records: [{
      pile_number: "001-A", rows: [["001-A"]], matching: { status: "matched", load_point_id: 45 }, checks: [],
    }] },
  };
  const select = vi.fn();
  const driving = { ...drivingWith(result), files: [
    { id: "day-1", name: "numbered.csv", result, matchBy: "revit-mark" as const },
    { id: "day-2", name: "locations.csv", result, matchBy: "location-id" as const },
  ] };
  render(<PileDrivingPanel {...warningControls} driving={driving} selectionDisabled={false}
    selectedLoadPointIds={NO_SELECTION} neighborhoodRecord={null} onNeighborhoodChange={vi.fn()}
    onSelect={select} onClose={vi.fn()} />);

  const table = within(screen.getByRole("table", { name: "Pile records" }));
  const pile = table.getByRole("button", { name: "Pile 001-A" });
  expect(table.getByRole("columnheader", { name: "Link" })).toBeTruthy();
  expect(pile.textContent).toBe("Pile 001-A");
  expect(table.getByRole("button", { name: "Location 45" }).textContent).toBe("Location 45");
  fireEvent.click(pile);
  expect(select).toHaveBeenCalledWith([45]);
});

test("CSV import settings allow exact matching and the preview identifies the link for each source row", () => {
  const result: PileDrivingFileResult = {
    status: "ready",
    table: {
      sheets: [], settings: { has_headers: true, header_row: 1, first_data_row: 2 },
      columns: [{ column: 1, header: "Paalnummer", nonempty_count: 2, numeric_count: 2 }],
      rows: [{ number: 2, cells: ["1"] }, { number: 3, cells: ["1"] }], row_count: 2, processed: false,
    },
    preview: { columns: ["paalnummer"], records: [
      { pile_number: "1", matched_pile_number: "001", row_numbers: [2], rows: [["1"]],
        matching: { status: "matched", load_point_id: 45 }, checks: [] },
      { pile_number: "1", row_numbers: [3], rows: [["1"]], matching: { status: "ambiguous" }, checks: [] },
    ] },
  };
  const base = drivingWith(result);
  const driving = {
    ...base, files: base.files.map(file => ({ ...file, matchBy: "revit-mark" as const })),
    example: { ...base.example, table: result.table },
  };
  const props = { ...warningControls, selectionDisabled: false, selectedLoadPointIds: NO_SELECTION,
    neighborhoodRecord: null, onNeighborhoodChange: vi.fn(), onSelect: vi.fn(), onClose: vi.fn() };
  const { container, rerender } = render(<PileDrivingPanel {...props} driving={driving} />);
  container.querySelectorAll<HTMLDetailsElement>(".pile-driving-disclosure, .source-import-disclosure")
    .forEach(details => { details.open = true; });
  const checkbox = screen.getByRole<HTMLInputElement>("checkbox", { name: "Ignore leading zeros" });
  expect(checkbox.checked).toBe(true);
  fireEvent.click(checkbox);
  expect(driving.setIgnoreCsvLeadingZeros).toHaveBeenCalledExactlyOnceWith(false);
  expect(screen.getByRole("button", { name: "1 → Pile 001" })).toBeTruthy();
  const linked = screen.getByRole("row", { name: /2.*Pile 001.*1/ });
  expect(within(linked).getByText("Pile 001")).toBeTruthy();
  expect(screen.getByRole("row", { name: /3.*Multiple locations.*1/ })).toBeTruthy();

  rerender(<PileDrivingPanel {...props} driving={{ ...driving, example: { ...driving.example, csv: false } }} />);
  expect(screen.queryByRole("checkbox", { name: "Ignore leading zeros" })).toBeNull();
});
