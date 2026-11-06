import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { defaultPileOptionColumnLayout } from "../../../domain/pile-options/pileOptionColumnLayout.ts";
import RightPanel from "./RightPanel.tsx";
import PileOptionColumns from "./PileOptionColumns.tsx";

const t = (key: string, options = {}) => i18n.t(key, { ns: "rightPanel", ...options });
function fixture() {
  const project = projectFixture(), point = project.loadPoints[0]!;
  const options = [-17_500, -18_000].map(tip => ({
    configuration: { pile_size_mm: 290, pile_tip_level_mm: tip },
    pile_size_mm: 290, pile_tip_level_m: tip / 1000, isOption: true,
    governing_cpt_id: null, governing_frd_kn: 900, utilization: 0.75,
    missing_cpt_ids: [], technicalStatus: "valid" as const,
  }));
  return { ...project, rightPanelMode: "load-point" as const,
    selectedLoadPointIds: [point.id], selectedLoadPointId: point.id,
    pileOptionsByLoadPointId: new Map([[point.id, options]]),
    selectedPileConfigurationsByLoadPoint: new Map(),
    pileOptionSort: null,
    pilePlans: project.pilePlans.map(plan => ({ ...plan, activePileSizes: [290], activePileTipLevelMms: [-17_500, -18_000] })),
  };
}

test("tip sort keeps the numeric order, exposes aria-sort and reverses the visual arrows", () => {
  const initial = fixture(); let current!: ProjectState;
  function Panel() { const [state, setState] = useState<ProjectState>(initial); current = state;
    return <RightPanel state={state} onStateChange={setState} />; }
  const view = render(<Panel />);
  const header = () => screen.getByRole("columnheader", { name: new RegExp(t("columns.tip")) });
  const sort = () => within(header()).getByRole("button", { name: t("columns.tip") });
  const rowTips = () => [...view.container.querySelectorAll(".pile-option-row")].map(row => row.textContent);
  fireEvent.click(sort());
  expect(current.pileOptionSort).toEqual({ column: "tip", direction: "asc" });
  expect(header().getAttribute("aria-sort")).toBe("ascending");
  expect(sort().textContent).toContain("↓");
  expect(rowTips()[0]).toContain("-18 m");
  fireEvent.click(sort());
  expect(header().getAttribute("aria-sort")).toBe("descending");
  expect(sort().textContent).toContain("↑");
  expect(rowTips()[0]).toContain("-17.5 m");
  fireEvent.click(sort()); expect(current.pileOptionSort).toBeNull();
  expect(initial.pileOptionSort).toBeNull(); expect(current.pilePlans).toBe(initial.pilePlans);
});

test("filter choices and clearing retain immutable filter state without assigning a pile", () => {
  const initial = fixture(), apply = vi.fn(); let current!: ProjectState;
  function Panel() { const [state, setState] = useState<ProjectState>(initial); current = state;
    return <RightPanel state={state} onStateChange={setState} onApplyPileConfiguration={apply} />; }
  const view = render(<Panel />);
  const header = screen.getByRole("columnheader", { name: new RegExp(t("columns.tip")) });
  fireEvent.click(within(header).getByLabelText(t("filter.label", { label: t("columns.tip") })));
  fireEvent.click(within(header).getByRole("checkbox", { name: "-18 m" }));
  expect(current.pileOptionFilters.tip).toEqual(["-18 m"]);
  expect(view.container.querySelectorAll(".pile-option-row")).toHaveLength(1);
  fireEvent.click(within(header).getByRole("button", { name: t("actions.clear") }));
  expect(view.container.querySelectorAll(".pile-option-row")).toHaveLength(2);
  expect(current.pileOptionFilters).not.toBe(initial.pileOptionFilters);
  expect(initial.pileOptionFilters.tip).toEqual([]); expect(apply).not.toHaveBeenCalled();
});

test("row keyboard activation assigns through the existing callback and respects pending edits", () => {
  const state = fixture(), apply = vi.fn(), viewerKey = vi.fn();
  const view = render(<div onKeyDown={viewerKey}><RightPanel state={state} onStateChange={vi.fn()} onApplyPileConfiguration={apply} /></div>);
  const row = view.container.querySelector<HTMLElement>(".pile-option-row")!;
  expect(row.tabIndex).toBe(0); fireEvent.keyDown(row, { key: "Enter" });
  expect(apply).toHaveBeenCalledExactlyOnceWith(state.selectedLoadPointIds, { pile_size_mm: 290, pile_tip_level_mm: -17_500 });
  expect(viewerKey).not.toHaveBeenCalled();
  view.rerender(<RightPanel state={state} onStateChange={vi.fn()} onApplyPileConfiguration={apply} pileAssignmentPending />);
  const disabledRow = view.container.querySelector(".pile-option-row")!;
  expect(disabledRow.getAttribute("aria-disabled")).toBe("true");
  fireEvent.keyDown(disabledRow, { key: " " }); fireEvent.click(disabledRow);
  expect(apply).toHaveBeenCalledTimes(1);
});

