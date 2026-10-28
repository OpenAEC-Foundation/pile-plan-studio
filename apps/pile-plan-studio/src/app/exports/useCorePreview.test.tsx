import {act,render,screen,waitFor} from "@testing-library/react";
import {test,expect} from "vitest";
import {useCorePreview} from "./useCorePreview.ts";
test("late results from a replaced source never become the visible preview",async()=>{
  let resolveOld!:(value:string)=>void;
  const old=new Promise<string>(resolve=>{resolveOld=resolve;});
  function Harness({source}:{source:string}){const result=useCorePreview(source,()=>source==="old"?old:Promise.resolve("new result"));return <span>{result.result??"pending"}</span>;}
  const view=render(<Harness source="old"/>);
  view.rerender(<Harness source="new"/>);
  await waitFor(()=>expect(screen.getByText("new result")).toBeTruthy());
  await act(async()=>resolveOld("stale result"));
  expect(screen.queryByText("stale result")).toBeNull();
});
