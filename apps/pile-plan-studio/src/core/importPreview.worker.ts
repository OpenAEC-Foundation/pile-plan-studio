import init,{preview_import_file,preview_project_import_files,inspect_foundation_advice} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import type {ImportPreviewOperation} from "./importPreviewWorkerClient.ts";
let ready:Promise<unknown>|null=null;
self.onmessage=async(event:MessageEvent<{id:number;operation:ImportPreviewOperation;request:unknown}>)=>{
 const {id,operation,request}=event.data;
 try {
  ready??=init().catch(error=>{ready=null;throw error;});await ready;
  const result=operation==="source"?preview_import_file(request):operation==="project"?preview_project_import_files(request):inspect_foundation_advice(request);
  self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:error instanceof Error?error.message:error});}
};
