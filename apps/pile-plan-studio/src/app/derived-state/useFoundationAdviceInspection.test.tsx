import {render,screen,waitFor,act} from "@testing-library/react";
import {test,expect,vi} from "vitest";
import {useFoundationAdviceInspection} from "./useFoundationAdviceInspection.ts";
import type {ProjectState} from "../../domain/project/projectState.ts";
const core=vi.hoisted(()=>({inspect:vi.fn()}));
vi.mock("../../core/foundationAdviceInspectionCoreClient.ts",()=>({inspectFoundationAdviceCore:core.inspect}));
test("advice inspection ignores late results and sends complete grouping context without project edits",async()=>{
 let finish!:(value:unknown)=>void;const old=new Promise(r=>{finish=r;});core.inspect.mockReturnValueOnce(old).mockResolvedValue([{pile_size_mm:350,pile_tip_level_m:-18,frd_kn:20,pile_count:4}]);
 const state={selectedCptId:1,selectedLoadPointIds:[10],selectedPileConfigurationsByLoadPoint:new Map([[10,{pile_size_mm:350,pile_tip_level_mm:-18000}]]),loadPoints:[{id:10},{id:11},{id:12},{id:13}],bearingCapacities:[],loadPointGroupingSettings:{automatic:true,maxEdgeDistanceMm:1200},pilePlans:[{id:"one",pileCapProposals:[]}],activePilePlanId:"one"} as unknown as ProjectState;
 function Harness({state}:{state:ProjectState}){const result=useFoundationAdviceInspection(state);return <span>{result.rows.map(r=>r.frd_kn).join(",")||"pending"}</span>;}
 const view=render(<Harness state={state}/>);await waitFor(()=>expect(core.inspect).toHaveBeenCalledTimes(1));
 view.rerender(<Harness state={{...state,selectedCptId:2}}/>);await screen.findByText("20");
 await act(async()=>finish([{frd_kn:99}]));expect(screen.queryByText("99")).toBeNull();
 expect(core.inspect.mock.calls[1][0].loadPoints).toBe(state.loadPoints);expect(core.inspect.mock.calls[1][0].selectedPiles.size).toBe(1);
 expect(state.selectedCptId).toBe(1);
});
