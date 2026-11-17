import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useState } from "react";
import type { PileDrivingFileResult, PileDrivingRecord } from "../../../core/pileDrivingCoreClient.ts";
import PileDrivingPanel from "./PileDrivingPanel.tsx";

const NO_SELECTION: readonly number[] = [];
const statusControls = {
  showStatusColors: false, onShowStatusColorsChange: vi.fn(), locationStatuses: new Map(), onStatusChange: vi.fn(),
};

function drivingWith(result: PileDrivingFileResult) {
  return {
    files: [{ id: "day-1", name: "driving.csv", result, matchBy: "location-id" as const }], selectedId: null,
    example: { id: "day-1", csv: true, independent: false, customTable: false, table: null },
    matchBy: "revit-mark" as const, pileSizes: [], settings: null, comparison: null, pending: false, error: null,
    ignoreCsvLeadingZeros: true, setIgnoreCsvLeadingZeros: vi.fn(),
    addFiles: vi.fn(), selectFile: vi.fn(), selectExample: vi.fn(), removeFile: vi.fn(),
    setMatchBy: vi.fn(), setTable: vi.fn(), resetTable: vi.fn(), setIndependent: vi.fn(), setSettings: vi.fn(),
    automaticStatuses: undefined, setLocationStatuses: vi.fn(),
  };
}

test("check and import settings are independently available from the panel", () => {
  const driving = {
    ...drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records: [] } }),
    settings: {
      minimum_end_blows: 0,
      end_window_increments: 2,
      energy_window_increments: 4,
      neighborhood_window_increments: 6,
      neighborhood_minimum_peers: 3,
      neighborhood_cpt_matching: "allow-one-missing" as const,
      maximum_end_drop: 0,
      length_tolerance_mm: 0,
      level_tolerance_mm: 0,
      neighborhood_tolerance_pct: 10,
      peer_energy_spread_kj: 0,
      target_energy_tolerance_kj: 0,
      expected_energy: [],
    },
  };
  render(<PileDrivingPanel {...statusControls} driving={driving} selectionDisabled={false}
    selectedLoadPointIds={NO_SELECTION} neighborhoodRecord={null}
    onNeighborhoodChange={vi.fn()} onSelect={vi.fn()} onClose={vi.fn()} />);

  const checkSummary = screen.getByText("Check settings", { selector: "summary" });
  const importSummary = screen.getByText("Import settings", { selector: "summary" });
  const checks = checkSummary.closest("details")!;
  const imports = importSummary.closest("details")!;
  expect(imports.nextElementSibling).toBe(checks);
  expect(checks.open).toBe(false);
  expect(imports.open).toBe(false);

  fireEvent.click(checkSummary);
  const comparison = within(checks).getByRole("group", { name: "Neighbor comparison" });
  const neighborhoodWindow = within(comparison).getByRole<HTMLInputElement>("spinbutton", {
    name: "Number of final full increments",
  });
  expect(neighborhoodWindow.value).toBe("6");
  fireEvent.change(neighborhoodWindow, { target: { value: "3" } });
  const minimumPeers = within(comparison).getByRole<HTMLInputElement>("spinbutton", {
    name: "Minimum number of reference piles",
  });
  expect(minimumPeers.value).toBe("3");
  fireEvent.change(minimumPeers, { target: { value: "4" } });
  const cptMatching = within(comparison).getByRole<HTMLSelectElement>("combobox", { name: "CPT matching" });
  expect(cptMatching.value).toBe("allow-one-missing");
  fireEvent.change(cptMatching, { target: { value: "include-all" } });
  fireEvent.click(within(checks).getByRole("button", { name: "Apply settings" }));
  expect(driving.setSettings).toHaveBeenCalledExactlyOnceWith({
    ...driving.settings, neighborhood_window_increments: 3, neighborhood_minimum_peers: 4,
    neighborhood_cpt_matching: "include-all",
  });
  expect(imports.open).toBe(false);
  fireEvent.click(importSummary);
  expect(within(imports).getByRole("checkbox", { name: "Ignore leading zeros" })).toBeTruthy();
  expect(within(imports).queryByText("Import settings", { selector: "strong" })).toBeNull();
  expect(checks.open).toBe(true);
  fireEvent.click(importSummary);
  expect(imports.open).toBe(false);
  expect(checks.open).toBe(true);
});

