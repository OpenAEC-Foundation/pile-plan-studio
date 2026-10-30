import {renderHook,waitFor} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {useTechnicalAssignment} from "./useTechnicalAssignment.ts";
import {buildTechnicalAssignmentSignature} from "./technicalAssignmentController.ts";
vi.mock("../../core/coreClient.ts",()=>({assessTechnicalAssignmentCore:vi.fn(async()=>({availability:"available",issues:[]}))}));
vi.mock("./technicalAssignmentController.ts",async importOriginal=>{
  const actual=await importOriginal<typeof import("./technicalAssignmentController.ts")>();
  return {...actual,buildTechnicalAssignmentSignature:vi.fn(actual.buildTechnicalAssignmentSignature)};
});
it("does not traverse all options again for a render with unchanged technical input",async()=>{
  const input={groups:[],optionsByLoadPoint:new Map()};
  const view=renderHook(({input})=>useTechnicalAssignment(input),{initialProps:{input}});
  await waitFor(()=>expect(view.result.current.status).toBe("ready"));
  const count=vi.mocked(buildTechnicalAssignmentSignature).mock.calls.length;
  view.rerender({input});
  expect(buildTechnicalAssignmentSignature).toHaveBeenCalledTimes(count);
  view.rerender({input:{...input,optionsByLoadPoint:new Map()}});
  expect(buildTechnicalAssignmentSignature).toHaveBeenCalledTimes(count+1);
});
