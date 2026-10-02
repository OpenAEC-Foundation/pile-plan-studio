import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../i18n/config.ts";
import CostCatalogEditor from "./right-panel/CostCatalogEditor.tsx";
import ProjectInformationDialog from "./project/ProjectInformationDialog.tsx";
import MissingCptPopover from "./right-panel/MissingCptPopover.tsx";
import ActionNotice from "../viewer/ActionNotice.tsx";
import { projectFixture } from "../../test/projectFixture.ts";
import GroupingSettingsPanel from "./right-panel/GroupingSettingsPanel.tsx";
import type { ProjectState } from "../../domain/project/projectState.ts";

const t = (key: string, ns = "common") => i18n.t(key, { ns });
function costProps() {
  return { settings: { schema_version: 1, items: [{ pile_size_mm: 290, shape: "square" as const, cost_per_m3: 545 }] },
    bearingCapacities: [], currencyCode: "EUR", hasPersonalDefault: true, onEditCosts: vi.fn().mockResolvedValue(true),
    onSavePersonalDefault: vi.fn(), onLoadPersonalDefault: vi.fn(), onRemovePersonalDefault: vi.fn(),
    onLoadBuiltInDefault: vi.fn(), onClose: vi.fn() };
}
test.each(["en", "nl"])("duplicate cost rows show the specific error in %s and retain the draft", async language => {
  await i18n.changeLanguage(language); const props = costProps();
  props.onEditCosts.mockRejectedValue(new Error("duplicate_pile_size"));
  render(<CostCatalogEditor {...props} />);
  const size = screen.getByRole("textbox", { name: t("cost.size", "rightPanel") });
  fireEvent.change(size, { target: { value: "290" } });
  fireEvent.change(screen.getByRole("textbox", { name: t("cost.costPerM3", "rightPanel") }), { target: { value: "500" } });
  fireEvent.click(screen.getByRole("button", { name: t("cost.add", "rightPanel") }));
  expect((await screen.findByRole("alert")).textContent).toBe(t("cost.duplicateSize", "rightPanel"));
  expect((size as HTMLInputElement).value).toBe("290");
});
test("successful cost additions clear the draft; invalid inputs never reach the core edit callback", async () => {
  const props = costProps(); render(<CostCatalogEditor {...props} />);
  const size = screen.getByRole("textbox", { name: t("cost.size", "rightPanel") });
  const add = screen.getByRole("button", { name: t("cost.add", "rightPanel") });
  fireEvent.click(add); expect(props.onEditCosts).not.toHaveBeenCalled();
  fireEvent.change(size, { target: { value: "320" } }); fireEvent.click(add);
  await waitFor(() => expect((size as HTMLInputElement).value).toBe(""));
  expect(props.onEditCosts).toHaveBeenCalledWith([{ action: "add", item: { pile_size_mm: 320, shape: "round", cost_per_m3: 0 } }]);
});
test("replacing a personal cost default requires confirmation, while loading and removing use their own callbacks", () => {
  const props = costProps(); render(<CostCatalogEditor {...props} />);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const save = screen.getByRole("button", { name: t("cost.savePersonalDefault", "rightPanel") });
  fireEvent.click(save); expect(props.onSavePersonalDefault).not.toHaveBeenCalled();
  confirm.mockReturnValue(true); fireEvent.click(save); expect(props.onSavePersonalDefault).toHaveBeenCalledWith(props.settings);
  fireEvent.click(screen.getByRole("button", { name: t("cost.loadPersonalDefault", "rightPanel") }));
  fireEvent.click(screen.getByRole("button", { name: t("cost.removePersonalDefault", "rightPanel") }));
  fireEvent.click(screen.getByRole("button", { name: t("cost.loadBuiltInDefault", "rightPanel") }));
  expect(props.onLoadPersonalDefault).toHaveBeenCalledOnce(); expect(props.onRemovePersonalDefault).toHaveBeenCalledOnce();
  expect(props.onLoadBuiltInDefault).toHaveBeenCalledOnce();
});
test("project information saves normalized fields together and closes only after an accepted save", async () => {
  const save = vi.fn().mockResolvedValue(false), close = vi.fn();
  const view = render(<ProjectInformationDialog open projectName="P" pileHeadLevelM={0} currencyCode="EUR" onSave={save} onClose={close} />);
  fireEvent.change(view.container.querySelector('#project-name')!, { target: { value: "  New  " } });
  fireEvent.change(view.container.querySelector('input[inputmode=decimal]')!, { target: { value: "-1,25" } });
  fireEvent.click(screen.getByRole("button", { name: t("projectInformation.currency") }));
  fireEvent.click(screen.getByRole("option", { name: "GBP" }));
  const submit = screen.getByRole("button", { name: t("save") }); fireEvent.click(submit);
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledWith({ projectName: "New", pileHeadLevelM: -1.25, currencyCode: "GBP" });
  expect(close).not.toHaveBeenCalled();
  save.mockResolvedValue(true); await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(submit); await waitFor(() => expect(close).toHaveBeenCalledOnce());
});
test("project information cannot save empty names or invalid reference levels", () => {
  const save = vi.fn(); const view = render(<ProjectInformationDialog open projectName="" pileHeadLevelM={0}
    currencyCode="EUR" onSave={save} onClose={vi.fn()} />);
  const submit = screen.getByRole("button", { name: t("save") });
  fireEvent.click(submit); expect(save).not.toHaveBeenCalled();
  fireEvent.change(view.container.querySelector('#project-name')!, { target: { value: "P" } });
  fireEvent.change(view.container.querySelector('input[inputmode=decimal]')!, { target: { value: "invalid" } });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
});
test("missing-CPT actions stop row assignment, select the CPT, and restore focus on Escape", () => {
  const row = vi.fn(), change = vi.fn(), open = vi.fn();
  const state = { selectedLoadPointIds: [1], selectedLoadPointId: 1, selectedCptId: null } as ProjectState;
  const props = { cptIds: [7], label: "Missing", state, onStateChange: change, onOpenChange: open };
  const view = render(<div onClick={row}><MissingCptPopover {...props} open={false} /></div>);
  fireEvent.click(screen.getByRole("button", { name: "Missing" })); expect(open).toHaveBeenCalledWith(true); expect(row).not.toHaveBeenCalled();
  view.rerender(<div onClick={row}><MissingCptPopover {...props} open /></div>);
  fireEvent.click(screen.getByRole("button", { name: "7" }));
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ selectedCptId: 7, selectedLoadPointIds: [1], rightPanelMode: "cpts" }));
  expect(row).not.toHaveBeenCalled(); fireEvent.keyDown(document, { key: "Escape" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Missing" }));
  expect(open).toHaveBeenLastCalledWith(false);
});
test("viewer notices expose polite status and assertive errors at runtime", () => {
  const view = render(<ActionNotice message="Saved" noticeId={1} />);
  expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  view.rerender(<ActionNotice message="Blocked" noticeId={2} tone="error" />);
  expect(screen.getByRole("alert").getAttribute("aria-live")).toBe("assertive");
  expect(screen.queryByRole("status")).toBeNull();
});

