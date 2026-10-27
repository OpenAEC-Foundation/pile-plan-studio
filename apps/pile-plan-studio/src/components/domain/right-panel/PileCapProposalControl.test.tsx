import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import PileCapProposalControl from "./PileCapProposalControl.tsx";
import RightPanel from "./RightPanel.tsx";
import type { PileCapPreview } from "../../../core/pileCapProposalTypes.ts";
const t = (key: string) => i18n.t(`pileCap.${key}`, { ns: "rightPanel" });

test("manual cap counts extend past six, stop at twenty and preserve larger original groups", () => {
  const state = projectFixture(), onEdit = vi.fn();
  const proposal = { load_point_ids: [15, 43], pile_count: 6, quarter_turns: 0, configuration: null };
  const view = render(<PileCapProposalControl state={state} ids={[15, 43]} proposal={proposal} preview={null} pending={false} onEdit={onEdit}/>);
  fireEvent.click(screen.getByRole("button", { name: t("increase") }));
  expect(onEdit.mock.calls[0][0].pile_count).toBe(7);
  view.rerender(<PileCapProposalControl state={state} ids={[15, 43]} proposal={{...proposal, pile_count: 20}} preview={null} pending={false} onEdit={onEdit}/>);
  expect((screen.getByRole("button", { name: t("increase") }) as HTMLButtonElement).disabled).toBe(true);
  const ids = Array.from({length:25}, (_,i)=>i+1);
  view.rerender(<PileCapProposalControl state={state} ids={ids} proposal={null} preview={null} pending={false} onEdit={onEdit}/>);
  expect(screen.getByText(i18n.t("pileCap.count", { ns:"rightPanel", count:25 }))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("decrease") }));
  expect(onEdit.mock.calls[1][0].pile_count).toBe(20);
  expect(ids).toHaveLength(25);
});

test.each([7, 20, 25])("the selection panel keeps cap controls available for an existing group of %i", count => {
  const base = projectFixture(), ids = Array.from({length:count},(_,i)=>i+1);
  const state = { ...base, selectedLoadPointId:1, selectedLoadPointIds:ids,
    loadPoints:ids.map(id=>({...base.loadPoints[0],id,x_mm:id*650})) };
  render(<RightPanel state={state} loadPointGroups={[{load_point_ids:ids}]} onStateChange={()=>{}} onEditPileCap={()=>{}}/>);
  fireEvent.click(screen.getByRole("button", { name:t("title") }));
  expect(screen.getByRole("button", { name:t("decrease") })).toBeTruthy();
  expect(screen.getByText(i18n.t("pileCap.count", { ns:"rightPanel",count }))).toBeTruthy();
});

test("the count and rotation bar edits proposals without publishing source changes", () => {
  const state = projectFixture(),
    onEdit = vi.fn(),
    proposal = {
      load_point_ids: [15, 43],
      pile_count: 3,
      quarter_turns: 3,
      configuration: null,
    };
  const view = render(
    <PileCapProposalControl
      state={state}
      ids={[15, 43]}
      proposal={proposal}
      preview={null}
      pending={false}
      onEdit={onEdit}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: t("increase") }));
  expect(onEdit.mock.calls[0][0]).toMatchObject({
    load_point_ids: [15, 43],
    pile_count: 4,
    quarter_turns: 3,
  });
  fireEvent.click(screen.getByRole("button", { name: t("rotate") }));
  expect(onEdit.mock.calls[1][0]).toMatchObject({
    pile_count: 3,
    quarter_turns: 0,
  });
  expect(proposal.pile_count).toBe(3);
  view.rerender(
    <PileCapProposalControl
      state={state}
      ids={[15, 43]}
      proposal={{ ...proposal, pile_count: 1 }}
      preview={null}
      pending={false}
      onEdit={onEdit}
    />,
  );
  expect(
    (screen.getByRole("button", { name: t("decrease") }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  view.rerender(
    <PileCapProposalControl
      state={state}
      ids={[15, 43]}
      proposal={{ ...proposal, pile_count: 20 }}
      preview={null}
      pending={true}
      onEdit={onEdit}
    />,
  );
  expect(
    (screen.getByRole("button", { name: t("increase") }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: t("rotate") }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test("the Poer toggle lives beside the group action and opening it is transient", () => {
  const state = {
    ...projectFixture(),
    selectedLoadPointIds: [15, 43],
    selectedLoadPointId: 15,
  };
  const change = vi.fn(),
    edit = vi.fn();
  const view = render(
    <RightPanel
      state={state}
      loadPointGroups={[{ load_point_ids: [15, 43] }]}
      onStateChange={change}
      onEditPileCap={edit}
    />,
  );
  const toggle = screen.getByRole("button", { name: t("title") });
  expect(toggle.closest(".selection-overview-actions")).not.toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: t("increase") })).not.toBeNull();
  expect(change).not.toHaveBeenCalled();
  expect(edit).not.toHaveBeenCalled();
  view.rerender(
    <RightPanel
      state={{ ...state, selectedLoadPointIds: [15] }}
      loadPointGroups={[{ load_point_ids: [15, 43] }]}
      onStateChange={change}
      onEditPileCap={edit}
    />,
  );
  expect(screen.queryByRole("button", { name: t("title") })).toBeNull();
});

test("an orphaned proposal remains removable even if every original member was deleted", () => {
  const base = projectFixture();
  const proposal = {
    load_point_ids: [999999],
    pile_count: 2,
    quarter_turns: 0,
    configuration: null,
  };
  const state = {
    ...base,
    selectedLoadPointIds: [],
    selectedLoadPointId: null,
    pilePlans: base.pilePlans.map((p) => ({
      ...p,
      pileCapProposals: [proposal],
    })),
  };
  const preview: PileCapPreview = {
    proposal,
    status: "group_changed",
    center: { x_mm: 0, y_mm: 0 },
    positions: [],
    options: [],
    cpt_ids: [],
    missing_selection_load_point_ids: [],
    total_load_kn: null,
    load_per_pile_kn: null,
  };
  const edit = vi.fn();
  render(
    <RightPanel
      state={state}
      onStateChange={() => {}}
      onEditPileCap={edit}
      pileCapResult={{
        plans: [
          {
            plan_id: state.activePilePlanId,
            proposals: [proposal],
            previews: [preview],
            pile_count: state.loadPoints.length,
            total_cost: 0,
            missing_cost_count: 0,
          },
        ],
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: t("remove") }));
  expect(edit).toHaveBeenCalledWith(proposal, true);
});

test("reset removes only this proposal and is unavailable while an edit is pending", () => {
  const proposal = {
    load_point_ids: [15, 43],
    pile_count: 5,
    quarter_turns: 2,
    configuration: null,
  };
  const onEdit = vi.fn(),
    state = projectFixture();
  const view = render(
    <PileCapProposalControl
      state={state}
      ids={[15, 43]}
      proposal={proposal}
      preview={null}
      pending={false}
      onEdit={onEdit}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: t("reset") }));
  expect(onEdit).toHaveBeenCalledWith(proposal, true);
  view.rerender(
    <PileCapProposalControl
      state={state}
      ids={[15, 43]}
      proposal={proposal}
      preview={null}
      pending={true}
      onEdit={onEdit}
    />,
  );
  expect(
    (screen.getByRole("button", { name: t("reset") }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
