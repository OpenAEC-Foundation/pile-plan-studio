import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import i18n from "../../../i18n/config.ts";
import type { LoadPoint } from "../../../core/projectTypes.ts";
import LoadPointSelectionList from "./LoadPointSelectionList.tsx";

const points: LoadPoint[] = [
  { id: 1, name: "Load point 1", x_mm: 0, y_mm: 0, design_load_kn: 79 },
  { id: 2, name: "Load point 2", x_mm: 1, y_mm: 1, design_load_kn: 128 },
  { id: 3, name: "Load point 3", x_mm: 2, y_mm: 2, design_load_kn: 1234.5 },
  { id: 4, name: "Load point 4", x_mm: 3, y_mm: 3, design_load_kn: 315 },
  { id: 5, name: "Load point 5", x_mm: 4, y_mm: 4, design_load_kn: 215 },
];
const groups = [{ load_point_ids: [1, 3] }, { load_point_ids: [2, 4] }];

for (const language of ["en", "nl"]) {
  test(`shows multiple core groups and ungrouped forces without column headers in ${language}`, async () => {
    await i18n.changeLanguage(language);
    render(<LoadPointSelectionList loadPoints={points} selectedLoadPointIds={[1, 2, 3, 4, 5]} groups={groups} onInspect={() => {}} onSelectGroup={() => {}} />);
    const region = screen.getByRole("region", { name: i18n.t("loadPoints.selectedCount", { ns: "rightPanel", count: 5 }) });
    const displayedGroups = within(region).getAllByRole("group");
    expect(displayedGroups).toHaveLength(2);
    expect(within(displayedGroups[0]).getByRole("button", { name: /1.*79/ })).toBeTruthy();
    expect(within(displayedGroups[0]).getByRole("button", { name: /3.*1[.,]234[.,]5/ })).toBeTruthy();
    expect(within(region).getByText(language === "nl" ? "1.234,5 kN" : "1,234.5 kN")).toBeTruthy();
    expect(within(region).getByText("215 kN")).toBeTruthy();
    expect(screen.queryByRole("columnheader")).toBeNull();
  });
}

test("inspects individual members and selects the whole group from a partial selection", () => {
  function Selection() {
    const [selectedIds, setSelectedIds] = useState([1, 2, 3, 4, 5]);
    return <LoadPointSelectionList loadPoints={points} selectedLoadPointIds={selectedIds}
      groups={groups} onInspect={id => setSelectedIds([id])} onSelectGroup={setSelectedIds} />;
  }
  render(<Selection />);
  fireEvent.click(screen.getByRole("button", { name: "Inspect Load point 1, FEd 79 kN" }));
  expect(screen.getByText("1 of 2")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Select group of 2 load points" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByText("1,234.5 kN")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Inspect Load point 1, FEd 79 kN" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Inspect Load point 3, FEd 1,234.5 kN" }).getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Select group of 2 load points" }));
  expect(screen.getByRole("button", { name: "Select group of 2 load points" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Inspect Load point 3, FEd 1,234.5 kN" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByText("128 kN")).toBeNull();
});

test("selects only the clicked group from a selection containing several groups", () => {
  let selection: number[] = [];
  render(<LoadPointSelectionList loadPoints={points} selectedLoadPointIds={[1, 2, 3, 4, 5]} groups={groups} onInspect={() => {}}
    onSelectGroup={ids => { selection = ids; }} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Select group of 2 load points" })[1]);
  expect(selection).toEqual([2, 4]);
});
