import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Backstage from "./Backstage";
import i18n from "../../../i18n/config";
import { getProjectFileCommands } from "../../../domain/project/projectPersistence.ts";

const t = (key:string, values:Record<string,unknown>={}) => i18n.t(key,{ns:"backstage",...values});
function props(){return {
  open:true,onClose:vi.fn(),onOpenSettings:vi.fn(),onNewProject:vi.fn(),onRefreshSources:vi.fn(),defaultCurrencyCode:"EUR",
  loadPoints:[],cpts:[],availablePileConfigurations:[],activePilePlanName:"Plan",onImportPilePlan:vi.fn(),
  onOpenProject:vi.fn(),
  onDownloadProject:vi.fn(),onExportPilePlanXlsx:vi.fn(),onExportPilePlanCsv:vi.fn(),
  onSaveProject:vi.fn(),onSaveProjectAs:vi.fn(),
  commands:getProjectFileCommands(false),
};}
function open(){fireEvent.click(screen.getByRole("button",{name:t("open")+"Ctrl+O"}));}

test("the New project file command opens the guided route", () => {
  const p = props();
  render(<Backstage {...p} />);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("startScreen.newProject") }));
  expect(p.onClose).toHaveBeenCalledOnce();
  expect(p.onNewProject).toHaveBeenCalledOnce();
  expect(p.onRefreshSources).not.toHaveBeenCalled();
});

test("file navigation exposes its current page and isolates activation from the drawing",()=>{
  const p=props(), drawingKey=vi.fn();
  render(<div onKeyDown={drawingKey}><Backstage {...p}/></div>);
  const nav=screen.getByRole("navigation",{name:t("file")});
  fireEvent.keyDown(within(nav).getByRole("button",{name:t("about")}),{key:" "});
  expect(drawingKey).not.toHaveBeenCalled();
  fireEvent.click(within(nav).getByRole("button",{name:t("about")}));
  expect(within(nav).getByRole("button",{name:t("about")}).getAttribute("aria-current")).toBe("page");
  expect(screen.getByText(t("aboutPanel.license"))).toBeTruthy();
});

test("source refresh and pile plan import use distinct file-menu icons", () => {
  render(<Backstage {...props()} />);
  const menu = within(screen.getByRole("navigation", { name: t("file") }));
  const icon = (name: string) => menu.getByRole("button", { name }).querySelector("use")?.getAttribute("href");
  expect(icon(t("import"))).toMatch(/#i24-ui\.refresh$/);
  expect(icon(t("importPilePlan"))).toMatch(/#i24-file\.import$/);
});

test("Open project closes File and invokes the picker command immediately", () => {
  const p = props();
  render(<Backstage {...p} />);
  open();
  expect(p.onClose).toHaveBeenCalledOnce();
  expect(p.onOpenProject).toHaveBeenCalledOnce();
  expect(screen.queryByRole("heading", { name: t("open") })).toBeNull();
});

test("the SuperCloud file command opens the Docs picker", () => {
  const p = props();
  render(<Backstage {...p} docsOpenPanel={<h2>Docs picker</h2>} />);
  open();
  expect(screen.getByRole("heading", { name: "Docs picker" })).toBeTruthy();
  expect(p.onOpenProject).not.toHaveBeenCalled();
});