test("governing CPT links inspect without assigning a pile, and clear uses the existing callback", () => {
  const initial = fixture(), apply = vi.fn(), change = vi.fn();
  const pointId = initial.selectedLoadPointId, cpt = initial.cpts[0];
  const options = initial.pileOptionsByLoadPointId.get(pointId)!.map(option => ({ ...option, governing_cpt_id: cpt.id }));
  const state = { ...initial, selectedPileConfigurationsByLoadPoint: new Map([[pointId, options[0].configuration]]),
    pileOptionsByLoadPointId: new Map([[pointId, options]]) };
  const view = render(<RightPanel state={state} onStateChange={change} onApplyPileConfiguration={apply} />);
  const row = view.container.querySelector<HTMLElement>(".pile-option-row")!;
  fireEvent.click(within(row).getByRole("button", { name: cpt.name }));
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ selectedCptId: cpt.id, rightPanelMode: "cpts" }));
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: t("pileOptions.clearAssignment") }));
  expect(apply).toHaveBeenCalledExactlyOnceWith(state.selectedLoadPointIds, null);
  expect(state.selectedPileConfigurationsByLoadPoint.get(pointId)).toEqual(options[0].configuration);
});

test("selection controls keep native keys away from the viewer while leaving Undo available", () => {
  const outer = vi.fn(); render(<div onKeyDown={outer}><RightPanel state={fixture()} onStateChange={vi.fn()} /></div>);
  const control = screen.getByRole("button", { name: t("selectionOverview.collapse") });
  expect(fireEvent.keyDown(control, { key: " " })).toBe(true);
  expect(outer).not.toHaveBeenCalled();
  fireEvent.keyDown(control, { key: "z", ctrlKey: true }); expect(outer).toHaveBeenCalledOnce();
});

test("columns use a native dialog, retain immediate layout preferences and isolate modal shortcuts", () => {
  const initial = defaultPileOptionColumnLayout(1), outer = vi.fn(); let layout = initial;
  function Columns() { const [current, setCurrent] = useState(initial); layout = current;
    return <div onKeyDown={outer}><PileOptionColumns layout={current} selectedCount={1} onChange={setCurrent} /></div>; }
  render(<Columns />); fireEvent.click(screen.getByRole("button", { name: t("columnSettings.button") }));
  const dialog = screen.getByRole("dialog", { name: t("columnSettings.title") });
  expect(dialog.tagName).toBe("DIALOG");
  fireEvent.click(within(dialog).getByRole("checkbox", { name: t("columns.size") }));
  expect(layout.find(column => column.key === "size")?.visible).toBe(false);
  fireEvent.keyDown(within(dialog).getByRole("button", { name: t("columnSettings.drag", { column: t("columns.tip") }) }), { key: "Home" });
  expect(layout[0].key).toBe("tip"); expect(initial[0].key).toBe("symbol");
  fireEvent.keyDown(dialog, { key: "z", ctrlKey: true }); expect(outer).not.toHaveBeenCalled();
  fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("columnSettings.button") }));
  expect((screen.getByRole("checkbox", { name: t("columns.size") }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: t("columnSettings.reset") })); expect(layout).toEqual(initial);
});

test("column visibility cannot hide the final visible column", () => {
  const layout = defaultPileOptionColumnLayout(2).map((column, index) => ({ ...column, visible: index === 0 }));
  const change = vi.fn(); render(<PileOptionColumns layout={layout} selectedCount={2} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: t("columnSettings.button") }));
  const last = screen.getByRole("checkbox", { name: t("columns.symbol") }) as HTMLInputElement;
  expect(last.disabled).toBe(true); last.click(); expect(change).not.toHaveBeenCalled();
});

test("failed technical assessment keeps the assignment controls and option table unavailable", () => {
  render(<RightPanel state={fixture()} onStateChange={vi.fn()} technicalAssignment={{ status: "error", assessment: null,
    issuesByLoadPointId: new Map(), error: new Error("assessment failed") }} />);
  expect(screen.getByRole("alert").textContent).toContain("assessment failed");
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByRole("button", { name: t("columnSettings.button") })).toBeNull();
});
