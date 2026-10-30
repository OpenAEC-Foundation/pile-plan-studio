import {render} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import LoadPointGroupOverlay from "./LoadPointGroupOverlay.tsx";
import {buildLoadPointGroupSvgModel} from "./loadPointGroupSvgModel.ts";
import {createLoadPointGroupGeometrySelector} from "../../../../viewer/loadPointGroupGeometry.ts";
vi.mock("./loadPointGroupSvgModel.ts",async importOriginal=>{
  const actual=await importOriginal<typeof import("./loadPointGroupSvgModel.ts")>();
  return {...actual,buildLoadPointGroupSvgModel:vi.fn(actual.buildLoadPointGroupSvgModel)};
});
it("reuses contour paths while changing selection, conflicts and visibility",()=>{
  const input={groups:[{load_point_ids:[1,2]}],topology:{load_point_ids:[1,2],edges:[{from_load_point_id:1,to_load_point_id:2}],faces:[]},
    pointsByLoadPointId:new Map([[1,{x:10,y:10}],[2,{x:30,y:10}]]),symbolScalePercent:100,
    selectedLoadPointIds:new Set<number>(),conflictingLoadPointIds:new Set<number>()};
  const select=createLoadPointGroupGeometrySelector();
  const view=render(<svg><LoadPointGroupOverlay geometry={select(input)}/></svg>);
  const count=vi.mocked(buildLoadPointGroupSvgModel).mock.calls.length;
  const path=view.container.querySelector('defs path');
  view.rerender(<svg><LoadPointGroupOverlay geometry={select({...input,selectedLoadPointIds:new Set([1,2])})}/></svg>);
  expect(buildLoadPointGroupSvgModel).toHaveBeenCalledTimes(count);
  expect(view.container.querySelector('defs path')).toBe(path);
  expect(view.container.querySelector('use')?.getAttribute('filter')).toContain('outline-selected');
  view.rerender(<svg><LoadPointGroupOverlay geometry={select({...input,conflictingLoadPointIds:new Set([1])})}/></svg>);
  expect(view.container.querySelector('use')?.getAttribute('filter')).toContain('outline-conflict');
  expect(view.container.querySelector('.load-point-group-warning')).not.toBeNull();
  view.rerender(<svg><LoadPointGroupOverlay geometry={select({...input,showDefaultGroups:false})}/></svg>);
  expect(view.container.querySelector('use')).toBeNull();
});
