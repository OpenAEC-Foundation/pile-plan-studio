import {act,renderHook,waitFor} from "@testing-library/react";
import {beforeEach,expect,test,vi} from "vitest";
import {useGroupAssignmentAssessment} from "./useGroupAssignmentAssessment.ts";
import type {GroupAssignmentAssessmentInput,GroupAssignmentConflict} from "../../core/loadPointGroupContract.ts";

const core=vi.hoisted(()=>({assess:vi.fn()}));
vi.mock("../../core/coreClient.ts",()=>({assessLoadPointGroupAssignmentsCore:core.assess}));
const conflict:GroupAssignmentConflict={load_point_ids:[1,2],kind:"partial_assignment",assignment_repair_blocked:false,unassignment_repair_blocked:false,blocking_locked_load_point_ids:[]};
const input=(size:number):GroupAssignmentAssessmentInput=>({groups:[{load_point_ids:[1,2]}],assignments:new Map([[1,{pile_size_mm:size,pile_tip_level_mm:-18000}]]),lockedLoadPointIds:[]});
beforeEach(()=>core.assess.mockReset());

test("hides an old plan's conflicts while the displayed assignments are being assessed",async()=>{
 let complete!:(rows:GroupAssignmentConflict[])=>void;
 core.assess.mockResolvedValueOnce([conflict]).mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
 const view=renderHook(value=>useGroupAssignmentAssessment(value),{initialProps:input(290)});
 await waitFor(()=>expect(view.result.current.conflicts).toEqual([conflict]));
 view.rerender(input(320));
 expect(view.result.current.pending).toBe(true);
 expect(view.result.current.conflicts).toEqual([]);
 expect(view.result.current.conflictsByLoadPointId.size).toBe(0);
 await act(async()=>complete([]));
 expect(view.result.current.pending).toBe(false);
 expect(view.result.current.conflicts).toEqual([]);
});

test("an assessment failure cannot expose conflicts from the previous plan",async()=>{
 core.assess.mockResolvedValueOnce([conflict]).mockRejectedValueOnce(new Error("unavailable"));
 const view=renderHook((value:GroupAssignmentAssessmentInput|null)=>useGroupAssignmentAssessment(value),{initialProps:input(290) as GroupAssignmentAssessmentInput|null});
 await waitFor(()=>expect(view.result.current.conflicts).toEqual([conflict]));
 view.rerender(input(320));
 await waitFor(()=>expect(view.result.current.error?.message).toBe("unavailable"));
 expect(view.result.current.conflicts).toEqual([]);
 expect(view.result.current.pending).toBe(false);
 view.rerender(null);
 expect(view.result.current.conflicts).toEqual([]);
 expect(view.result.current.pending).toBe(false);
 expect(view.result.current.error).toBeNull();
});
