import {act,renderHook} from "@testing-library/react";
import {expect,test,vi} from "vitest";
import {useLoadPointRefreshReview} from "./useLoadPointRefreshReview.ts";

test("confirming editor tolerance and decisions retains a valid refresh selection on reopening",async()=>{
 const file=new File([],"loads.csv"),decisions={links:[{old_id:1,new_id:2}],added:[],removed:[]};
 const prepare=vi.fn().mockResolvedValue({old_locations:[],new_locations:[],matching:{...decisions,unmatched_old:[],unmatched_new:[],proposals:[],complete:true}});
 const {result}=renderHook(()=>useLoadPointRefreshReview("project:1",file,"standard",prepare));
 act(()=>result.current.confirm(decisions,50));
 expect(result.current.tolerance).toBe(50);
 expect(result.current.selection).toEqual({contextKey:"project:1",decisions});
 await act(async()=>result.current.prepare([]));
 expect(prepare).toHaveBeenCalledWith([],50,decisions);
 expect(result.current.preview).toBeTruthy();
 act(()=>result.current.setTolerance(75));
 expect(result.current.selection).toBeUndefined();
 expect(result.current.preview).toBeNull();
});
