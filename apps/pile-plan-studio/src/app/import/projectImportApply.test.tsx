import { act, render, screen } from "@testing-library/react";
import { useReducer, useState } from "react";
import { expect, test, vi } from "vitest";
import { applyProjectRefresh } from "./projectImportApply.ts";
import { createManagedProjectState, projectHistoryReducer } from "../../domain/project/history/projectHistoryReducer.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { projectFixture } from "../../test/projectFixture.ts";
import sample from "../../../../../sample_project/sample_project.ifcpp?raw";
import type { ImportSourceInput } from "../../core/coreImportContract.ts";
import type { ProjectDocumentOutcome } from "../../core/projectDocumentContract.ts";
import { SourceImportError } from "../../core/adviceImportContract.ts";

test("the session refresh operation commits all advice values and logs once, with undo and redo",async()=>{
  const before=projectFixture(),project=canonicalProjectForTest(sample);
  project.inputs.bearing_capacities=project.inputs.bearing_capacities.slice(0,2);
  project.import_log=[{source_file:"first.xlsx",warnings:[]},{source_file:"second.xlsx",warnings:[]}];
  let controls!: {refresh():Promise<unknown>;undo():void;redo():void};
  const install=vi.fn();
  function Harness(){
    const [state,dispatch]=useReducer(projectHistoryReducer,before,createManagedProjectState);
    const [dirty,setDirty]=useState(false);
    controls={refresh:()=>applyProjectRefresh({context:()=>"one",snapshot:async()=>canonicalProjectForTest(sample),
      refresh:async()=>({status:"valid",project,keys:projectTipLevelKeysForTest(project)}),
      install:result=>{install(result);dispatch({type:"commit",update:createInitialProjectState(result.project,{initializeDefaultPiles:false},result.keys)});setDirty(true);},
      changed:()=>new Error("changed")},[]),undo:()=>dispatch({type:"undo"}),redo:()=>dispatch({type:"redo"})};
    return <output>{JSON.stringify({count:state.present.bearingCapacities.length,logs:state.present.importLog.map(l=>l.source_file),undo:state.history.past.length,dirty})}</output>;
  }
  render(<Harness/>);
  await act(async()=>{await controls.refresh();});
  expect(install).toHaveBeenCalledOnce();
  expect(JSON.parse(screen.getByRole("status").textContent!)).toMatchObject({count:2,logs:["first.xlsx","second.xlsx"],undo:1,dirty:true});
  await act(async()=>controls.undo());
  expect(JSON.parse(screen.getByRole("status").textContent!)).toMatchObject({count:before.bearingCapacities.length,undo:0});
  await act(async()=>controls.redo());
  expect(JSON.parse(screen.getByRole("status").textContent!)).toMatchObject({count:2,logs:["first.xlsx","second.xlsx"],undo:1});
});

test("a conflict or a changed project cannot install a refresh candidate",async()=>{
  const project=canonicalProjectForTest(sample),install=vi.fn();let context="one";
  const valid:Extract<ProjectDocumentOutcome,{status:"valid"}>={status:"valid",project,keys:projectTipLevelKeysForTest(project)};
  const deps={context:()=>context,snapshot:async()=>project,install,changed:()=>new Error("changed"),refresh:async(_input:{currentProject:typeof project;sources:ImportSourceInput[]})=>valid};
  const conflict=new SourceImportError("conflict",[],[]);
  await expect(applyProjectRefresh({...deps,refresh:async()=>{throw conflict;}},[])).rejects.toBe(conflict);
  await expect(applyProjectRefresh({...deps,refresh:async()=>{context="two";return valid;}},[])).rejects.toThrow("changed");
  expect(install).not.toHaveBeenCalled();
});
