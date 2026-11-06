import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import Backstage from "./Backstage";
import i18n from "../../../i18n/config";

const history = vi.hoisted(() => ({
  recentFiles: [{path:"C:/Projecten/Voorbeeld.ifcpp",name:"Voorbeeld.ifcpp",type:"project",timestamp:Date.now()-120000}],
  removeRecentFile: vi.fn(), clearRecentFiles: vi.fn(),
}));
const t = (key:string, values:Record<string,unknown>={}) => i18n.t(key,{ns:"backstage",...values});
function props(){return {
  recentFiles:history.recentFiles as import("../../../hooks/useRecentFiles").RecentFile[],onRemoveRecentFile:history.removeRecentFile,onClearRecentFiles:history.clearRecentFiles,
  open:true,onClose:vi.fn(),onOpenSettings:vi.fn(),onImportProject:vi.fn(),defaultCurrencyCode:"EUR",
  loadPoints:[],cpts:[],availablePileConfigurations:[],activePilePlanName:"Plan",onImportPilePlan:vi.fn(),
  onOpenProjectFile:vi.fn().mockResolvedValue(undefined),onOpenSampleProject:vi.fn().mockResolvedValue(undefined),
  onDownloadProject:vi.fn(),onExportPilePlanXlsx:vi.fn(),onExportPilePlanCsv:vi.fn(),
  onChooseDesktopProject:vi.fn().mockResolvedValue(undefined),onSaveProject:vi.fn(),onSaveProjectAs:vi.fn(),onOpenFile:vi.fn(),
  commands:{save:false,saveAs:false,download:true},
};}
beforeEach(()=>{vi.clearAllMocks();});
function open(){fireEvent.click(screen.getByRole("button",{name:t("open")+"Ctrl+O"}));}

test("file navigation exposes its current page and isolates activation from the drawing",()=>{
  const p=props(), drawingKey=vi.fn();
  render(<div onKeyDown={drawingKey}><Backstage {...p}/></div>);
  const nav=screen.getByRole("navigation",{name:t("file")});
  open();
  expect(within(nav).getByRole("button",{name:t("open")+"Ctrl+O"}).getAttribute("aria-current")).toBe("page");
  fireEvent.keyDown(within(nav).getByRole("button",{name:t("about")}),{key:" "});
  expect(drawingKey).not.toHaveBeenCalled();
  fireEvent.click(within(nav).getByRole("button",{name:t("about")}));
  expect(within(nav).getByRole("button",{name:t("about")}).getAttribute("aria-current")).toBe("page");
  expect(screen.getByText(t("aboutPanel.license"))).toBeTruthy();
});

test("recent project removal and opening remain independent keyboard controls",()=>{
  const p=props();render(<Backstage {...p}/>);open();
  fireEvent.click(screen.getByRole("button",{name:t("openPanel.removeFile",{name:"Voorbeeld.ifcpp"})}));
  expect(history.removeRecentFile).toHaveBeenCalledExactlyOnceWith("C:/Projecten/Voorbeeld.ifcpp");
  expect(p.onOpenFile).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:t("openPanel.openRecent",{name:"Voorbeeld.ifcpp"})}));
  expect(p.onOpenFile).toHaveBeenCalledExactlyOnceWith("C:/Projecten/Voorbeeld.ifcpp");
  expect(p.onClose).toHaveBeenCalledOnce();
});

test("opening tiles preserve browser upload and native picker routes",async()=>{
  const p=props(),view=render(<Backstage {...p}/>);open();
  const input=screen.getByLabelText(t("openPanel.chooseProject")) as HTMLInputElement;
  const picker=vi.spyOn(input,"click").mockImplementation(()=>{});
  fireEvent.click(screen.getByRole("button",{name:new RegExp(t("openPanel.chooseProject"))}));
  expect(picker).toHaveBeenCalledOnce();expect(p.onChooseDesktopProject).not.toHaveBeenCalled();
  const file=new File(["{}"],"Project.ifcpp",{type:"application/json"});
  fireEvent.change(input,{target:{files:[file]}});
  await waitFor(()=>expect(p.onOpenProjectFile).toHaveBeenCalledExactlyOnceWith(file));
  view.rerender(<Backstage {...p} commands={{save:true,saveAs:true,download:false}}/>);
  fireEvent.click(screen.getByRole("button",{name:new RegExp(t("openPanel.chooseProject"))}));
  await waitFor(()=>expect(p.onChooseDesktopProject).toHaveBeenCalledOnce());
});


test("browser recent copies are labelled honestly and the list updates without remounting",()=>{
  const p=props(),path="browser:test-copy";
  const recentFiles=[{path,name:"Saved.ifcpp",type:"project" as const,timestamp:Date.now(),storage:"browser" as const}];
  const view=render(<Backstage {...p} recentFiles={recentFiles}/>);open();
  expect(screen.getByText(t("openPanel.localCopy"))).toBeTruthy();
  expect(screen.getByText(t("openPanel.localCopiesHelp"))).toBeTruthy();
  expect(screen.queryByText(path)).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:t("openPanel.openRecent",{name:"Saved.ifcpp"})}));
  expect(p.onOpenFile).toHaveBeenCalledExactlyOnceWith(path);
  view.rerender(<Backstage {...p} recentFiles={[]}/>);
  expect(screen.getByText(t("openPanel.noRecent"))).toBeTruthy();
});
