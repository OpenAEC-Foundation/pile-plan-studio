import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Backstage from "./Backstage.tsx";
import i18n from "../../../i18n/config.ts";
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
