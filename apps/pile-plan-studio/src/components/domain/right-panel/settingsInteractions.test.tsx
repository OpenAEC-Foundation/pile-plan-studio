import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import CptSettingsPanel from "./CptSettingsPanel.tsx";
import LoadPointGroupEditButton from "./LoadPointGroupEditButton.tsx";
import GroupingSettingsPanel from "./GroupingSettingsPanel.tsx";
import { PanelTab } from "./PanelControls.tsx";
import type { LoadPointGroupEditPreview } from "../../../core/loadPointGroupContract.ts";
const t = (key: string) => i18n.t(key, { ns: "rightPanel" });

test("CPT settings disable selected scope without selection and commit number drafts only on blur", () => {
  const state = { ...projectFixture(), selectedLoadPointIds: [], selectedLoadPointId: null, cptSettingsScope: "all" as const }, change = vi.fn();
  const view = render(<CptSettingsPanel state={state} onStateChange={change} onClose={vi.fn()} />);
  const selected = screen.getByRole("radio", { name: t("cptSettings.selectedLoadPoints") });
  expect((selected as HTMLInputElement).disabled).toBe(true);
  const input = screen.getByRole("spinbutton", { name: t("cptSettings.maxDistance") });
  fireEvent.change(input, { target: { value: "123" } }); expect(change).not.toHaveBeenCalled();
  fireEvent.blur(input); expect(change.mock.calls[0][0].globalCptSelectionSettings.maxDistanceM).toBe(123);
  const id = state.loadPoints[0].id;
  view.rerender(<CptSettingsPanel state={{ ...state, selectedLoadPointIds: [id], selectedLoadPointId: id }} onStateChange={change} onClose={vi.fn()} />);
  fireEvent.click(selected); expect(change.mock.calls[1][0].cptSettingsScope).toBe("selected");
  expect(state.cptSettingsScope).not.toBe("selected");
});

test("CPT selected-scope edits preserve manual choices unless overwrite is explicitly enabled", () => {
  const base = projectFixture();
  const [first, second] = base.loadPoints;
  const manual = new Map([[first.id, [base.cpts[0].id]], [second.id, [base.cpts[1].id]]]);
  const state = { ...base, selectedLoadPointIds: [first.id], selectedLoadPointId: first.id,
    cptSettingsScope: "selected" as const, manualCptIdsByLoadPoint: manual };
  const change = vi.fn();
  render(<CptSettingsPanel state={state} onStateChange={change} onClose={vi.fn()} />);
  const input = screen.getByRole("spinbutton", { name: t("cptSettings.maxDistance") });
  fireEvent.change(input, { target: { value: "73" } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.blur(input);
  const preserved = change.mock.calls[0][0];
  expect(preserved.globalCptSelectionSettings).toBe(state.globalCptSelectionSettings);
  expect(preserved.cptSelectionSettingsByLoadPoint.get(first.id).maxDistanceM).toBe(73);
  expect(preserved.cptSelectionSettingsByLoadPoint.has(second.id)).toBe(false);
  expect(preserved.manualCptIdsByLoadPoint).toEqual(manual);
  fireEvent.click(screen.getByRole("checkbox", { name: t("cptSettings.overwriteManualSelections") }));
  expect(change).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "74" } });
  fireEvent.blur(input);
  const overwritten = change.mock.calls[1][0];
  expect(overwritten.manualCptIdsByLoadPoint.has(first.id)).toBe(false);
  expect(overwritten.manualCptIdsByLoadPoint.get(second.id)).toEqual(manual.get(second.id));
  expect(state.manualCptIdsByLoadPoint).toEqual(manual);
  expect(state.cptSelectionSettingsByLoadPoint.has(first.id)).toBe(false);
});

test("mixed CPT settings keep both algorithm choices unselected and blank drafts do not overwrite them", () => {
  const base = projectFixture();
  const [first, second] = base.loadPoints;
  const state = { ...base, selectedLoadPointIds: [first.id, second.id], selectedLoadPointId: first.id,
    cptSettingsScope: "selected" as const,
    cptSelectionSettingsByLoadPoint: new Map([
      [first.id, { ...base.globalCptSelectionSettings, algorithm: "quadrants" as const, maxDistanceM: 20 }],
      [second.id, { ...base.globalCptSelectionSettings, algorithm: "maximum-angle" as const, maxDistanceM: 30 }],
    ]) };
  const change = vi.fn();
  render(<CptSettingsPanel state={state} onStateChange={change} onClose={vi.fn()} />);
  const group = screen.getByRole("radiogroup", { name: t("cptSettings.algorithm") });
  const tiles = within(group).getAllByRole("radio");
  expect(tiles.every(tile => tile.tagName === "BUTTON" && tile.getAttribute("aria-checked") === "false")).toBe(true);
  expect(tiles.map(tile => tile.tabIndex)).toEqual([0, -1]);
  const distance = screen.getByRole("spinbutton", { name: t("cptSettings.maxDistance") }) as HTMLInputElement;
  expect(distance.value).toBe("");
  expect(distance.placeholder).toBe(t("cptSettings.mixed"));
  expect((screen.getByRole("spinbutton", { name: t("cptSettings.maximumAngle") }) as HTMLInputElement).disabled).toBe(false);
  fireEvent.blur(distance);
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(within(group).getByRole("radio", { name: t("cptSettings.maximumAngle") }));
  expect(change.mock.calls[0][0].cptSelectionSettingsByLoadPoint.get(first.id).algorithm).toBe("maximum-angle");
  expect(state.cptSelectionSettingsByLoadPoint.get(first.id)?.algorithm).toBe("quadrants");
});

