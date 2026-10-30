import {useState} from "react";
import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {test,expect,vi} from "vitest";
import PilePlanExportPanel from "./PilePlanExportPanel.tsx";
import {DEFAULT_EXPORT_OPTIONS,type ExportOptions} from "../../../core/exportRevisionContract.ts";
import type {PileSizeExportFormat} from "../../../core/projectTypes.ts";
import i18n from "../../../i18n/config.ts";
vi.mock("../../../core/exportRevisionCoreClient.ts",()=>({previewPilePlanExportCore:vi.fn(async()=>({table:{headers:["Load Point ID"],rows:[[7]]},annotations:[],tip_codes:[]})),previewRevitRevisionCore:vi.fn(),reconcileLocationsCore:vi.fn()}));
const input={loadPoints:[],selectedPiles:new Map(),selectedCpts:new Map(),pileShapes:new Map(),pileSizeFormat:"numeric" as const};
test("ordinary export forwards enabled rules and revision mode requires an old table",async()=>{
  const exportXlsx=vi.fn(async(_format:PileSizeExportFormat,_options?:ExportOptions)=>{});
  render(<PilePlanExportPanel activePilePlanName="Plan" pileSizeFormat="numeric" onPileSizeFormatChange={()=>{}} exportPlan={input} exportContextKey="one" exportOptions={{...DEFAULT_EXPORT_OPTIONS,mark:{...DEFAULT_EXPORT_OPTIONS.mark,enabled:true}}}
    running={false} runExport={run=>void run()} onExportPilePlanXlsx={exportXlsx} onExportPilePlanCsv={async()=>{}}/>);
  await waitFor(()=>expect((screen.getByRole("button",{name:i18n.t("exportPanel.exportExcel",{ns:"backstage"})}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportPanel.exportExcel",{ns:"backstage"})}));
  await waitFor(()=>expect(exportXlsx).toHaveBeenCalledOnce());
  expect(exportXlsx.mock.calls[0]?.[1]?.mark.enabled).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.revisionMode")}));
  expect(screen.getByLabelText(i18n.t("exportTools.oldSource"))).toBeTruthy();
  expect(screen.queryByRole("button",{name:i18n.t("exportTools.review")})).toBeNull();
  expect(screen.queryByRole("button",{name:i18n.t("exportTools.revisionExport")})).toBeNull();
});

test("a different export plan can be chosen without changing the active plan",async()=>{
  const exported=vi.fn();
  function Harness(){const [selected,setSelected]=useState("base");return <PilePlanExportPanel activePilePlanName="Base" pileSizeFormat="numeric" exportPlan={input} exportContextKey={selected}
    exportPlans={[{id:"base",name:"Base"},{id:"other",name:"Alternative"}]} exportPlanId={selected} onExportPlanChange={setSelected}
    running={false} runExport={run=>void run()} onExportPilePlanXlsx={async()=>{exported(selected);}} onExportPilePlanCsv={async()=>{}}/>;}
  render(<Harness/>);
  const select=screen.getByLabelText(i18n.t("exportTools.exportPilePlan"));
  expect((select as HTMLSelectElement).value).toBe("base");
  fireEvent.change(select,{target:{value:"other"}});
  await waitFor(()=>expect((screen.getByRole("button",{name:i18n.t("exportPanel.exportExcel",{ns:"backstage"})}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportPanel.exportExcel",{ns:"backstage"})}));
  await waitFor(()=>expect(exported).toHaveBeenCalledWith("other"));
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.revisionMode")}));
  expect((screen.getByLabelText(i18n.t("exportTools.exportPilePlan")) as HTMLSelectElement).value).toBe("other");
});

test("proposal toggle and code add their columns once with explanatory help",async()=>{
 render(<PilePlanExportPanel activePilePlanName="Plan" pileSizeFormat="numeric" exportPlan={{...input,hasProposals:true}} exportContextKey="proposal-test" running={false} runExport={run=>void run()} onExportPilePlanXlsx={async()=>{}} onExportPilePlanCsv={async()=>{}}/>);
 fireEvent.click(screen.getByRole("checkbox",{name:i18n.t("exportTools.includeProposals")}));
 fireEvent.click(screen.getAllByText(i18n.t("exportTools.columnSettings"))[0]);
 expect(screen.getByRole("button",{name:i18n.t("exportTools.selectColumn",{name:i18n.t("exportTools.headers.export_id")})})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.selectColumn",{name:i18n.t("exportTools.headers.export_id")})}));
 expect(screen.getByText(i18n.t("exportTools.exportIdHelp"))).toBeTruthy();
 fireEvent.change(screen.getByLabelText(i18n.t("exportTools.proposalCode")),{target:{value:"P"}});
 fireEvent.change(screen.getByLabelText(i18n.t("exportTools.proposalCode")),{target:{value:"PV"}});
 expect(screen.getAllByRole("button",{name:i18n.t("exportTools.selectColumn",{name:i18n.t("exportTools.headers.proposal_code")})})).toHaveLength(1);
 fireEvent.click(screen.getByRole("checkbox",{name:i18n.t("exportTools.includeProposals")}));
 expect(screen.queryByRole("button",{name:i18n.t("exportTools.selectColumn",{name:i18n.t("exportTools.headers.export_id")})})).toBeNull();
 expect(screen.queryByRole("button",{name:i18n.t("exportTools.selectColumn",{name:i18n.t("exportTools.headers.proposal_code")})})).toBeNull();
 expect(screen.queryByRole("option",{name:i18n.t("exportTools.fields.export_id")})).toBeNull();
 fireEvent.click(screen.getByRole("checkbox",{name:i18n.t("exportTools.includeProposals")}));
 expect(screen.getAllByRole("button",{name:i18n.t("exportTools.selectColumn",{name:i18n.t("exportTools.headers.proposal_code")})})).toHaveLength(1);
});
