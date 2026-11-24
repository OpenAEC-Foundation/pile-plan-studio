import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Backstage from "./Backstage.tsx";
import i18n from "../../../i18n/config.ts";
import { useState } from "react";
import { normalizeUserSettings, patchUserSettings, DEFAULT_USER_SETTINGS } from "../../../domain/settings/userSettings.ts";
import { getProjectFileCommands } from "../../../domain/project/projectPersistence.ts";
vi.mock("../../../store", () => ({ getSetting: async (_key: string, fallback: unknown) => fallback, setSetting: vi.fn() }));
const t = (key: string, options: { quadrants?: string } = {}) => i18n.t(key, { ns: "backstage", ...options });
function props() {
  return { open: true, onClose: vi.fn(), onOpenSettings: vi.fn(), onNewProject: vi.fn(), onRefreshSources: vi.fn(), defaultCurrencyCode: "EUR",
    loadPoints: [], cpts: [], availablePileConfigurations: [], activePilePlanName: "Plan", activePilePlanId: "active", onImportPilePlan: vi.fn(),
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

test("the CAD and PDF actions share the chosen drawing settings", async () => {
  const exportDrawing = vi.fn().mockResolvedValue(undefined);
  const openCadDrawing = vi.fn().mockResolvedValue(undefined);
  render(<Backstage {...props()} onExportCadDrawing={exportDrawing} onOpenCadDrawing={openCadDrawing} />);
  fireEvent.click(screen.getByRole("button", { name: t("exportMenu") }));
  const format = screen.getByRole("combobox", { name: t("exportPanel.cad.format") }) as HTMLSelectElement;
  expect([...format.options].map(option => option.value)).toEqual(["ifccad", "dwg", "dxf"]);
  expect(format.value).toBe("ifccad");
  fireEvent.change(format, { target: { value: "dxf" } });
  fireEvent.click(screen.getByText(t("exportPanel.cad.drawingSettings")));
  fireEvent.change(screen.getByRole("combobox", { name: t("exportPanel.cad.numbering") }), { target: { value: "location_number" } });
  const numberSize = screen.getByRole("combobox", { name: t("exportPanel.cad.numberSize") });
  expect(numberSize).toHaveProperty("value", "automatic");
  fireEvent.change(numberSize, { target: { value: "compact" } });
  const regions = screen.getByRole("combobox", { name: t("exportPanel.cad.regionDisplay") });
  expect(regions).toHaveProperty("value", "filled");
  fireEvent.change(regions, { target: { value: "outlines" } });
  fireEvent.change(screen.getByRole("combobox", { name: t("exportPanel.cad.symbols") }), { target: { value: "viewer" } });
  fireEvent.click(screen.getByRole("checkbox", { name: t("exportPanel.cad.includeCpts") }));
  const options = { numbering: "location_number", include_cpts: false, symbols: "viewer", number_size: "compact", region_display: "outlines" };
  const downloadCad = screen.getByRole("button", { name: t("exportPanel.cad.downloadCad") });
  fireEvent.click(downloadCad);
  await waitFor(() => expect(exportDrawing).toHaveBeenCalledWith("dxf", options, "active"));
  await waitFor(() => expect(downloadCad).toHaveProperty("disabled", false));
  fireEvent.click(screen.getByRole("button", { name: t("exportPanel.cad.downloadPdf") }));
  await waitFor(() => expect(exportDrawing).toHaveBeenNthCalledWith(2, "pdf", options, "active"));
  await waitFor(() => expect(downloadCad).toHaveProperty("disabled", false));
  fireEvent.click(screen.getByRole("button", { name: t("exportPanel.cad.open") }));
  await waitFor(() => expect(openCadDrawing).toHaveBeenCalledWith(options, "active"));
  expect(format.value).toBe("dxf");
  await waitFor(() => expect(downloadCad).toHaveProperty("disabled", false));
  fireEvent.change(screen.getByRole("combobox", { name: t("exportPanel.cad.numbering") }), { target: { value: "none" } });
  fireEvent.change(regions, { target: { value: "hidden" } });
  expect(numberSize).toHaveProperty("disabled", true);
  fireEvent.click(downloadCad);
  await waitFor(() => expect(exportDrawing).toHaveBeenLastCalledWith("dxf", { ...options, numbering: "none", region_display: "hidden" }, "active"));
});

test("the drawing starts on the active plan and can export another plan independently of the export table", async () => {
  const exportDrawing = vi.fn().mockResolvedValue(undefined);
  const openCadDrawing = vi.fn().mockResolvedValue(undefined);
  const changeTablePlan = vi.fn();
  render(<Backstage {...props()} activePilePlanId="active" exportPlanId="active" onExportPlanChange={changeTablePlan}
    exportPlans={[{id:"active",name:"Plan"},{id:"alternate",name:"Alternative"}]}
    onExportCadDrawing={exportDrawing} onOpenCadDrawing={openCadDrawing} />);
  fireEvent.click(screen.getByRole("button", { name: t("exportMenu") }));
  expect(screen.getByRole("heading", { name: i18n.t("exportTools.exportTitle") })).toBeTruthy();
  const drawingPlan = screen.getByRole("combobox", { name: t("exportPanel.cad.plan") });
  const tablePlan = screen.getByRole("combobox", { name: i18n.t("exportTools.exportPilePlan") });
  expect(drawingPlan).toHaveProperty("value", "active");
  fireEvent.change(drawingPlan, { target: { value: "alternate" } });
  expect(tablePlan).toHaveProperty("value", "active");
  expect(changeTablePlan).not.toHaveBeenCalled();
  const pdf = screen.getByRole("button", { name: t("exportPanel.cad.downloadPdf") });
  fireEvent.click(pdf);
  await waitFor(() => expect(exportDrawing).toHaveBeenCalledWith("pdf", expect.anything(), "alternate"));
  await waitFor(() => expect(pdf).toHaveProperty("disabled", false));
  fireEvent.click(screen.getByRole("button", { name: t("exportPanel.cad.open") }));
  await waitFor(() => expect(openCadDrawing).toHaveBeenCalledWith(expect.anything(), "alternate"));
});

test("quadrant symbols are swapped by size and saved only when applied", async () => {
  const exportDrawing = vi.fn().mockResolvedValue(undefined);
  render(<Backstage {...props()} onExportCadDrawing={exportDrawing} getCadPileTypes={() => [
    { size_mm: 290, shape: "square" }, { size_mm: 320, shape: "square" },
  ]} />);
  fireEvent.click(screen.getByRole("button", { name: t("exportMenu") }));
  fireEvent.click(screen.getByText(t("exportPanel.cad.drawingSettings")));
  const open = screen.getByRole("button", { name: t("exportPanel.cad.editQuadrants") });
  fireEvent.click(open);
  const dialog = () => within(screen.getByRole("dialog", { name: t("exportPanel.cad.quadrants.title") }));
  const chooseSecondPattern = () => fireEvent.click(dialog().getByRole("button", {
    name: t("exportPanel.cad.quadrants.filled", {
      quadrants: [t("exportPanel.cad.quadrants.topRight"), t("exportPanel.cad.quadrants.topLeft")].join(", "),
    }),
  }));
  chooseSecondPattern();
  fireEvent.click(dialog().getByRole("button", { name: i18n.t("cancel") }));
  expect(document.activeElement).toBe(open);
  fireEvent.click(open);
  expect(dialog().getByRole("button", { pressed: true, name: t("exportPanel.cad.quadrants.filled", {
    quadrants: t("exportPanel.cad.quadrants.topLeft"),
  }) })).toBeTruthy();
  chooseSecondPattern();
  fireEvent.click(dialog().getByRole("button", { name: t("exportPanel.cad.quadrants.apply") }));
  fireEvent.click(screen.getByRole("button", { name: t("exportPanel.cad.downloadPdf") }));
  await waitFor(() => expect(exportDrawing).toHaveBeenCalledWith("pdf", expect.objectContaining({ quadrant_symbols: [
    { size_mm: 290, shape: "square", quadrants: 3 },
    { size_mm: 320, shape: "square", quadrants: 2 },
  ] }), "active"));
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
