import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {createRecentProjectController} from "./recentProjectController.ts";
import type {RecentFile} from "../../domain/project/recentProjects.ts";
function setup(){
 let persisted:unknown=[];let writes=0;let failCache=false;const copies=new Map<string,string>();
 const controller=createRecentProjectController({readMetadata:async()=>persisted,writeMetadata:async files=>{persisted=structuredClone(files);writes++;},cache:{read:async key=>copies.get(key)??null,write:async(key,text)=>{if(failCache)throw Error("quota");copies.set(key,text);},remove:async key=>{copies.delete(key);}},now:()=>42});
 return {controller,copies,get persisted(){return persisted as RecentFile[];},get writes(){return writes;},fail(){failCache=true;}};
}
describe("recent project controller",()=>{
 it("serializes startup and concurrent remembers without losing entries",async()=>{
  let release!:(files:unknown)=>void;const initial=new Promise<unknown>(r=>release=r);const test=setup();
  const controller=createRecentProjectController({readMetadata:()=>initial,writeMetadata:async()=>{},cache:{read:async()=>null,write:async()=>{},remove:async()=>{}},now:()=>5});
  const first=controller.rememberDesktop("C:/a.ifcpp"),second=controller.rememberDesktop("C:/b.ifcpp");
  release([{path:"C:/old.ifcpp",name:"old.ifcpp",type:"project",timestamp:1}]);await Promise.all([first,second]);
  assert.deepEqual(controller.getSnapshot().map(f=>f.name),["b.ifcpp","a.ifcpp","old.ifcpp"]);assert.equal(test.writes,0);
 });
 it("persists and updates a browser copy under the same identity, then removes it",async()=>{
  const t=setup();await t.controller.rememberBrowser("browser:a","First.ifcpp","original");await t.controller.rememberBrowser("browser:a","Renamed.ifcpp","downloaded");
  assert.equal(t.controller.getSnapshot().length,1);assert.equal(t.persisted[0].name,"Renamed.ifcpp");assert.equal(t.persisted[0].storage,"browser");
  assert.equal(await t.controller.readBrowser("browser:a"),"downloaded");await t.controller.remove("browser:a");assert.equal(t.copies.size,0);assert.deepEqual(t.persisted,[]);
 });
 it("does not advertise a copy when saving it fails, and remains usable afterwards",async()=>{
  const t=setup();t.fail();await assert.rejects(t.controller.rememberBrowser("browser:a","a.ifcpp","text"),/quota/);assert.equal(t.controller.getSnapshot().length,0);
  await t.controller.rememberDesktop("C:/valid.ifcpp");assert.equal(t.persisted[0].name,"valid.ifcpp");
 });
 it("evicts old copies at ten records and clears retained copies",async()=>{
  const t=setup();for(let i=0;i<11;i++)await t.controller.rememberBrowser(`browser:${i}`,`${i}.ifcpp`,String(i));
  assert.equal(t.copies.size,10);assert.equal(t.copies.has("browser:0"),false);assert.equal(await t.controller.readBrowser("browser:missing"),null);
  await t.controller.clear();assert.equal(t.copies.size,0);assert.deepEqual(t.persisted,[]);
 });
});
