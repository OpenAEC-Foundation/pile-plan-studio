import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Backstage from "./Backstage.tsx";
import i18n from "../../../i18n/config.ts";
import { useState } from "react";
import { normalizeUserSettings, patchUserSettings, DEFAULT_USER_SETTINGS } from "../../../domain/settings/userSettings.ts";
vi.mock("../../../store", () => ({ getSetting: async (_key: string, fallback: unknown) => fallback, setSetting: vi.fn() }));
const t = (key: string) => i18n.t(key, { ns: "backstage" });
function props() {
  return { open: true, onClose: vi.fn(), onOpenSettings: vi.fn(), onImportProject: vi.fn(), defaultCurrencyCode: "EUR",
    loadPoints: [], cpts: [], availablePileConfigurations: [], activePilePlanName: "Plan", onImportPilePlan: vi.fn(),
    onOpenProjectFile: vi.fn(), onOpenSampleProject: vi.fn(), onDownloadProject: vi.fn(),
    onExportPilePlanXlsx: vi.fn(), onExportPilePlanCsv: vi.fn(), onChooseDesktopProject: vi.fn(),
    onSaveProject: vi.fn().mockResolvedValue(undefined), onSaveProjectAs: vi.fn().mockResolvedValue(undefined),
    commands: { save: false, saveAs: false, download: true } };
}

test("save commands follow platform capabilities and close after the action finishes", async () => {
  const p = props(); const view = render(<Backstage {...p} />);
  expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
  view.rerender(<Backstage {...p} commands={{ save: true, saveAs: true, download: false }} />);
  fireEvent.click(screen.getByRole("button", { name: `${t("save")}Ctrl+S` }));
  await waitFor(() => expect(p.onClose).toHaveBeenCalledOnce()); expect(p.onSaveProject).toHaveBeenCalledOnce();
});

test("all exports are blocked during one pending export and failures restore the controls", async () => {
  let reject!: (error: Error) => void; const p = props();
  p.onExportPilePlanXlsx.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  const view = render(<Backstage {...p} />);
  fireEvent.click(screen.getByRole("button", { name: t("exportMenu") }));
  const actions = view.container.querySelectorAll('.bs-export-card button');
  fireEvent.click(actions[1]); expect(p.onExportPilePlanXlsx).toHaveBeenCalledOnce();
  expect([...actions].every(button => (button as HTMLButtonElement).disabled)).toBe(true);
  fireEvent.click(actions[2]); expect(p.onExportPilePlanCsv).not.toHaveBeenCalled();
  await act(async () => reject(new Error("Export failed")));
  expect(screen.getByRole("alert").textContent).toBe("Export failed");
  expect([...actions].every(button => !(button as HTMLButtonElement).disabled)).toBe(true);
});

test("Excel and CSV share one size notation setting and export block", async () => {
  const p = props();
  p.onExportPilePlanXlsx.mockResolvedValue(undefined);
  p.onExportPilePlanCsv.mockResolvedValue(undefined);
  function Harness() {
    const [format, setFormat] = useState(DEFAULT_USER_SETTINGS.preferences.pileSizeExportFormat);
    return <Backstage {...p} pileSizeFormat={format} onPileSizeFormatChange={setFormat} />;
  }
  const view = render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: t("exportMenu") }));
  const format = screen.getByRole("combobox", { name: t("exportPanel.pileSizeFormat") });
  expect(view.container.querySelectorAll(".bs-export-card")).toHaveLength(2);
  expect((format as HTMLSelectElement).value).toBe("numeric");
  const actions = view.container.querySelectorAll('.bs-export-card button');
  fireEvent.click(actions[1]);
  await waitFor(() => expect(p.onExportPilePlanXlsx).toHaveBeenLastCalledWith("numeric"));
  await waitFor(() => expect((format as HTMLSelectElement).disabled).toBe(false));
  fireEvent.change(format, { target: { value: "dimensions" } });
  fireEvent.click(actions[1]);
  await waitFor(() => expect(p.onExportPilePlanXlsx).toHaveBeenLastCalledWith("dimensions"));
  await waitFor(() => expect((format as HTMLSelectElement).disabled).toBe(false));
  fireEvent.click(actions[2]);
  await waitFor(() => expect(p.onExportPilePlanCsv).toHaveBeenCalledWith("dimensions"));
});

test("export notation survives closing the menu and remounting from saved user preferences", () => {
  const p = props();
  let saved = DEFAULT_USER_SETTINGS;
  function Harness({ open }: { open: boolean }) {
    const [settings, setSettings] = useState(() => normalizeUserSettings(JSON.parse(JSON.stringify(saved))));
    return <Backstage {...p} open={open} pileSizeFormat={settings.preferences.pileSizeExportFormat}
      onPileSizeFormatChange={format => {
        saved = patchUserSettings(settings, { pileSizeExportFormat: format });
        setSettings(saved);
      }} />;
  }
  const view = render(<Harness open />);
  fireEvent.click(screen.getByRole("button", { name: t("exportMenu") }));
  fireEvent.change(screen.getByRole("combobox", { name: t("exportPanel.pileSizeFormat") }), { target: { value: "dimensions" } });
  expect(saved.preferences.pileSizeExportFormat).toBe("dimensions");
  view.rerender(<Harness open={false} />);
  view.rerender(<Harness open />);
  fireEvent.click(screen.getByRole("button", { name: t("exportMenu") }));
  expect((screen.getByRole("combobox", { name: t("exportPanel.pileSizeFormat") }) as HTMLSelectElement).value).toBe("dimensions");
  view.unmount();
  render(<Harness open />);
  fireEvent.click(screen.getByRole("button", { name: t("exportMenu") }));
  expect((screen.getByRole("combobox", { name: t("exportPanel.pileSizeFormat") }) as HTMLSelectElement).value).toBe("dimensions");
});
