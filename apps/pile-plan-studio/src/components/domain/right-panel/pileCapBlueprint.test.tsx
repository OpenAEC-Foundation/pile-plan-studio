import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import { beginManualCptSelection } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import type { PileCapPreview } from "../../../core/pileCapProposalTypes.ts";
import PileCapChangesPanel from "./PileCapChangesPanel.tsx";
import PileCapProposalControl from "./PileCapProposalControl.tsx";

const t = (key: string) => i18n.t(key, { ns: "rightPanel" });
function fixture() {
  const base = projectFixture();
  const proposals = [
    { load_point_ids: [15, 43], pile_count: 3, quarter_turns: 1, configuration: null },
    { load_point_ids: [62], pile_count: 2, quarter_turns: 0, configuration: null },
    { load_point_ids: [8, 12], pile_count: 2, quarter_turns: 0, configuration: null },
    { load_point_ids: [999], pile_count: 4, quarter_turns: 0, configuration: null },
  ];
  const state = { ...base, selectedLoadPointIds: [15, 43], selectedLoadPointId: 15,
    loadPoints: [8, 12, 15, 43, 62].map(id => ({ ...base.loadPoints[0], id })),
    pilePlans: base.pilePlans.map(plan => ({ ...plan, pileCapProposals: proposals })),
  };
  return { state, proposals };
}
function preview(proposal: ReturnType<typeof fixture>["proposals"][number], status: PileCapPreview["status"]): PileCapPreview {
  return { proposal, status, center: { x_mm: 0, y_mm: 0 }, positions: [], options: [], cpt_ids: [],
    missing_selection_load_point_ids: [], total_load_kn: 1500, load_per_pile_kn: 500 };
}

test("overview activation retains native defaults and stays out of viewer shortcuts while Undo remains available", () => {
  const { state } = fixture(), outer = vi.fn(), close = vi.fn();
  render(<div onKeyDown={outer}><PileCapChangesPanel state={state} previews={[]} selectionPending={false}
    resetDisabled={false} onResetAll={vi.fn()} onSelect={vi.fn()} onClose={close} /></div>);
  const button = screen.getByRole("button", { name: t("pileCapOverview.close") });
  expect(fireEvent.keyDown(button, { key: " " })).toBe(true);
  fireEvent.keyDown(button, { key: "Enter" }); expect(outer).not.toHaveBeenCalled();
  fireEvent.keyDown(button, { key: "z", ctrlKey: true }); expect(outer).toHaveBeenCalledOnce();
  fireEvent.click(button); expect(close).toHaveBeenCalledOnce();
});

test("standalone proposal controls isolate activation keys and retain the existing immutable edit callback", () => {
  const { state, proposals } = fixture(), edit = vi.fn(), outer = vi.fn(), proposal = proposals[0];
  render(<div onKeyDown={outer}><PileCapProposalControl state={state} ids={proposal.load_point_ids}
    proposal={proposal} preview={preview(proposal, "active")} pending={false} onEdit={edit} /></div>);
  const increase = screen.getByRole("button", { name: t("pileCap.increase") });
  expect(fireEvent.keyDown(increase, { key: " " })).toBe(true);
  fireEvent.keyDown(increase, { key: "Enter" }); expect(outer).not.toHaveBeenCalled();
  fireEvent.click(increase);
  expect(edit).toHaveBeenCalledWith(expect.objectContaining({ pile_count: 4, quarter_turns: 1, load_point_ids: [15, 43] }));
  expect(edit.mock.calls[0][0].load_point_ids).not.toBe(proposal.load_point_ids);
  expect(proposal.pile_count).toBe(3);
});

test.each(["en", "nl"])("overview retains distinct inactive reasons and remaining-source selection in %s", async language => {
  await i18n.changeLanguage(language); const { state, proposals } = fixture(), select = vi.fn();
  const previews = proposals.slice(0, 3).map((proposal, index) => preview(proposal,
    (["group_changed", "invalid_source_data", "missing_cpt_selection"] as const)[index]));
  render(<PileCapChangesPanel state={state} previews={previews} selectionPending={false} resetDisabled={false}
    onResetAll={vi.fn()} onSelect={select} onClose={vi.fn()} />);
  const list = screen.getByRole("list", { name: t("pileCapOverview.title") });
  for (const key of ["pileCap.groupChanged", "pileCap.invalidSource", "pileCap.missingSelection", "pileCapOverview.sourceMissing"]) {
    expect(within(list).getByText(t(key))).toBeTruthy();
  }
  fireEvent.click(within(list).getByRole("button", { name: /15, 43.*2.*3/ }));
  expect(select).toHaveBeenCalledExactlyOnceWith([15, 43]);
  const orphan = within(list).getByRole("button", { name: /999.*1.*4/ }) as HTMLButtonElement;
  expect(orphan.disabled).toBe(true); orphan.click(); expect(select).toHaveBeenCalledTimes(1);
});

test("proposal facts retain force formatting and source-edit precedence while pending blocks edits", () => {
  const { state, proposals } = fixture(), proposal = proposals[0], edit = vi.fn();
  const props = { state, ids: proposal.load_point_ids, proposal, preview: preview(proposal, "active"), pending: false, onEdit: edit };
  const view = render(<PileCapProposalControl {...props} />);
  expect(screen.getByText(i18n.t("pileCap.forces", { ns: "rightPanel", total: "1,500", each: "500" }))).toBeTruthy();
  view.rerender(<PileCapProposalControl {...props} pending />);
  expect(screen.getByText(t("pileCap.calculating"))).toBeTruthy();
  for (const key of ["increase", "decrease", "rotate", "reset"]) {
    const button = screen.getByRole("button", { name: t(`pileCap.${key}`) }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); button.click();
  }
  expect(edit).not.toHaveBeenCalled();
  view.rerender(<PileCapProposalControl {...props} state={beginManualCptSelection(state)} pending />);
  expect(screen.getByText(t("pileCap.sourceEditing"))).toBeTruthy();
  expect(screen.queryByText(t("pileCap.calculating"))).toBeNull();
});
