import {test} from "node:test";
import assert from "node:assert/strict";
import {createImportPreviewClient} from "./importPreviewWorkerClient.ts";
test("one background worker retains request identity and structured validation errors",async()=>{
 const port={postMessage:(message:unknown)=>{messages.push(message);},terminate(){},onmessage:null as ((event:MessageEvent<any>)=>void)|null,onerror:null as ((event:ErrorEvent)=>void)|null};
 const messages:any[]=[];let created=0;const request=createImportPreviewClient(()=>{created++;return port;});
 const first=request("source",{source:1}),second=request("project",{sources:[2]});
 assert.equal(created,1);assert.deepEqual(messages.map(m=>m.operation),["source","project"]);
 port.onmessage!({data:{id:messages[1].id,result:{can_apply:true}}} as MessageEvent);
 assert.deepEqual(await second,{can_apply:true});
 const failure={diagnostics:[{code:"bad-cell"}]};port.onmessage!({data:{id:messages[0].id,error:failure}} as MessageEvent);
 await assert.rejects(first,error=>error===failure);
});
test("worker failure rejects pending work and a later request can retry",async()=>{
 const ports:any[]=[];const request=createImportPreviewClient(()=>{const port={postMessage(){},terminate(){port.terminated=true;},terminated:false,onmessage:null,onerror:null};ports.push(port);return port;});
 const failed=request("source",{});ports[0].onerror({message:"worker stopped",preventDefault(){}});await assert.rejects(failed,/worker stopped/);
 const next=request("source",{});assert.equal(ports.length,2);assert.equal(ports[0].terminated,true);
 ports[1].onmessage({data:{id:2,result:42}});assert.equal(await next,42);
});
