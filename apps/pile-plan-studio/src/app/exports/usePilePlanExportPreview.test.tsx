import {act,renderHook,waitFor} from "@testing-library/react";
import {test,expect,vi} from "vitest";
import {usePilePlanExportPreview} from "./usePilePlanExportPreview.ts";
import {DEFAULT_EXPORT_OPTIONS,DEFAULT_CHANGE_CODES,type ExportOptions,type PileTableInspection,type RevisionPreview} from "../../core/exportRevisionContract.ts";
const inspection:PileTableInspection={sheet_names:[],sheet_name:null,header_row:1,ambiguous_sheet:false,headers:["X","Y"],mapping:{columns:{x:0,y:1},coordinate_unit:"mm",tip_unit:"m"},table:{headers:["X","Y"],rows:[[0,0]]},source_columns:[{key:"change",field:"change_code",header:"Wijzigingscode",enabled:true}]};
const preview={source_columns:inspection.source_columns,numbering:{total_positions:0},matching:{complete:true}} as RevisionPreview;
vi.mock("../../core/exportRevisionCoreClient.ts",()=>({inspectPileTableCore:vi.fn(async()=>inspection),previewRevitRevisionCore:vi.fn(async()=>preview),previewPilePlanExportCore:vi.fn()}));
const input={loadPoints:[],selectedPiles:new Map(),selectedCpts:new Map(),pileShapes:new Map(),pileSizeFormat:"numeric" as const};
const file={name:"old.csv",arrayBuffer:async()=>new TextEncoder().encode("X,Y\n0,0").buffer} as File;

test("confirmed links survive column and code edits but source mapping changes require a new review",async()=>{
  const {result,rerender}=renderHook(({options}:{options:ExportOptions})=>usePilePlanExportPreview(input,options,"project","revision"),{initialProps:{options:DEFAULT_EXPORT_OPTIONS}});
  await act(()=>result.current.readOld(file));
  await waitFor(()=>expect(result.current.revision.result).toBeTruthy());
  act(()=>result.current.confirm({links:[],added:[],removed:[]},50));
  expect(result.current.tolerance).toBe(50);
  expect(result.current.reviewed).toBe(true);
  act(()=>result.current.setOutputColumns([{key:"id",field:"load_point_id",header:"Knoop",enabled:true}]));
  rerender({options:{...DEFAULT_EXPORT_OPTIONS,change_codes:{...DEFAULT_CHANGE_CODES,separator:" / "}}});
  expect(result.current.reviewed).toBe(true);
  await waitFor(()=>expect(result.current.revision.result).toBeTruthy());
  expect(result.current.request?.decisions).toEqual({links:[],added:[],removed:[]});
  act(()=>result.current.setOldMapping({...inspection.mapping,coordinate_unit:"m"}));
  expect(result.current.reviewed).toBe(false);expect(result.current.request?.decisions).toBeNull();
});

test("source columns remain editable when a saved code is temporarily invalid",async()=>{
  const client=await import("../../core/exportRevisionCoreClient.ts");
  vi.mocked(client.previewRevitRevisionCore).mockRejectedValueOnce("invalid_change_code");
  const {result}=renderHook(()=>usePilePlanExportPreview(input,{...DEFAULT_EXPORT_OPTIONS,change_codes:{...DEFAULT_CHANGE_CODES,moved:{enabled:true,text:""}}},"project","revision"));
  await act(()=>result.current.readOld(file));
  await waitFor(()=>expect(result.current.revision.error).toBe("invalid_change_code"));
  expect(result.current.outputColumns).toEqual(inspection.source_columns);
});

test("a wrong header row keeps the source controls available for correction",async()=>{
  const client=await import("../../core/exportRevisionCoreClient.ts");
  const {result}=renderHook(()=>usePilePlanExportPreview(input,DEFAULT_EXPORT_OPTIONS,"project","revision"));
  await act(()=>result.current.readOld(file));await waitFor(()=>expect(result.current.oldInspection.result).toBeTruthy());
  vi.mocked(client.inspectPileTableCore).mockRejectedValueOnce("revision_invalid_header_row");
  act(()=>result.current.changeSource("old",{header_row:1000}));
  await waitFor(()=>expect(result.current.oldInspection.error).toBe("revision_invalid_header_row"));
  expect(result.current.oldInspectionForEditor?.headers).toEqual(["X","Y"]);
  expect(result.current.request).toBeNull();
});

test("column changes keep the previous preview visible while the new table is pending",async()=>{
  const client=await import("../../core/exportRevisionCoreClient.ts");
  const table={table:{headers:["ID"],rows:[[7]]},annotations:[],tip_codes:[]};
  vi.mocked(client.previewPilePlanExportCore).mockResolvedValueOnce(table);
  const {result,rerender}=renderHook(({options}:{options:ExportOptions})=>usePilePlanExportPreview(input,options,"project","normal"),{initialProps:{options:DEFAULT_EXPORT_OPTIONS}});
  await waitFor(()=>expect(result.current.normal.result).toEqual(table));
  let resolve!:(value:typeof table)=>void;
  vi.mocked(client.previewPilePlanExportCore).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  rerender({options:{...DEFAULT_EXPORT_OPTIONS,columns:[{key:"id",field:"load_point_id",header:"Node",enabled:true}]}});
  expect(result.current.normal.pending).toBe(true);expect(result.current.normalDisplay?.table.headers).toEqual(["ID"]);
  await act(async()=>resolve({...table,table:{...table.table,headers:["Node"]}}));
  expect(result.current.normalDisplay?.table.headers).toEqual(["Node"]);
});

test("an unconfirmed change-table summary stays visible during column changes",async()=>{
  const client=await import("../../core/exportRevisionCoreClient.ts");
  const unconfirmed={...preview,table:null,matching:{...preview.matching,complete:false}};
  vi.mocked(client.previewRevitRevisionCore).mockResolvedValueOnce(unconfirmed);
  const {result}=renderHook(()=>usePilePlanExportPreview(input,DEFAULT_EXPORT_OPTIONS,"project","revision"));
  await act(()=>result.current.readOld(file));await waitFor(()=>expect(result.current.revision.result).toEqual(unconfirmed));
  let resolve!:(value:RevisionPreview)=>void;
  vi.mocked(client.previewRevitRevisionCore).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  act(()=>result.current.setOutputColumns([{key:"id",field:"load_point_id",header:"Node",enabled:true}]));
  expect(result.current.revision.pending).toBe(true);
  expect(result.current.revisionDisplay?.numbering).toEqual(unconfirmed.numbering);
  expect(result.current.hasRevisionTable).toBe(false);
  await act(async()=>resolve(unconfirmed));
});

test("changing proposal inclusion invalidates confirmed revision matching",async()=>{
 const {result,rerender}=renderHook(({options}:{options:ExportOptions})=>usePilePlanExportPreview(input,options,"project","revision"),{initialProps:{options:DEFAULT_EXPORT_OPTIONS}});
 await act(()=>result.current.readOld(file));await waitFor(()=>expect(result.current.revision.result).toBeTruthy());
 act(()=>result.current.confirm({links:[],added:[],removed:[]}));
 rerender({options:{...DEFAULT_EXPORT_OPTIONS,include_proposals:true}});
 expect(result.current.reviewed).toBe(false);
 expect(result.current.request?.decisions).toBeNull();
});
