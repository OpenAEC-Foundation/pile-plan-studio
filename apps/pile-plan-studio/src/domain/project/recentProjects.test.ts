import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {normalizeRecentFiles,withRecentFile} from "./recentProjects.ts";

describe("recent project metadata",()=>{
 it("rejects broken records, repairs IFCPP types and limits the list",()=>{
  const files=normalizeRecentFiles([null,{path:12},...Array.from({length:12},(_,i)=>({path:`C:/P/${i}.ifcpp`,name:`${i}.ifcpp`,timestamp:20-i,type:"unknown"}))]);
  assert.equal(files.length,10);assert.equal(files[0].type,"project");assert.equal(files[0].name,"0.ifcpp");
 });
 it("moves a Windows file to the front without duplicating it and preserves Unix case",()=>{
  const old=normalizeRecentFiles([{path:"C:\\P\\A.ifcpp",name:"A.ifcpp",timestamp:1,type:"project"},{path:"/p/A.ifcpp",name:"A.ifcpp",timestamp:1,type:"project"}]);
  const next=withRecentFile(old,{path:"c:/p/a.ifcpp",name:"a.ifcpp",timestamp:2,type:"project"});
  assert.equal(next.length,2);assert.equal(next[0].timestamp,2);assert.equal(old[0].timestamp,1);
  assert.equal(withRecentFile(next,{path:"/p/a.ifcpp",name:"a.ifcpp",timestamp:3,type:"project"}).length,3);
 });
});