test("used cost rows cannot be deleted while unused rows send a removal action", async () => {
  const p = costProps(); const capacity = { ...projectFixture().bearingCapacities[0], pile_size_mm: 290 };
  const view = render(<CostCatalogEditor {...p} bearingCapacities={[capacity]} />);
  const remove = view.container.querySelector('.cost-remove-button') as HTMLButtonElement;
  expect(remove.disabled).toBe(true); fireEvent.click(remove); expect(p.onEditCosts).not.toHaveBeenCalled();
  view.rerender(<CostCatalogEditor {...p} />);
  fireEvent.click(view.container.querySelector('.cost-remove-button')!);
  await waitFor(() => expect(p.onEditCosts).toHaveBeenCalledWith([{ action: "remove", pile_size_mm: 290 }]));
});

test("grouping settings toggle immutably, commit distance on blur, and close through their callback", () => {
  const state = projectFixture(), change = vi.fn(), close = vi.fn();
  state.loadPointGroupingSettings = { ...state.loadPointGroupingSettings, automatic: false };
  const p = { state, loadPointGroups: [], groupEditPending: false, onPreviewLoadPointGroupEdit: vi.fn(),
    onApplyLoadPointGroupEdit: vi.fn(), onStateChange: change, onClose: close };
  const view = render(<GroupingSettingsPanel {...p} />);
  const distance = screen.getByRole("spinbutton", { name: t("groupingSettings.maxDistance", "rightPanel") });
  expect((distance as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: t("groupingSettings.automatic", "rightPanel") }));
  const changed = change.mock.calls[0][0]; expect(changed).not.toBe(state);
  expect(changed.loadPointGroupingSettings.automatic).toBe(true); expect(state.loadPointGroupingSettings.automatic).toBe(false);
  view.rerender(<GroupingSettingsPanel {...p} state={changed} />);
  fireEvent.change(distance, { target: { value: "2.5" } }); fireEvent.blur(distance);
  expect(change.mock.calls[1][0].loadPointGroupingSettings.maxEdgeDistanceM).toBe(2.5);
  fireEvent.click(screen.getByRole("button", { name: t("actions.close", "rightPanel") })); expect(close).toHaveBeenCalledOnce();
});