test("algorithm tiles support whole-tile selection, arrows and a single keyboard entry", () => {
  const base = projectFixture();
  const change = vi.fn();
  const state = { ...base, selectedLoadPointIds: [], selectedLoadPointId: null,
    globalCptSelectionSettings: { ...base.globalCptSelectionSettings, algorithm: "quadrants" as const } };
  const view = render(<CptSettingsPanel state={state} onStateChange={change} onClose={vi.fn()} />);
  const group = screen.getByRole("radiogroup", { name: t("cptSettings.algorithm") });
  const [quadrants, angle] = within(group).getAllByRole("radio");
  expect(quadrants.tagName).toBe("BUTTON");
  expect(quadrants.getAttribute("aria-checked")).toBe("true");
  expect([quadrants.tabIndex, angle.tabIndex]).toEqual([0, -1]);
  act(() => quadrants.focus());
  fireEvent.keyDown(quadrants, { key: "ArrowRight" });
  expect(document.activeElement).toBe(angle);
  expect(change.mock.calls[0][0].globalCptSelectionSettings.algorithm).toBe("maximum-angle");
  view.rerender(<CptSettingsPanel state={change.mock.calls[0][0]} onStateChange={change} onClose={vi.fn()} />);
  expect(angle.getAttribute("aria-checked")).toBe("true");
  expect([quadrants.tabIndex, angle.tabIndex]).toEqual([-1, 0]);
  fireEvent.click(quadrants);
  expect(change.mock.calls[1][0].globalCptSelectionSettings.algorithm).toBe("quadrants");
  expect(state.globalCptSelectionSettings.algorithm).toBe("quadrants");
});

test("tile activation keys keep their native behavior without reaching viewer shortcuts", () => {
  const background = vi.fn();
  render(<CptSettingsPanel state={projectFixture()} onStateChange={vi.fn()} onClose={vi.fn()} />);
  const group = screen.getByRole("radiogroup", { name: t("cptSettings.algorithm") });
  const tile = within(group).getAllByRole("radio")[0];
  window.addEventListener("keydown", background);
  try {
    expect(fireEvent.keyDown(tile, { key: " ", code: "Space" })).toBe(true);
    expect(background).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener("keydown", background);
  }
});

test("Blueprint numeric fields associate help, commit on Enter and preserve angle limits", () => {
  const base = projectFixture();
  const state = { ...base, selectedLoadPointIds: [], selectedLoadPointId: null,
    globalCptSelectionSettings: { ...base.globalCptSelectionSettings, algorithm: "maximum-angle" as const } };
  const change = vi.fn();
  render(<CptSettingsPanel state={state} onStateChange={change} onClose={vi.fn()} />);
  const distance = screen.getByRole("spinbutton", { name: t("cptSettings.maxDistance") });
  expect(document.querySelector(`label[for="${distance.id}"]`)?.textContent).toBe(t("cptSettings.maxDistance"));
  const help = document.getElementById(distance.getAttribute("aria-describedby") ?? "");
  expect(help?.textContent).toBe(t("cptSettings.maxDistanceHelp"));
  act(() => distance.focus());
  fireEvent.change(distance, { target: { value: "-3" } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(distance, { key: "Enter" });
  expect(change.mock.calls[0][0].globalCptSelectionSettings.maxDistanceM).toBe(0);
  const angle = screen.getByRole("spinbutton", { name: t("cptSettings.maximumAngle") });
  expect(document.querySelector(`label[for="${angle.id}"]`)?.textContent).toBe(t("cptSettings.maximumAngle"));
  fireEvent.change(angle, { target: { value: "999" } });
  fireEvent.blur(angle);
  expect(change.mock.calls[1][0].globalCptSelectionSettings.maxAngleDegrees).toBe(360);
  fireEvent.change(angle, { target: { value: "" } });
  fireEvent.blur(angle);
  expect(change.mock.calls[2][0].globalCptSelectionSettings.maxAngleDegrees).toBe(1);
});

test("manual CPT actions use the existing draft route and close the settings panel", () => {
  const base = projectFixture();
  const id = base.loadPoints[0].id;
  const state = { ...base, selectedLoadPointIds: [id], selectedLoadPointId: id,
    manualCptIdsByLoadPoint: new Map([[id, [base.cpts[0].id]]]) };
  const change = vi.fn(), close = vi.fn();
  render(<CptSettingsPanel state={state} onStateChange={change} onClose={close} />);
  fireEvent.click(screen.getByRole("button", { name: t("actions.modifySelection") }));
  expect(change.mock.calls[0][0].cptSelectionEditDraft.loadPointIds).toEqual([id]);
  expect(close).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: t("actions.useAlgorithm") }));
  expect(change.mock.calls[1][0].cptSelectionEditDraft.automaticLoadPointIds.has(id)).toBe(true);
  expect(close).toHaveBeenCalledTimes(2);
  expect(state.manualCptIdsByLoadPoint.get(id)).toEqual([base.cpts[0].id]);
});

