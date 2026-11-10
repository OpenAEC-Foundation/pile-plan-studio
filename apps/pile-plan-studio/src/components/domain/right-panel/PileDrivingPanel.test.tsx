import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useState } from "react";
import type { PileDrivingFileResult, PileDrivingRecord } from "../../../core/pileDrivingCoreClient.ts";
import PileDrivingPanel from "./PileDrivingPanel.tsx";

const NO_SELECTION: readonly number[] = [];

function drivingWith(result: PileDrivingFileResult) {
  return {
    files: [{ id: "day-1", name: "driving.csv", result }], selectedId: null,
    example: { id: "day-1", csv: true, independent: false, customTable: false, table: null },
    matchBy: "revit-mark" as const, pileSizes: [], settings: null, comparison: null, pending: false, error: null,
    addFiles: vi.fn(), selectFile: vi.fn(), selectExample: vi.fn(), removeFile: vi.fn(),
    setMatchBy: vi.fn(), setTable: vi.fn(), resetTable: vi.fn(), setIndependent: vi.fn(), setSettings: vi.fn(),
  };
}

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
  render(<PileDrivingPanel selectionDisabled={false} onSelect={select} onClose={vi.fn()}
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
    checks: [{ kind: "size", status: "warning", actual: 290, reference: 320 }, { kind: "neighborhood", status }],
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
    return <PileDrivingPanel driving={driving} selectionDisabled={false}
      selectedLoadPointIds={NO_SELECTION}
      neighborhoodRecord={inspected} onNeighborhoodChange={next => { inspect(next); setInspected(next); }}
      onSelect={vi.fn()} onClose={vi.fn()} />;
  }
  render(<Harness />);
  const overview = screen.getByRole("table", { name: "Pile records" });
  expect(within(overview).queryByRole("button", { name: "Show comparable piles" })).toBeNull();
  fireEvent.click(status === "warning" ? within(overview).getByText("Neighbor comparison")
    : within(overview).getByRole("button", { name: "Location 45" }));
  expect(screen.queryByRole("table", { name: "Comparable piles · 290 mm" })).toBeNull();
  expect(inspect).not.toHaveBeenCalled();

  const showPeers = screen.getByRole("button", { name: "Show comparable piles" });
  expect(showPeers.textContent).toBe("");
  fireEvent.click(showPeers);
  expect(inspect).toHaveBeenLastCalledWith(record);
  const hidePeers = screen.getByRole("button", { name: "Hide comparable piles" });
  expect(hidePeers.getAttribute("aria-expanded")).toBe("true");
  const peers = screen.getByRole("table", { name: "Comparable piles · 290 mm" });
  expect(screen.getByText(/All piles in the table contribute to the median/)).toBeTruthy();
  expect(within(peers).getByRole("cell", { name: /^10%$/ })).toBeTruthy();
  const flagged = within(peers).getByRole("cell", { name: "25% · Outside limit" });
  expect(flagged.querySelector(".oa-status--warning")?.textContent).toBe("25%");

  fireEvent.click(hidePeers);
  expect(inspect).toHaveBeenLastCalledWith(null);
  expect(screen.queryByRole("table", { name: "Comparable piles · 290 mm" })).toBeNull();
});

test("follows single viewer selections and leaves the overview full-height without a matching selection", () => {
  const records: PileDrivingRecord[] = ["A45", "B45", "A46"].map((pile_number, index) => ({
    pile_number, rows: [[pile_number]], matching: { status: "matched", load_point_id: index < 2 ? 45 : 46 },
    checks: [],
  }));
  const driving = drivingWith({ status: "ready", preview: { columns: ["paalnummer"], records } });
  const renderPanel = (selectedLoadPointIds: readonly number[]) => <PileDrivingPanel driving={driving}
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
  render(<PileDrivingPanel driving={driving} selectedLoadPointIds={[46]} selectionDisabled={false}
    neighborhoodRecord={null} onNeighborhoodChange={vi.fn()} onSelect={vi.fn()} onClose={vi.fn()} />);

  const filter = screen.getByRole("checkbox", { name: "Warnings only" });
  const table = screen.getByRole("table", { name: "Pile records" });
  expect(within(table).getByRole("button", { name: "Location 46" })).toBeTruthy();
  fireEvent.click(filter);
  expect(within(table).queryByRole("button", { name: "Location 46" })).toBeNull();
  expect(within(table).getByRole("button", { name: "Location 45" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Pile A46" })).toBeTruthy();
  fireEvent.click(filter);
  expect(within(table).getByRole("button", { name: "Location 46" })).toBeTruthy();
});