test("read-only projects can inspect driving records with file editing disabled", () => {
  const driving = { ...drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records: [{
    pile_number: "45", rows: [["45"]], matching: { status: "matched", load_point_id: 45 }, checks: [],
  }] } }), selectedId: "day-1" };
  const { container } = render(<PileDrivingPanel {...statusControls} driving={driving} readOnly selectionDisabled={false}
    selectedLoadPointIds={NO_SELECTION} neighborhoodRecord={null}
    onNeighborhoodChange={vi.fn()} onSelect={vi.fn()} onClose={vi.fn()} />);
  expect(container.querySelector<HTMLButtonElement>(".source-file-picker button")?.disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Remove selected driving record from project" }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Location 45" }));
  expect(screen.getByRole("heading", { name: "Pile 45" })).toBeTruthy();
  const controls = within(screen.getByRole("group", { name: "Driving status" }));
  const buttons = controls.getAllByRole<HTMLButtonElement>("button");
  expect(buttons).toHaveLength(4);
  expect(buttons.every(button => button.disabled)).toBe(true);
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
  render(<PileDrivingPanel {...statusControls} selectionDisabled={false} onSelect={select} onClose={vi.fn()}
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

test.each([["warning", "location-id"], ["ok", "revit-mark"]] as const)(
  "the comparison with status %s uses %s identifiers and toggles only in the pile checks", (status, matchBy) => {
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
  const base = drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records: [record] } });
  const driving = { ...base, files: base.files.map(file => ({ ...file, matchBy })) };
  const inspect = vi.fn();
  function Harness() {
    const [inspected, setInspected] = useState<PileDrivingRecord | null>(null);
    return <PileDrivingPanel {...statusControls} driving={driving} selectionDisabled={false}
      pileNumbers={new Map([[16, "P-016"], [17, "P-017"]])}
      selectedLoadPointIds={NO_SELECTION}
      neighborhoodRecord={inspected} onNeighborhoodChange={next => { inspect(next); setInspected(next); }}
      onSelect={vi.fn()} onClose={vi.fn()} />;
  }
  render(<Harness />);
  const overview = screen.getByRole("table", { name: "Pile records" });
  expect(within(overview).queryByRole("button", { name: "Show comparable piles" })).toBeNull();
  fireEvent.click(status === "warning" ? within(overview).getByText("Neighbor comparison")
    : within(overview).getByRole("button", { name: "Pile A45" }));
  expect(screen.queryByRole("table", { name: "Piles used for the median · 290 mm" })).toBeNull();
  expect(inspect).not.toHaveBeenCalled();

  const showPeers = screen.getByRole("button", { name: "Show comparable piles" });
  expect(showPeers.textContent).toBe("");
  fireEvent.click(showPeers);
  expect(inspect).toHaveBeenLastCalledWith(record);
  const hidePeers = screen.getByRole("button", { name: "Hide comparable piles" });
  expect(hidePeers.getAttribute("aria-expanded")).toBe("true");
  const peers = screen.getByRole("table", { name: "Piles used for the median · 290 mm" });
  const markBased = matchBy === "revit-mark";
  expect(within(peers).getByRole("columnheader", { name: markBased ? "Pile number" : "Location" })).toBeTruthy();
  expect(within(peers).getByRole("rowheader", { name: markBased ? "P-016" : "16" })).toBeTruthy();
  expect(within(peers).getByRole("rowheader", { name: markBased ? "Location 18" : "18" })).toBeTruthy();
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
  const renderPanel = (selectedLoadPointIds: readonly number[]) => <PileDrivingPanel {...statusControls} driving={driving}
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
  expect(screen.getByText("2 locations selected")).toBeTruthy();
  const statusButtons = screen.getByRole("group", { name: "Driving status" });
  expect(overview.compareDocumentPosition(statusButtons) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(statusButtons).getByRole("button", { name: "Automatic", pressed: true })).toBeTruthy();

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
    { pile_number: "A47", rows: [["A47"]], matching: { status: "matched", load_point_id: 47 },
      checks: [{ kind: "length", status: "warning" }, { kind: "remark", status: "warning" }],
      remarks: ["Driving resumed after a pause."] },
  ];
  const driving = drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records } });
  const onShowStatusColorsChange = vi.fn();
  const select = vi.fn();
  render(<PileDrivingPanel driving={driving} selectedLoadPointIds={[46]} selectionDisabled={false}
    {...statusControls} onShowStatusColorsChange={onShowStatusColorsChange}
    neighborhoodRecord={null} onNeighborhoodChange={vi.fn()} onSelect={select} onClose={vi.fn()} />);

  const table = () => within(screen.getByRole("table", { name: "Pile records" }));
  const mapColors = screen.getByRole("switch", { name: "Show driving status colors on the map" });
  expect((mapColors as HTMLInputElement).checked).toBe(false);
  fireEvent.click(mapColors);
  expect(onShowStatusColorsChange).toHaveBeenCalledExactlyOnceWith(true);
  expect(select).not.toHaveBeenCalled();
  expect(table().getByRole("button", { name: "Location 46" })).toBeTruthy();
  fireEvent.click(screen.getByText("Filter warnings", { selector: "summary" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Without warnings" }));
  expect(table().queryByRole("button", { name: "Location 46" })).toBeNull();
  expect(table().getByRole("button", { name: "Location 45" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Pile A46" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Uncheck all" }));
  expect(screen.queryByRole("table", { name: "Pile records" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Remark" }));
  expect(table().queryByRole("button", { name: "Location 45" })).toBeNull();
  expect(table().queryByText("Pile length")).toBeNull();
  expect(table().getByText("Remark")).toBeTruthy();
  fireEvent.click(table().getByRole("button", { name: "Location 47" }));
  expect(screen.getByText("Driving resumed after a pause.")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Pile size" }));
  expect(table().getByRole("button", { name: "Location 45" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Check all" }));
  expect(table().getByRole("button", { name: "Location 46" })).toBeTruthy();
});

test("edits and resets the selected location status while showing its automatic assessment", () => {
  const driving = drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records: [{
    pile_number: "45", rows: [["45"]], matching: { status: "matched", load_point_id: 45 },
    checks: [{ kind: "length", status: "warning" }],
  }] } });
  const setStatus = vi.fn();
  render(<PileDrivingPanel {...statusControls} driving={driving} selectionDisabled={false}
    selectedLoadPointIds={[45]} neighborhoodRecord={null} onNeighborhoodChange={vi.fn()}
    locationStatuses={new Map([[45, { automatic: "deviation", manual: "good" }]])}
    onStatusChange={setStatus} onSelect={vi.fn()} onClose={vi.fn()} />);

  const controls = within(screen.getByRole("group", { name: "Driving status" }));
  expect(controls.getAllByRole("button").map(button => button.textContent)).toEqual([
    "Automatic", "Good", "Needs review", "Deviation",
  ]);
  expect(controls.getByRole("button", { name: "Good" }).getAttribute("aria-pressed")).toBe("true");
  expect(within(screen.getByRole("table", { name: "Pile records" })).getByRole("cell", { name: "Good" })).toBeTruthy();
  expect(screen.getByText("Automatic · Deviation")).toBeTruthy();
  fireEvent.click(controls.getByRole("button", { name: "Needs review" }));
  fireEvent.click(controls.getByRole("button", { name: "Automatic" }));
  expect(setStatus.mock.calls).toEqual([[[45], "doubtful"], [[45], null]]);
});

test("uses the visible registration order for range selection and applies one status to the whole selection", () => {
  const records: PileDrivingRecord[] = [45, 46, null, 45, 47, 48].map((id, index) => ({
    pile_number: String(id ?? index), rows: [[String(id ?? index)]],
    matching: id === null ? { status: "unmatched" } : { status: "matched", load_point_id: id },
    checks: [{ kind: "size", status: id === 46 ? "ok" : "warning" }],
  }));
  const driving = drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records } });
  const setStatus = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState<number[]>([]);
    return <PileDrivingPanel {...statusControls} driving={driving} selectionDisabled={false}
      selectedLoadPointIds={selected} neighborhoodRecord={null} onNeighborhoodChange={vi.fn()}
      locationStatuses={new Map([[45, { manual: "good" }]])}
      onStatusChange={setStatus} onSelect={setSelected} onClose={vi.fn()} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText("Filter warnings", { selector: "summary" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Without warnings" }));
  const table = within(screen.getByRole("table", { name: "Pile records" }));
  const locations = () => table.getAllByRole("button", { pressed: true }).map(button => button.getAttribute("aria-label"));
  const click = (id: number, modifiers = {}) =>
    fireEvent.click(table.getAllByRole("button", { name: `Location ${id}` })[0], modifiers);

  click(45);
  click(47, { shiftKey: true });
  expect(locations()).toEqual(["Location 45", "Location 45", "Location 47"]);
  const controls = within(screen.getByRole("group", { name: "Driving status" }));
  expect(controls.queryByRole("button", { pressed: true })).toBeNull();
  expect(screen.getByText("2 locations selected")).toBeTruthy();
  fireEvent.click(controls.getByRole("button", { name: "Deviation" }));
  expect(setStatus).toHaveBeenCalledExactlyOnceWith([45, 47], "deviation");

  click(45, { ctrlKey: true });
  expect(locations()).toEqual(["Location 47"]);
  click(48, { metaKey: true });
  expect(locations()).toEqual(["Location 47", "Location 48"]);
  click(45, { ctrlKey: true, shiftKey: true });
  expect(locations()).toEqual(["Location 45", "Location 45", "Location 47", "Location 48"]);
  fireEvent.click(within(screen.getByRole("group", { name: "Driving status" })).getByRole("button", { name: "Automatic" }));
  expect(setStatus).toHaveBeenLastCalledWith([47, 48, 45], null);
  click(48);
  expect(locations()).toEqual(["Location 48"]);
});

test("following the filter selects its unique locations until the selection is changed manually", () => {
  const records: PileDrivingRecord[] = [45, 46, null, 45, 47].map((id, index) => ({
    pile_number: String(id ?? index), rows: [[String(id ?? index)]],
    matching: id === null ? { status: "unmatched" } : { status: "matched", load_point_id: id },
    checks: [{ kind: "size", status: id === 46 ? "ok" : "warning" }],
  }));
  const driving = drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records } });
  const setStatus = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState<number[]>([46]);
    return <PileDrivingPanel {...statusControls} driving={driving} selectionDisabled={false}
      selectedLoadPointIds={selected} neighborhoodRecord={null} onNeighborhoodChange={vi.fn()}
      onStatusChange={setStatus} onSelect={setSelected} onClose={vi.fn()} />;
  }
  render(<Harness />);
  const filterSummary = screen.getByText("Filter warnings", { selector: "summary" });
  fireEvent.click(filterSummary);
  fireEvent.click(screen.getByRole("button", { name: "Uncheck all" }));
  const selectVisible = screen.getByRole<HTMLButtonElement>("button", { name: "Follow filter", pressed: false });
  expect(filterSummary.closest("details")!.compareDocumentPosition(selectVisible)
    & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(selectVisible.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "Pile size" }));
  expect(selectVisible.disabled).toBe(false);
  fireEvent.click(selectVisible);

  const table = within(screen.getByRole("table", { name: "Pile records" }));
  expect(table.getAllByRole("button", { pressed: true }).map(button => button.getAttribute("aria-label")))
    .toEqual(["Location 45", "Location 45", "Location 47"]);
  expect(screen.getByText("2 locations selected")).toBeTruthy();
  fireEvent.click(within(screen.getByRole("group", { name: "Driving status" })).getByRole("button", { name: "Deviation" }));
  expect(setStatus).toHaveBeenCalledExactlyOnceWith([45, 47], "deviation");

  fireEvent.click(screen.getByRole("checkbox", { name: "Without warnings" }));
  expect(screen.getByText("3 locations selected")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Pile size" }));
  expect(table.getByRole("button", { name: "Location 46", pressed: true })).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Without warnings" }));
  expect(screen.queryByRole("group", { name: "Driving status" })).toBeNull();
  expect(screen.getByRole("button", { name: "Follow filter", pressed: true })).toBe(selectVisible);
  fireEvent.click(screen.getByRole("checkbox", { name: "Pile size" }));
  const filtered = within(screen.getByRole("table", { name: "Pile records" }));
  expect(screen.getByText("2 locations selected")).toBeTruthy();

  fireEvent.click(filtered.getByRole("button", { name: "Location 47" }));
  expect(screen.getByRole("button", { name: "Follow filter", pressed: false })).toBe(selectVisible);
  fireEvent.click(screen.getByRole("checkbox", { name: "Without warnings" }));
  expect(filtered.getByRole("button", { name: "Location 47", pressed: true })).toBeTruthy();
  expect(filtered.getByRole("button", { name: "Location 46", pressed: false })).toBeTruthy();
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
  render(<PileDrivingPanel {...statusControls} driving={driving} selectionDisabled={false}
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
  const props = { ...statusControls, selectionDisabled: false, selectedLoadPointIds: NO_SELECTION,
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
