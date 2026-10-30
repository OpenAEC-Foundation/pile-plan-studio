import {StrictMode} from "react";
import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {test,expect,vi} from "vitest";
import PilePlanImportMatching from "./PilePlanImportMatching.tsx";
import {previewPilePlanImportCore} from "../../../core/pilePlanCoreClient.ts";
import {createPilePlanImportDraft} from "../../../domain/imports/pilePlanImportModel.ts";
import i18n from "../../../i18n/config.ts";
vi.mock("../../../core/pilePlanCoreClient.ts",()=>({previewPilePlanImportCore:vi.fn()}));
test("matching remains usable after a StrictMode lifecycle restart",async()=>{
 const file=new File(['ID,Pile Size,Pile Tip Level\n99,320,-18\n'],'plan.csv');Object.defineProperty(file,'arrayBuffer',{value:async()=>new ArrayBuffer(0)});
 const matching={links:[],added:[],removed:[],unmatched_old:[],unmatched_new:[2],proposals:[],complete:false};
 const result={requestedProfile:'automatic' as const,detectedProfile:'standard-table' as const,supportsCptSelections:false,canApply:false,summary:{sourceRows:1,matchedRows:0,skippedRows:1,coordinateFallbacks:0,conflicts:0},diagnostics:[],patch:{changes:[]},sourceLocations:[{id:2,row:2,source_id:99,x_mm:null,y_mm:null,pile_size_mm:320,tip_level_mm:-18000}],matching};
 vi.mocked(previewPilePlanImportCore).mockResolvedValue({...result,matching:{...matching,links:[{old_id:1,new_id:2,distance_mm:null}],unmatched_new:[],complete:true}});
 render(<StrictMode><PilePlanImportMatching draft={{...createPilePlanImportDraft<File>(),file}} result={result} loadPoints={[{id:1,name:'A',x_mm:0,y_mm:0,design_load_kn:1}]} cpts={[]} availablePileConfigurations={[]} onConfirm={()=>{}} onCancel={()=>{}}/></StrictMode>);
 fireEvent.change(screen.getByLabelText(i18n.t('pilePlanMatching.chooseProject',{id:99})),{target:{value:'1'}});
 await waitFor(()=>expect(previewPilePlanImportCore).toHaveBeenCalledOnce());
 await waitFor(()=>expect(screen.getByRole('button',{name:i18n.t('exportTools.confirm')}).hasAttribute('disabled')).toBe(false));
});