test("inspection tab deactivates task mode and changes the inspection state", () => {
  const state = projectFixture(), activate = vi.fn(), change = vi.fn();
  render(<PanelTab active={false} label="CPT" mode="cpts" state={state} onActivate={activate} onStateChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "CPT" }));
  expect(activate).toHaveBeenCalledOnce(); expect(change.mock.calls[0][0].rightPanelMode).toBe("cpts");
  expect(change.mock.calls[0][0]).not.toBe(state);
});

test.each([undefined, "blueprint"] as const)("group edit (%s) remains blocked while preview runs and ignores the previous selection's preview", async variant => {
  let resolve!: (value: LoadPointGroupEditPreview) => void;
  const stale = new Promise<LoadPointGroupEditPreview>(done => { resolve = done; });
  const preview = vi.fn().mockReturnValueOnce(stale).mockResolvedValue({ allowed: false, reason: "disconnected_selection" });
  const apply = vi.fn(); const p = { groups: [], editPending: false, onPreview: preview, onApply: apply, variant };
  const view = render(<LoadPointGroupEditButton {...p} selectedLoadPointIds={[2, 1, 2]} />);
  const button = screen.getByRole("button", { name: t("groupActions.group") });
  expect(preview).toHaveBeenCalledWith("group", [1, 2]); fireEvent.click(button); expect(apply).not.toHaveBeenCalled();
  view.rerender(<LoadPointGroupEditButton {...p} selectedLoadPointIds={[3, 4]} />);
  await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
  await act(async () => resolve({ allowed: true, reason: null }));
  expect((button as HTMLButtonElement).disabled).toBe(true);
  preview.mockResolvedValue({ allowed: true, reason: null });
  view.rerender(<LoadPointGroupEditButton {...p} selectedLoadPointIds={[5, 6]} />);
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button); expect(apply).toHaveBeenCalledWith("group", [5, 6]);
});


function groupingProps() {
  return {
    state: { ...projectFixture(), selectedLoadPointIds: [] }, loadPointGroups: [], groupEditPending: false,
    onPreviewLoadPointGroupEdit: vi.fn().mockResolvedValue({ allowed: true, reason: null }),
    onApplyLoadPointGroupEdit: vi.fn().mockResolvedValue(undefined), onStateChange: vi.fn(), onClose: vi.fn(),
  };
}

test("group visibility edits project content immutably and reset respects overrides and pending edits", () => {
  const p = groupingProps();
  const view = render(<GroupingSettingsPanel {...p} />);
  const visible = screen.getByRole("checkbox", { name: t("groupingSettings.showGroups") });
  fireEvent.click(visible);
  const changed = p.onStateChange.mock.calls[0][0];
  expect(changed).not.toBe(p.state);
  expect(changed.showLoadPointGroups).toBe(!p.state.showLoadPointGroups);
  expect(changed.loadPointGroupingSettings).toBe(p.state.loadPointGroupingSettings);
  expect(changed.pilePlans).toBe(p.state.pilePlans);
  const reset = screen.getByRole("button", { name: t("groupingSettings.reset") }) as HTMLButtonElement;
  expect(reset.disabled).toBe(true);
  const state = { ...p.state, loadPointGroupingSettings: { ...p.state.loadPointGroupingSettings,
    manualGroups: [{ loadPointIds: [1, 2] }],
  } };
  view.rerender(<GroupingSettingsPanel {...p} state={state} />);
  expect(reset.disabled).toBe(false);
  fireEvent.click(reset);
  expect(p.onApplyLoadPointGroupEdit).toHaveBeenCalledWith("reset_overrides");
  expect(state.loadPointGroupingSettings.manualGroups).toHaveLength(1);
  view.rerender(<GroupingSettingsPanel {...p} state={state} groupEditPending />);
  expect(reset.disabled).toBe(true);
});

test("grouping control activation avoids viewer shortcuts without blocking native defaults or Undo", () => {
  const p = groupingProps(), outerKey = vi.fn();
  render(<div onKeyDown={outerKey}><GroupingSettingsPanel {...p} /></div>);
  expect(fireEvent.keyDown(screen.getByRole("checkbox", { name: t("groupingSettings.automatic") }), { key: " ", code: "Space" })).toBe(true);
  fireEvent.keyDown(screen.getByRole("button", { name: t("actions.close") }), { key: "Enter" });
  expect(outerKey).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("button", { name: t("actions.close") }), { key: "z", ctrlKey: true });
  expect(outerKey).toHaveBeenCalledOnce();
});
