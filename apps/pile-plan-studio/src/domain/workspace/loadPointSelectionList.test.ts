import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LoadPoint } from "../../core/projectTypes.ts";
import { buildLoadPointSelectionBlocks, getLoadPointSelectionContext, resolveLoadPointSelectionContext } from "./loadPointSelectionList.ts";
import { setLoadPointSelection } from "./selectionState.ts";

const point = (id: number): LoadPoint => ({ id, name: `Load point ${id}`, x_mm: 0, y_mm: 0, design_load_kn: id * 10 });

describe("selected load point display blocks", () => {
  it("shares inspection context but discards it for a new selection or load-point source", () => {
    const loadPoints = [1, 2, 3].map(point);
    const context = { loadPoints, ids: [1, 2] };
    const state = { loadPoints, selectedLoadPointIds: [1], selectedLoadPointId: 1,
      selectedCptId: null, rightPanelMode: "load-point" as const, loadPointSelectionContext: context };
    assert.deepEqual(getLoadPointSelectionContext(state, []), [1, 2]);
    const newSelection = { ...state, ...setLoadPointSelection(state, [2]) };
    assert.deepEqual(getLoadPointSelectionContext(newSelection, []), [2]);
    assert.deepEqual(getLoadPointSelectionContext({ ...state, loadPoints: [...loadPoints] }, []), [1]);
    assert.deepEqual(getLoadPointSelectionContext({ ...state, selectedLoadPointIds: [] }, []), []);
  });
  it("retains the multiselection while inspecting members and navigates in displayed group order", () => {
    const points = [1, 4, 7, 2, 5, 3, 8].map(point);
    const groups = [{ load_point_ids: [3, 1, 2] }, { load_point_ids: [5, 4] }];
    const context = resolveLoadPointSelectionContext(points, [1, 4, 7], groups, []);
    assert.deepEqual(context, [1, 2, 3, 4, 5, 7]);
    assert.deepEqual(resolveLoadPointSelectionContext(points, [3], groups, context), context);
    assert.deepEqual(resolveLoadPointSelectionContext(points, [4, 5], groups, context), context);
    assert.deepEqual(resolveLoadPointSelectionContext(points, [8], groups, context), [8]);
    assert.deepEqual(resolveLoadPointSelectionContext(points, [], groups, context), []);
    assert.deepEqual(resolveLoadPointSelectionContext(points.filter(p => p.id !== 3), [1], groups, context), [1, 2, 4, 5, 7]);
  });
  it("keeps interleaved core groups together without omitting loose points or mutating inputs", () => {
    const points = [1, 4, 7, 2, 5, 3, 8].map(point);
    const groups = [{ load_point_ids: [3, 1, 2] }, { load_point_ids: [5, 4] }, { load_point_ids: [7] }];
    const before = structuredClone({ points, groups });
    const blocks = buildLoadPointSelectionBlocks(points, points.map(({ id }) => id), groups);
    assert.deepEqual(blocks.map(block => block.loadPoints.map(({ id }) => id)), [[1, 2, 3], [4, 5], [7], [8]]);
    assert.deepEqual(blocks.map(block => block.groupLoadPointIds), [[3, 1, 2], [5, 4], null, null]);
    assert.equal(blocks[0].loadPoints[0], points[0]);
    assert.deepEqual({ points, groups }, before);
  });

  it("includes the entire core group as context without adding unrelated groups", () => {
    const blocks = buildLoadPointSelectionBlocks([1, 2, 3, 4, 5].map(point), [2], [
      { load_point_ids: [1, 2, 3] }, { load_point_ids: [4, 5] },
    ]);
    assert.deepEqual(blocks.map(block => ({ ids: block.loadPoints.map(({ id }) => id), group: block.groupLoadPointIds })),
      [{ ids: [1, 2, 3], group: [1, 2, 3] }]);
  });

  it("breaks identical-coordinate ties by ID and handles an empty selection", () => {
    assert.deepEqual(buildLoadPointSelectionBlocks([point(4), point(1)], [1, 4], []).map(block => block.loadPoints[0].id), [1, 4]);
    assert.deepEqual(buildLoadPointSelectionBlocks([], [], [{ load_point_ids: [1, 2] }]), []);
  });

  it("orders rows from top to bottom and members left to right while keeping groups together", () => {
    const at=(id:number,x_mm:number,y_mm:number)=>({...point(id),x_mm,y_mm});
    const points=[at(9,20,0),at(7,20,100),at(2,10,0),at(8,0,100),at(4,10,100),at(6,0,0)];
    const groups=[{load_point_ids:[7,8,2]}];
    const before=structuredClone({points,groups});
    const blocks=buildLoadPointSelectionBlocks(points,points.map(p=>p.id),groups);
    assert.deepEqual(blocks.map(b=>b.loadPoints.map(p=>p.id)),[[8,7,2],[4],[6],[9]]);
    const order=blocks.flatMap(b=>b.loadPoints.map(p=>p.id));
    assert.deepEqual(resolveLoadPointSelectionContext(points,[8],groups,order),order);
    assert.deepEqual({points,groups},before);
  });

  it("uses bounded one-millimetre rows like default export numbering, without chaining rows",()=>{
    const points=[{...point(1),x_mm:30,y_mm:100},{...point(2),x_mm:20,y_mm:99.5},
      {...point(3),x_mm:10,y_mm:99},{...point(4),x_mm:0,y_mm:98.5}];
    assert.deepEqual(buildLoadPointSelectionBlocks(points,[1,2,3,4],[]).map(b=>b.loadPoints[0].id),[3,2,1,4]);
  });

  it("matches the Rust export row order for staggered rows and coincident locations",async()=>{
    const {readFileSync}=await import("node:fs");
    const {initSync,reconcile_locations}=await import("../../core/wasm/pile-plan-wasm/pile_plan_wasm.js");
    initSync({module:readFileSync(new URL("../../core/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm",import.meta.url))});
    const points=[1,8,3,6,5,2,7,4].map(id=>({...point(id),x_mm:id%3*100,y_mm:Math.floor(id/3)*100+(id%3)*0.6}));
    points.push({...point(9),x_mm:points[0].x_mm,y_mm:points[0].y_mm});
    const core=reconcile_locations({old_locations:points,new_locations:[],tolerance_mm:1,decisions:null});
    assert.deepEqual(buildLoadPointSelectionBlocks(points,points.map(p=>p.id),[]).map(b=>b.loadPoints[0].id),core.old_order);
  });
});
