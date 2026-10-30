import init,{inspect_foundation_advice} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import {initializeWasm,invokeDesktop,isTauriRuntime} from "./coreTransport.ts";
import {toWasmNumberKeyedMap,toStringKeyedRecord} from "./coreSerialization.ts";
import {groupingSettingsToCore} from "./loadPointGroupContract.ts";
import {requestImportPreview} from "./importPreviewWorkerClient.ts";
import type {LoadPoint,BearingCapacity,LoadPointGroupingSettings,PileConfigurationKey,CptBearingCapacityRow} from "./projectTypes.ts";
import type {PileCapProposal} from "./pileCapProposalTypes.ts";
export async function inspectFoundationAdviceCore(input:{loadPoints:LoadPoint[];groupingSettings:LoadPointGroupingSettings;bearingCapacities:BearingCapacity[];selectedPiles:Map<number,PileConfigurationKey>;cptId:number;proposals:PileCapProposal[]}):Promise<CptBearingCapacityRow[]>{
 const desktop=isTauriRuntime();
 const request={load_points:input.loadPoints,grouping_settings:groupingSettingsToCore(input.groupingSettings),bearing_capacities:input.bearingCapacities,selected_piles:desktop?toStringKeyedRecord(input.selectedPiles):toWasmNumberKeyedMap(input.selectedPiles),cpt_id:input.cptId,proposals:input.proposals};
 if(desktop)return invokeDesktop("inspect_foundation_advice",{request});
 if(typeof Worker!=="undefined")return requestImportPreview("inspect-advice",request);
 await initializeWasm(init);return inspect_foundation_advice(request) as CptBearingCapacityRow[];
}
