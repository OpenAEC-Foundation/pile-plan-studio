import {useState} from "react";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {expect,test,vi} from "vitest";
import PilePlanExportPanel from "./PilePlanExportPanel.tsx";
import {DEFAULT_CHANGE_CODES,DEFAULT_EXPORT_OPTIONS,type ExportOptions} from "../../../core/exportRevisionContract.ts";
import i18n from "../../../i18n/config.ts";

const matching={links:[],added:[],removed:[],unmatched_old:[],unmatched_new:[],proposals:[],complete:true};
const inspection={sheet_names:[],sheet_name:null,header_row:1,ambiguous_sheet:false,headers:["X","Y"],mapping:{columns:{x:0,y:1},coordinate_unit:"mm",tip_unit:"m"},table:{headers:["X","Y"],rows:[]},source_columns:[{key:"change",field:"change_code",header:"Changes",enabled:true}]};
vi.mock("../../../core/exportRevisionCoreClient.ts",()=>({
 inspectPileTableCore:vi.fn(async()=>inspection),reconcileLocationsCore:vi.fn(async()=>matching),
 previewPilePlanExportCore:vi.fn(async()=>({table:{headers:[],rows:[]},annotations:[],tip_codes:[]})),
 previewRevitRevisionCore:vi.fn(async()=>({old_locations:[],new_locations:[],matching,numbering:{rule:DEFAULT_EXPORT_OPTIONS.mark.rule,total_positions:0,matching_positions:0,equally_matching_rules:0},first_new_mark:1,tip_codes:[],source_columns:inspection.source_columns,table:{headers:["Changes"],rows:[]}}))
}));
const input={loadPoints:[],selectedPiles:new Map(),selectedCpts:new Map(),pileShapes:new Map(),pileSizeFormat:"numeric" as const};
const t=(key:string)=>i18n.t(key);
function Harness(){
 const [options,setOptions]=useState<ExportOptions>({...DEFAULT_EXPORT_OPTIONS,change_codes:{...DEFAULT_CHANGE_CODES,movement_threshold_mm:40}});
 return <PilePlanExportPanel activePilePlanName="Plan" pileSizeFormat="numeric" exportPlan={input} exportContextKey="tolerance-test" exportOptions={options} onExportOptionsChange={setOptions} running={false} runExport={()=>{}} onExportPilePlanXlsx={async()=>{}} onExportPilePlanCsv={async()=>{}}/>;
}
async function open(){
 const view=render(<Harness/>);
 fireEvent.click(screen.getByRole("button",{name:t("exportTools.revisionMode")}));
 const file=new File(["X,Y\n0,0"],"previous.csv");Object.defineProperty(file,"arrayBuffer",{value:async()=>new ArrayBuffer(0)});
 fireEvent.change(screen.getByLabelText(t("exportTools.oldSource")),{target:{files:[file]}});
 const tolerance=await screen.findByRole("spinbutton",{name:t("exportTools.matchTolerance")});
 fireEvent.click(view.container.querySelector('.export-columns-disclosure > summary')!);
 return {tolerance,threshold:screen.getByRole("spinbutton",{name:t("exportTools.movementThreshold")})};
}

test("matching tolerance updates the movement threshold, while a threshold edit leaves matching unchanged",async()=>{
 const {tolerance,threshold}=await open();
 expect((threshold as HTMLInputElement).value).toBe("40");
 fireEvent.change(tolerance,{target:{value:"25"}});
 await waitFor(()=>expect((threshold as HTMLInputElement).value).toBe("25"));
 expect(screen.getByRole("spinbutton",{name:t("exportTools.matchTolerance")})).toBe(tolerance);
 fireEvent.change(threshold,{target:{value:"5"}});
 expect((tolerance as HTMLInputElement).value).toBe("25");
 fireEvent.change(tolerance,{target:{value:"50"}});
 await waitFor(()=>expect((threshold as HTMLInputElement).value).toBe("50"));
});

test("editor tolerance changes synchronize only when confirmed; unchanged confirmations retain manual thresholds",async()=>{
 const {tolerance,threshold}=await open();
 fireEvent.click(screen.getByRole("button",{name:t("locationMatchingEntry.open")}));
 let editor=document.querySelector(".location-matching-workspace")!;
 fireEvent.change(editor.querySelector('input[type="number"]')!,{target:{value:"60"}});
 fireEvent.click(screen.getByRole("button",{name:t("matchingEditor.applyTolerance")}));
 await waitFor(()=>expect(screen.getByRole("button",{name:t("exportTools.confirm")}).hasAttribute("disabled")).toBe(false));
 fireEvent.click(screen.getByRole("button",{name:t("exportTools.cancel")}));
 expect((tolerance as HTMLInputElement).value).toBe("99");expect((threshold as HTMLInputElement).value).toBe("40");
 fireEvent.click(screen.getByRole("button",{name:t("locationMatchingEntry.open")}));
 editor=document.querySelector(".location-matching-workspace")!;
 fireEvent.change(editor.querySelector('input[type="number"]')!,{target:{value:"60"}});
 fireEvent.click(screen.getByRole("button",{name:t("matchingEditor.applyTolerance")}));
 await waitFor(()=>expect(screen.getByRole("button",{name:t("exportTools.confirm")}).hasAttribute("disabled")).toBe(false));
 fireEvent.click(screen.getByRole("button",{name:t("exportTools.confirm")}));
 await waitFor(()=>expect((threshold as HTMLInputElement).value).toBe("60"));expect((tolerance as HTMLInputElement).value).toBe("60");
 fireEvent.change(threshold,{target:{value:"7"}});
 await waitFor(()=>expect(screen.getByRole("button",{name:t("locationMatchingEntry.open")}).hasAttribute("disabled")).toBe(false));
 fireEvent.click(screen.getByRole("button",{name:t("locationMatchingEntry.open")}));
 fireEvent.click(screen.getByRole("button",{name:t("exportTools.confirm")}));
 expect((threshold as HTMLInputElement).value).toBe("7");
});
