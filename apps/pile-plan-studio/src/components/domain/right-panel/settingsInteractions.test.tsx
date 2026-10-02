import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import CptSettingsPanel from "./CptSettingsPanel.tsx";
import LoadPointGroupEditButton from "./LoadPointGroupEditButton.tsx";
import { PanelTab } from "./PanelControls.tsx";
import type { LoadPointGroupEditPreview } from "../../../core/loadPointGroupContract.ts";
const t = (key: string) => i18n.t(key, { ns: "rightPanel" });

test("CPT settings disable selected scope without selection and commit number drafts only on blur", () => {
  const state = { ...projectFixture(), selectedLoadPointIds: [], selectedLoadPointId: null, cptSettingsScope: "all" as const }, change = vi.fn();
  const view = render(<CptSettingsPanel state={state} onStateChange={change} onClose={vi.fn()} />);
  const selected = screen.getByRole("button", { name: t("cptSettings.selectedLoadPoints") });
  fireEvent.click(selected); expect(change).not.toHaveBeenCalled();
  const input = screen.getByRole("spinbutton", { name: t("cptSettings.maxDistance") });
  fireEvent.change(input, { target: { value: "123" } }); expect(change).not.toHaveBeenCalled();
  fireEvent.blur(input); expect(change.mock.calls[0][0].globalCptSelectionSettings.maxDistanceM).toBe(123);
  const id = state.loadPoints[0].id;
  view.rerender(<CptSettingsPanel state={{ ...state, selectedLoadPointIds: [id], selectedLoadPointId: id }} onStateChange={change} onClose={vi.fn()} />);
  fireEvent.click(selected); expect(change.mock.calls[1][0].cptSettingsScope).toBe("selected");
  expect(state.cptSettingsScope).not.toBe("selected");
});

test("inspection tab deactivates task mode and changes the inspection state", () => {
  const state = projectFixture(), activate = vi.fn(), change = vi.fn();
  render(<PanelTab active={false} label="CPT" mode="cpts" state={state} onActivate={activate} onStateChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "CPT" }));
  expect(activate).toHaveBeenCalledOnce(); expect(change.mock.calls[0][0].rightPanelMode).toBe("cpts");
  expect(change.mock.calls[0][0]).not.toBe(state);
});

test("group edit remains blocked while preview runs and ignores the previous selection's preview", async () => {
  let resolve!: (value: LoadPointGroupEditPreview) => void;
  const stale = new Promise<LoadPointGroupEditPreview>(done => { resolve = done; });
  const preview = vi.fn().mockReturnValueOnce(stale).mockResolvedValue({ allowed: false, reason: "not_connected" });
  const apply = vi.fn(); const p = { groups: [], editPending: false, onPreview: preview, onApply: apply };
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
