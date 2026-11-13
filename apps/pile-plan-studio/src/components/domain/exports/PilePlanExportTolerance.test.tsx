import {useState} from "react";
import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {expect,test,vi} from "vitest";
import PilePlanExportPanel from "./PilePlanExportPanel.tsx";
import {DEFAULT_CHANGE_CODES,DEFAULT_EXPORT_OPTIONS,type ExportOptions,type RevitRevisionInput} from "../../../core/exportRevisionContract.ts";
import i18n from "../../../i18n/config.ts";

const matching={links:[],added:[],removed:[],unmatched_old:[],unmatched_new:[],proposals:[],complete:true};
const inspection={sheet_names:[],sheet_name:null,header_row:1,ambiguous_sheet:false,headers:["X","Y"],mapping:{columns:{x:0,y:1},coordinate_unit:"mm",tip_unit:"m"},table:{headers:["X","Y"],rows:[]},source_columns:[{key:"change",field:"change_code",header:"Changes",enabled:true}]};
vi.mock("../../../core/exportRevisionCoreClient.ts",()=>({
 inspectPileTableCore:vi.fn(async()=>inspection),reconcileLocationsCore:vi.fn(async()=>matching),
 previewPilePlanExportCore:vi.fn(async()=>({table:{headers:[],rows:[]},annotations:[],tip_codes:[]})),
 previewRevitRevisionCore:vi.fn(async(request:RevitRevisionInput)=>({old_locations:[],new_locations:[],matching,numbering:{rule:DEFAULT_EXPORT_OPTIONS.mark.rule,total_positions:0,matching_positions:0,equally_matching_rules:0},first_new_mark:1,tip_codes:[],source_columns:inspection.source_columns,table:request.decisions?{headers:["Changes"],rows:[["M"]]}:null}))
}));
const input={loadPoints:[],selectedPiles:new Map(),selectedCpts:new Map(),pileShapes:new Map(),pileSizeFormat:"numeric" as const};
const t=(key:string)=>i18n.t(key);
function Harness(){
 const [options,setOptions]=useState<ExportOptions>({...DEFAULT_EXPORT_OPTIONS,change_codes:{...DEFAULT_CHANGE_CODES,movement_threshold_mm:40}});
 return <PilePlanExportPanel activePilePlanName="Plan" pileSizeFormat="numeric" exportPlan={input} exportContextKey="tolerance-test" exportOptions={options} onExportOptionsChange={setOptions} running={false} runExport={()=>{}} onExportPilePlanXlsx={async()=>{}} onExportPilePlanCsv={async()=>{}} onExportRevision={async()=>{}}/>;
}
async function open(){
 render(<Harness/>);
 fireEvent.click(screen.getByRole("button",{name:t("exportTools.revisionMode")}));
 const file=new File(["X,Y\n0,0"],"previous.csv");Object.defineProperty(file,"arrayBuffer",{value:async()=>new ArrayBuffer(0)});
 fireEvent.change(screen.getByLabelText(t("exportTools.oldSource")),{target:{files:[file]}});
 return screen.findByRole<HTMLInputElement>("spinbutton",{name:t("exportTools.matchTolerance")});
}

const matchingEntry = () => within(screen.getByRole("region",{name:t("locationMatchingEntry.title")}));
const reviewButton = (reviewed = false) => matchingEntry().getByRole<HTMLButtonElement>("button",{
 name:t(reviewed?"locationMatchingEntry.open":"exportTools.reviewAndConfirmLinks"),
});
const preview = () => screen.queryByRole("table",{name:t("exportTools.exportPreview")});

async function confirmMatching(reviewed = false){
 await waitFor(()=>expect(reviewButton(reviewed).disabled).toBe(false));
 fireEvent.click(reviewButton(reviewed));
 const confirm=screen.getByRole<HTMLButtonElement>("button",{name:t("exportTools.confirm")});
 await waitFor(()=>expect(confirm.disabled).toBe(false));
 fireEvent.click(confirm);
 await screen.findByRole("cell",{name:"M"});
}

function openChangeCode(){
 const column=screen.getByRole("button",{name:i18n.t("exportTools.selectColumn",{name:"Changes"})});
 if(column.getAttribute("aria-expanded")!=="true")fireEvent.click(column);
}

function movementThreshold(){
 openChangeCode();
 return screen.getByRole<HTMLInputElement>("spinbutton",{name:t("exportTools.movementThreshold")});
}

test("the revision preview and download wait for confirmation, including after a tolerance edit",async()=>{
 const tolerance=await open();
 expect(screen.getByText(t("exportTools.revisionPreviewBlocked"))).toBeTruthy();
 expect(screen.getByRole("heading",{name:t("exportTools.exportPreview")})).toBeTruthy();
 expect(preview()).toBeNull();
 expect(screen.queryByRole("button",{name:t("exportTools.revisionExport")})).toBeNull();
 expect(reviewButton().classList.contains("oa-button--primary")).toBe(true);
 await confirmMatching();
 expect(preview()).toBeTruthy();
 expect(screen.getByRole<HTMLButtonElement>("button",{name:t("exportTools.revisionExport")}).disabled).toBe(false);
 expect(movementThreshold().value).toBe("40");
 fireEvent.change(movementThreshold(),{target:{value:"5"}});
 expect(tolerance.value).toBe("99");
 fireEvent.change(tolerance,{target:{value:"25"}});
 expect(screen.getByText(t("exportTools.revisionPreviewBlocked"))).toBeTruthy();
 expect(preview()).toBeNull();
 expect(screen.getByRole("spinbutton",{name:t("exportTools.matchTolerance")})).toBe(tolerance);
 await confirmMatching();
 expect(movementThreshold().value).toBe("25");
});

test("editor tolerance changes synchronize only when confirmed; unchanged confirmations retain manual thresholds",async()=>{
 const tolerance=await open();
 await confirmMatching();
 fireEvent.click(reviewButton(true));
 let editor=document.querySelector(".location-matching-workspace")!;
 fireEvent.change(editor.querySelector('input[type="number"]')!,{target:{value:"60"}});
 fireEvent.click(screen.getByRole("button",{name:t("matchingEditor.applyTolerance")}));
 await waitFor(()=>expect(screen.getByRole("button",{name:t("exportTools.confirm")}).hasAttribute("disabled")).toBe(false));
 fireEvent.click(screen.getByRole("button",{name:t("exportTools.cancel")}));
 expect((tolerance as HTMLInputElement).value).toBe("99");expect(movementThreshold().value).toBe("40");
 fireEvent.click(reviewButton(true));
 editor=document.querySelector(".location-matching-workspace")!;
 fireEvent.change(editor.querySelector('input[type="number"]')!,{target:{value:"60"}});
 fireEvent.click(screen.getByRole("button",{name:t("matchingEditor.applyTolerance")}));
 await waitFor(()=>expect(screen.getByRole("button",{name:t("exportTools.confirm")}).hasAttribute("disabled")).toBe(false));
 fireEvent.click(screen.getByRole("button",{name:t("exportTools.confirm")}));
 await waitFor(()=>expect(movementThreshold().value).toBe("60"));expect((tolerance as HTMLInputElement).value).toBe("60");
 fireEvent.change(movementThreshold(),{target:{value:"7"}});
 await confirmMatching(true);
 expect(movementThreshold().value).toBe("7");
});
