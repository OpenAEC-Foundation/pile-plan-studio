import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import { beginManualCptSelection } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import CptPanel from "./CptPanel.tsx";
import { getSelectedLoadPoints } from "./rightPanelModel.ts";
import { localizeCptName } from "./PanelControls.tsx";

const t = (key: string, options = {}) => i18n.t(key, { ns: "rightPanel", ...options });
function fixture() {
  const project = projectFixture(), point = project.loadPoints[0], cpt = project.cpts[0];
  return { ...project, selectedCptId: null, selectedLoadPointId: point.id, selectedLoadPointIds: [point.id],
    selectedCptsByLoadPointId: new Map([[point.id, [{ cpt, label: "nearest", distance_mm: 1500 }]]]) };
}

test("CPT action keys retain their native default without reaching viewer shortcuts; Undo remains available", () => {
  const state = fixture(), outer = vi.fn();
  render(<div onKeyDown={outer}><CptPanel state={state} selectedLoadPoints={getSelectedLoadPoints(state)} onStateChange={vi.fn()} /></div>);
  const modify = screen.getByRole("button", { name: t("actions.modify") });
  expect(fireEvent.keyDown(modify, { key: " " })).toBe(true);
  fireEvent.keyDown(modify, { key: "Enter" }); expect(outer).not.toHaveBeenCalled();
  fireEvent.keyDown(modify, { key: "z", ctrlKey: true }); expect(outer).toHaveBeenCalledOnce();
});

test.each(["en", "nl"])("overview keeps a labelled table, direct CPT inspection and independent method callbacks in %s", async language => {
  await i18n.changeLanguage(language); const state = fixture(), change = vi.fn(), method = vi.fn();
  render(<CptPanel state={state} selectedLoadPoints={getSelectedLoadPoints(state)} onStateChange={change} onApplyMethod={method} />);
  const table = screen.getByRole("table", { name: t("tabs.cpts") });
  fireEvent.click(within(table).getByRole("button", { name: localizeCptName(state.cpts[0].name, i18n.getFixedT(null, "rightPanel")) }));
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ selectedCptId: state.cpts[0].id, rightPanelMode: "cpts" }));
  fireEvent.click(screen.getByRole("button", { name: t("actions.onlyNearest") }));
  expect(method).toHaveBeenCalledExactlyOnceWith("nearest");
  expect(state.cptSelectionEditDraft).toBeNull();
});

test("detail table preserves engineering subscript labels and readable capacity values", () => {
  const initial = fixture(), cpt = initial.cpts[0];
  const state = { ...initial, selectedCptId: cpt.id, cptFrdRowsByCptId: new Map([[cpt.id, [
    { pile_size_mm: 290, pile_tip_level_m: -18, frd_kn: 725, direction: "compression" as const },
  ]]]) };
  render(<CptPanel state={state} selectedLoadPoints={getSelectedLoadPoints(state)} onStateChange={vi.fn()} />);
  const table = screen.getByRole("table", { name: t("cpts.selected") });
  expect(within(table).getByText("290 mm")).toBeTruthy();
  expect(within(table).getByText("725 kN")).toBeTruthy();
  expect(within(table).getAllByRole("columnheader").some(header => header.querySelector("sub")?.textContent === "c;net;d")).toBe(true);
});

test("preview and saving gates protect remove/method/save actions while cancellation remains available until saving", () => {
  const base = fixture(), initial = { ...base, selectedLoadPointIds: base.loadPoints.slice(0, 2).map(point => point.id) };
  const editing = beginManualCptSelection(initial), state = { ...editing, cptSelectionEditDraft: {
    ...editing.cptSelectionEditDraft!, automaticLoadPointIds: new Set([base.loadPoints[1].id]),
  } }, change = vi.fn(), save = vi.fn();
  const props = { state, selectedLoadPoints: getSelectedLoadPoints(state), onStateChange: change, onSave: save };
  const view = render(<CptPanel {...props} />);
  const remove = () => screen.getByRole("button", { name: t("actions.removeCpt", { cpt: state.cpts[0].name }) }) as HTMLButtonElement;
  expect(remove().disabled).toBe(true);
  expect((screen.getByRole("button", { name: t("actions.save") }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: t("actions.cancel") }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole("status").textContent).toContain(t("cpts.previewCalculating"));
  const ready = { ...state, cptSelectionPreview: { draft: state.cptSelectionEditDraft!, status: "ready" as const,
    pileOptionsByLoadPointId: state.pileOptionsByLoadPointId } };
  view.rerender(<CptPanel {...props} state={ready} saving />);
  expect((screen.getByRole("button", { name: t("actions.cancel") }) as HTMLButtonElement).disabled).toBe(true);
  remove().click(); expect(change).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
});
