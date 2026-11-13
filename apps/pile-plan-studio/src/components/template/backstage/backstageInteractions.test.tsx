import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Backstage from "./Backstage.tsx";
import i18n from "../../../i18n/config.ts";
import { useState } from "react";
import { normalizeUserSettings, patchUserSettings, DEFAULT_USER_SETTINGS } from "../../../domain/settings/userSettings.ts";
import { getProjectFileCommands } from "../../../domain/project/projectPersistence.ts";
vi.mock("../../../store", () => ({ getSetting: async (_key: string, fallback: unknown) => fallback, setSetting: vi.fn() }));
const t = (key: string) => i18n.t(key, { ns: "backstage" });
function props() {
  return { open: true, onClose: vi.fn(), onOpenSettings: vi.fn(), onNewProject: vi.fn(), onRefreshSources: vi.fn(), defaultCurrencyCode: "EUR",
    loadPoints: [], cpts: [], availablePileConfigurations: [], activePilePlanName: "Plan", onImportPilePlan: vi.fn(),
    onOpenProject: vi.fn(), onDownloadProject: vi.fn(),
    onExportPilePlanXlsx: vi.fn(), onExportPilePlanCsv: vi.fn(),
    onSaveProject: vi.fn().mockResolvedValue(undefined), onSaveProjectAs: vi.fn().mockResolvedValue(undefined),
    commands: getProjectFileCommands(false) };
}

test("workspace review hides backstage without losing the current panel or handling Escape", () => {
  const p=props(), view=render(<Backstage {...p}/>);
  fireEvent.click(screen.getByRole("button",{name:t("exportMenu")}));
  fireEvent.change(screen.getByLabelText(i18n.t("exportTools.addColumn")),{target:{value:"mark"}});
  view.rerender(<Backstage {...p} suspended/>);
  expect(screen.queryByRole("button",{name:i18n.t("exportTools.selectColumn",{name:"Mark"})})).toBeNull();
  fireEvent.keyDown(window,{key:"Escape"});
  expect(p.onClose).not.toHaveBeenCalled();
  view.rerender(<Backstage {...p} suspended={false}/>);
  expect(screen.getByRole("button",{name:i18n.t("exportTools.selectColumn",{name:"Mark"})})).toBeTruthy();
});

test("the browser file menu offers one Save command and closes after saving", async () => {
  const p = props();
  render(<Backstage {...p} />);
  expect(screen.queryByRole("button", { name: t("saveAs") })).toBeNull();
  expect(screen.queryByRole("button", { name: new RegExp(t("exit")) })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: `${t("save")}Ctrl+S` }));
  await waitFor(() => expect(p.onClose).toHaveBeenCalledOnce()); expect(p.onSaveProject).toHaveBeenCalledOnce();
});

test("the desktop file menu offers Save as and Exit", () => {
  render(<Backstage {...props()} commands={getProjectFileCommands(true)} />);
  expect(screen.getByRole("button", { name: t("saveAs") })).toBeTruthy();
  expect(screen.getByRole("button", { name: new RegExp(t("exit")) })).toBeTruthy();
});

test("all exports are blocked during one pending export and failures restore the controls", async () => {
  let reject!: (error: Error) => void; const p = props();
  p.onExportPilePlanXlsx.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  const view = render(<Backstage {...p} />);
  fireEvent.click(screen.getByRole("button", { name: t("exportMenu") }));
  const actions = view.container.querySelectorAll('.export-actions button');
  fireEvent.click(screen.getByRole("button", {name:t("exportPanel.exportExcel")})); expect(p.onExportPilePlanXlsx).toHaveBeenCalledOnce();
  expect([...actions].every(button => (button as HTMLButtonElement).disabled)).toBe(true);
  fireEvent.click(screen.getByRole("button", {name:t("exportPanel.exportCsv")})); expect(p.onExportPilePlanCsv).not.toHaveBeenCalled();
  await act(async () => reject(new Error("Export failed")));
  expect(screen.getByRole("alert").textContent).toBe("Export failed");
  expect([...actions].every(button => !(button as HTMLButtonElement).disabled)).toBe(true);
});

const selectSize = () => {
  fireEvent.click(screen.getByRole("button", {name:i18n.t("exportTools.selectColumn",{name:"Pile Size [mm]"})}));
};
const notation = () => screen.getByRole("combobox",{name:i18n.t("exportTools.sizeNotation")}) as HTMLSelectElement;

test("Excel and CSV share the configured column notation", async () => {
  const p=props();p.onExportPilePlanXlsx.mockResolvedValue(undefined);p.onExportPilePlanCsv.mockResolvedValue(undefined);
  const view=render(<Backstage {...p}/>);
  fireEvent.click(screen.getByRole("button",{name:t("exportMenu")}));selectSize();
  expect(view.container.querySelectorAll(".bs-export-card")).toHaveLength(2);
  expect(notation().value).toBe("numeric");
  fireEvent.change(notation(),{target:{value:"dimensions"}});
  fireEvent.click(screen.getByRole("button",{name:t("exportPanel.exportExcel")}));
  await waitFor(()=>expect(p.onExportPilePlanXlsx).toHaveBeenCalledWith("numeric",expect.objectContaining({columns:expect.arrayContaining([expect.objectContaining({field:"pile_size",size_format:"dimensions"})])})));
  await waitFor(()=>expect(screen.getByRole("button",{name:i18n.t("exportTools.selectColumn",{name:"Pile Size [mm]"})}).matches(":disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:t("exportPanel.exportCsv")}));
  await waitFor(()=>expect(p.onExportPilePlanCsv.mock.calls[0]).toEqual(p.onExportPilePlanXlsx.mock.calls[0]));
});

test("column notation survives closing the menu and reloading user preferences",()=>{
  const p=props();let saved=DEFAULT_USER_SETTINGS;
  function Harness({open}:{open:boolean}){
    const [settings,setSettings]=useState(()=>normalizeUserSettings(JSON.parse(JSON.stringify(saved))));
    return <Backstage {...p} open={open} pileSizeFormat={settings.preferences.pileSizeExportFormat} exportOptions={settings.preferences.pilePlanExportOptions}
      onExportOptionsChange={options=>{saved=patchUserSettings(settings,{pilePlanExportOptions:options});setSettings(saved);}}/>;
  }
  const view=render(<Harness open/>);fireEvent.click(screen.getByRole("button",{name:t("exportMenu")}));selectSize();
  fireEvent.change(notation(),{target:{value:"dimensions"}});
  expect(saved.preferences.pilePlanExportOptions.columns?.find(c=>c.field==="pile_size")?.size_format).toBe("dimensions");
  view.rerender(<Harness open={false}/>);view.rerender(<Harness open/>);
  fireEvent.click(screen.getByRole("button",{name:t("exportMenu")}));selectSize();expect(notation().value).toBe("dimensions");
  view.unmount();render(<Harness open/>);fireEvent.click(screen.getByRole("button",{name:t("exportMenu")}));selectSize();expect(notation().value).toBe("dimensions");
});
