export type ImportPreviewOperation = "source" | "project" | "inspect-advice";
type Reply = {id:number;result?:unknown;error?:unknown};
type WorkerPort = {postMessage(message:unknown):void;terminate():void;onmessage:((event:MessageEvent<Reply>)=>void)|null;onerror:((event:ErrorEvent)=>void)|null};

export function createImportPreviewClient(createWorker:()=>WorkerPort) {
 let worker:WorkerPort|null=null,serial=0;
 const pending=new Map<number,{resolve:(value:unknown)=>void;reject:(reason:unknown)=>void}>();
 return function request<T>(operation:ImportPreviewOperation,input:unknown):Promise<T>{
  return new Promise((resolve,reject)=>{
   if(!worker){
    try {worker=createWorker();} catch(error){reject(error);return;}
    worker.onmessage=event=>{const reply=event.data,task=pending.get(reply.id);if(!task)return;pending.delete(reply.id);if("error" in reply)task.reject(typeof reply.error==="string"?new Error(reply.error):reply.error);else task.resolve(reply.result);};
    worker.onerror=event=>{event.preventDefault?.();const error=new Error(event.message||"Import preview worker failed");worker?.terminate();worker=null;for(const task of pending.values())task.reject(error);pending.clear();};
   }
   const id=++serial;pending.set(id,{resolve:value=>resolve(value as T),reject});
   try {worker.postMessage({id,operation,request:input});}catch(error){pending.delete(id);reject(error);}
  });
 };
}

export const requestImportPreview = createImportPreviewClient(()=>new Worker(new URL("./importPreview.worker.ts",import.meta.url),{type:"module"}));
