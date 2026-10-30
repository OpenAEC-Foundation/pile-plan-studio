import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {test,expect,vi} from "vitest";
import {LoadDirectionProvider,useDisplayOptions,useLoadDirection} from "./LoadDirectionContext.tsx";
import type {PileConfigurationOption} from "../../core/projectTypes.ts";
vi.mock("../../store.ts",()=>({getSetting:async (_key:string,fallback:unknown)=>fallback,setSetting:vi.fn()}));
test("changing display direction preserves source options and shared assignment",async()=>{
 const source:PileConfigurationOption={configuration:{pile_size_mm:320,pile_tip_level_mm:-18000},pile_size_mm:320,pile_tip_level_m:-18,isOption:false,governing_cpt_id:1,governing_frd_kn:700,utilization:.8,missing_cpt_ids:[],technicalStatus:"insufficient_capacity",compression:{status:"valid",demand_kn:560,governing_cpt_id:1,governing_frd_kn:700,utilization:.8,missing_cpt_ids:[]},tension:{status:"insufficient_capacity",demand_kn:90,governing_cpt_id:2,governing_frd_kn:80,utilization:1.125,missing_cpt_ids:[]}};
 const options=new Map([[1,[source]]]);const before=JSON.stringify(source);
 function Harness(){const {mode,setMode}=useLoadDirection();const shown=useDisplayOptions(options).get(1)![0];return <><button onClick={()=>setMode("tension")}>Trek</button><output>{mode}:{shown.utilization}</output></>}
 render(<LoadDirectionProvider><Harness/></LoadDirectionProvider>);
 await waitFor(()=>expect(screen.getByText("compression:0.8")).toBeTruthy());
 fireEvent.click(screen.getByRole("button",{name:"Trek"}));expect(screen.getByText("tension:1.125")).toBeTruthy();expect(JSON.stringify(source)).toBe(before);expect(source.isOption).toBe(false);
});
