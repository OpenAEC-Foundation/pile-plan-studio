import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { projectFixture } from "../../../test/projectFixture.ts";
import { captureProjectContent } from "../../../domain/project/projectContent.ts";
import type { PileCapPreview } from "../../../core/pileCapProposalTypes.ts";
import RightPanel from "./RightPanel.tsx";

function fixture() {
  const base = projectFixture();
  const proposals = [
    { load_point_ids: [15, 43], pile_count: 3, quarter_turns: 0, configuration: null },
    { load_point_ids: [62], pile_count: 2, quarter_turns: 1, configuration: null },
    { load_point_ids: [8, 12], pile_count: 2, quarter_turns: 1, configuration: null },
  ];
  return {
    ...base,
    loadPoints: [8, 12, 15, 43, 62].map(id => ({ ...base.loadPoints[0], id, name: `Location ${id}` })),
    activePilePlanId: "changed",
    pilePlans: [
      { ...base.pilePlans[0], id: "changed", name: "Changed plan", pileCapProposals: proposals },
      { ...base.pilePlans[0], id: "empty", name: "Empty plan", pileCapProposals: [] },
    ],
  };
}

test("lists only active-plan proposals, including unchanged counts with rotated layouts", () => {
  const state = fixture();
  const view = render(<RightPanel state={state} taskPanel="pile-cap-changes" onStateChange={() => {}} />);
  const list = screen.getByRole("list", { name: "Pile cap changes" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  const row = within(list).getByRole("button", { name: /15, 43.*2.*3/ });
  expect(row.textContent).toContain("15, 43");
  expect(screen.getByText("Changed plan")).toBeTruthy();
  expect(within(list).getByRole("button", { name: /8, 12.*2.*2/ })).toBeTruthy();
  view.rerender(<RightPanel state={{ ...state, activePilePlanId: "empty" }} taskPanel="pile-cap-changes" onStateChange={() => {}} />);
  expect(screen.getByText("No pile cap changes in this pile plan.")).toBeTruthy();
  expect(screen.queryByRole("list")).toBeNull();
});

test("selects the source group without a project edit or closing the overview", () => {
  const state = fixture(), changed = vi.fn(), close = vi.fn();
  const before = captureProjectContent(state);
  render(<RightPanel state={state} taskPanel="pile-cap-changes" onStateChange={changed} onCloseTaskPanel={close} />);
  fireEvent.click(screen.getByRole("button", { name: /15, 43.*2.*3/ }));
  const next = changed.mock.calls[0][0];
  expect(next.selectedLoadPointIds).toEqual([15, 43]);
  expect(next.selectedLoadPointId).toBe(15);
  expect(captureProjectContent(next)).toEqual(before);
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close overview" }));
  expect(close).toHaveBeenCalledOnce();
});

test("delegates selection to the session when provided, and follows external selection", () => {
  const state = fixture(), select = vi.fn(), changed = vi.fn();
  const view = render(<RightPanel state={state} taskPanel="pile-cap-changes" onStateChange={changed} onSelectLoadPoints={select} />);
  fireEvent.click(screen.getByRole("button", { name: /62.*1.*2/ }));
  expect(select).toHaveBeenCalledWith([62]);
  expect(changed).not.toHaveBeenCalled();
  view.rerender(<RightPanel state={{ ...state, selectedLoadPointIds: [43, 15] }} taskPanel="pile-cap-changes" onStateChange={changed} onSelectLoadPoints={select} />);
  expect(screen.getByRole("button", { name: /15, 43.*2.*3/ }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: /62.*1.*2/ }).getAttribute("aria-pressed")).toBe("false");
});

test("keeps inactive proposals visible and selects only remaining original locations", () => {
  const state = fixture(), select = vi.fn();
  state.loadPoints = state.loadPoints.filter(p => p.id !== 43);
  state.pilePlans[0].pileCapProposals.push({ load_point_ids: [999], pile_count: 4, quarter_turns: 0, configuration: null });
  const previews = state.pilePlans[0].pileCapProposals.map(proposal => ({ proposal, status: "group_changed" } as PileCapPreview));
  render(<RightPanel state={state} taskPanel="pile-cap-changes" onStateChange={() => {}} onSelectLoadPoints={select}
    pileCapResult={{ plans: [{ plan_id: "changed", proposals: state.pilePlans[0].pileCapProposals, previews, pile_count: 0, total_cost: 0, missing_cost_count: 0 }] }} />);
  fireEvent.click(screen.getByRole("button", { name: /15, 43.*2.*3/ }));
  expect(select).toHaveBeenCalledWith([15]);
  expect((screen.getByRole("button", { name: /999.*1.*4/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getAllByText("Cap proposal inactive: the original group has changed.").length).toBeGreaterThan(0);
});

test("the overview reuses selected-group count, rotation and Reset actions", () => {
  const base = fixture(), edit = vi.fn();
  const state = { ...base, selectedLoadPointIds: [15, 43], selectedLoadPointId: 15 };
  const groups = [{ load_point_ids: [15, 43] }];
  const view = render(<RightPanel state={state} taskPanel="pile-cap-changes" loadPointGroups={groups}
    onStateChange={() => {}} onEditPileCap={edit} />);
  fireEvent.click(screen.getByRole("button", { name: "Increase pile count" }));
  expect(edit.mock.calls[0][0]).toMatchObject({ load_point_ids: [15, 43], pile_count: 4 });
  fireEvent.click(screen.getByRole("button", { name: "Decrease pile count" }));
  expect(edit.mock.calls[1][0].pile_count).toBe(2);
  fireEvent.click(screen.getByRole("button", { name: "Rotate layout 90°" }));
  expect(edit.mock.calls[2][0].quarter_turns).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Reset pile-cap proposal to original" }));
  expect(edit.mock.calls[3]).toEqual([state.pilePlans[0].pileCapProposals[0], true]);
  const reset = { ...state, pilePlans: state.pilePlans.map(plan => ({ ...plan, pileCapProposals: [] })) };
  view.rerender(<RightPanel state={reset} taskPanel="pile-cap-changes" loadPointGroups={groups}
    onStateChange={() => {}} onEditPileCap={edit} />);
  expect(screen.getByText("No pile cap changes in this pile plan.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Increase pile count" }));
  expect(edit.mock.calls[4][0]).toMatchObject({ load_point_ids: [15, 43], pile_count: 3 });
});

test("overview controls share edit guards and never appear for a partial group", () => {
  const base = fixture();
  const state = { ...base, selectedLoadPointIds: [15, 43], selectedLoadPointId: 15 };
  const groups = [{ load_point_ids: [15, 43] }];
  const view = render(<RightPanel state={state} taskPanel="pile-cap-changes" loadPointGroups={groups}
    pileCapPending onStateChange={() => {}} />);
  for (const name of ["Increase pile count", "Decrease pile count", "Rotate layout 90°", "Reset pile-cap proposal to original"]) {
    expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
  }
  view.rerender(<RightPanel state={{ ...state, selectedLoadPointIds: [15] }} taskPanel="pile-cap-changes"
    loadPointGroups={groups} onStateChange={() => {}} />);
  expect(screen.queryByRole("button", { name: "Increase pile count" })).toBeNull();
});

test("editing a proposal keeps the overview order stable when the core appends its replacement", () => {
  const state = fixture();
  const view = render(<RightPanel state={state} taskPanel="pile-cap-changes" onStateChange={() => {}} />);
  const locations = () => [...view.container.querySelectorAll(".pile-cap-changes-locations")].map(node => node.textContent);
  const before = locations();
  const [edited, ...rest] = state.pilePlans[0].pileCapProposals;
  view.rerender(<RightPanel state={{ ...state, pilePlans: state.pilePlans.map(plan => plan.id === "changed"
    ? { ...plan, pileCapProposals: [...rest, { ...edited, pile_count: 4 }] } : plan) }}
    taskPanel="pile-cap-changes" onStateChange={() => {}} />);
  expect(locations()).toEqual(before);
});

test("reset all delegates one active-plan action, sharing edit guards and disabling empty plans", () => {
  const state = fixture(), reset = vi.fn(), changed = vi.fn();
  const view = render(<RightPanel state={state} taskPanel="pile-cap-changes" onStateChange={changed} onResetAllPileCaps={reset} />);
  const button = () => screen.getByRole("button", { name: "Reset all pile cap changes in this pile plan" }) as HTMLButtonElement;
  fireEvent.click(button());
  expect(reset).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
  view.rerender(<RightPanel state={state} taskPanel="pile-cap-changes" onStateChange={changed} onResetAllPileCaps={reset} pileCapPending />);
  expect(button().disabled).toBe(true);
  view.rerender(<RightPanel state={{ ...state, activePilePlanId: "empty" }} taskPanel="pile-cap-changes" onStateChange={changed} onResetAllPileCaps={reset} />);
  expect(button().disabled).toBe(true);
  fireEvent.click(button());
  expect(reset).toHaveBeenCalledOnce();
});
