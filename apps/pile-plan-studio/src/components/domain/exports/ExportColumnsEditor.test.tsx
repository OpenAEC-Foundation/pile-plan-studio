import {fireEvent,render,screen} from "@testing-library/react";
import {test,expect,vi} from "vitest";
import {useState} from "react";
import i18n from "../../../i18n/config.ts";
import {DEFAULT_EXPORT_OPTIONS,type ExportColumn} from "../../../core/exportRevisionContract.ts";
import {defaultExportColumns} from "../../../domain/exports/exportColumns.ts";
import ExportColumnsEditor from "./ExportColumnsEditor.tsx";
test("users add, rename and move a column and choose its content format",()=>{
  let result:ExportColumn[]=[];
  function Harness(){const [columns,set]=useState(defaultExportColumns(DEFAULT_EXPORT_OPTIONS,"numeric"));return <ExportColumnsEditor columns={columns} onChange={next=>{set(next);result=next;}} options={DEFAULT_EXPORT_OPTIONS} onOptionsChange={()=>{}}/>;}
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText(i18n.t("exportTools.addColumn")),{target:{value:"mark"}});
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.selectColumn",{name:"Mark"})}));
  fireEvent.change(screen.getByLabelText(i18n.t("exportTools.columnCaption")),{target:{value:"Paalnr"}});
  fireEvent.keyDown(screen.getByRole("button",{name:i18n.t("exportTools.dragColumn",{name:"Paalnr"})}),{key:"ArrowUp"});
  expect(result.find(c=>c.field==="mark")).toMatchObject({enabled:true,header:"Paalnr"});
  expect(result.findIndex(c=>c.field==="mark")).toBe(6);
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.selectColumn",{name:"Pile Size [mm]"})}));
  fireEvent.change(screen.getByLabelText(i18n.t("exportTools.sizeNotation")),{target:{value:"dimensions"}});
  expect(result.find(c=>c.field==="pile_size")?.size_format).toBe("dimensions");
});

test("a column can be dragged directly to another position",()=>{
  let result:ExportColumn[]=[];
  function Harness(){const [columns,set]=useState(defaultExportColumns(DEFAULT_EXPORT_OPTIONS,"numeric"));return <ExportColumnsEditor columns={columns} onChange={next=>{set(next);result=next;}} options={DEFAULT_EXPORT_OPTIONS} onOptionsChange={()=>{}}/>;}
  const view=render(<Harness/>);
  const rows=view.container.querySelectorAll(".export-column-list li");
  rows.forEach((row,index)=>{row.getBoundingClientRect=()=>({left:0,right:350,top:index*45,bottom:(index+1)*45,width:350,height:45,x:0,y:index*45,toJSON:()=>({})});});
  const grip=screen.getByRole("button",{name:i18n.t("exportTools.dragColumn",{name:"Load Point ID"})});
  grip.setPointerCapture=vi.fn();grip.hasPointerCapture=()=>true;grip.releasePointerCapture=vi.fn();
  const pointer=(type:string,y:number)=>{const event=new MouseEvent(type,{bubbles:true,button:0,clientX:15,clientY:y});Object.defineProperties(event,{isPrimary:{value:true},pointerId:{value:1}});fireEvent(grip,event);};
  pointer("pointerdown",15);pointer("pointermove",110);pointer("pointerup",110);
  expect(result.map(c=>c.field).slice(0,3)).toEqual(["x","y","load_point_id"]);
});

test("removing an added column removes the entire list item",()=>{
  function Harness(){const [columns,set]=useState(defaultExportColumns(DEFAULT_EXPORT_OPTIONS,"numeric"));return <ExportColumnsEditor columns={columns} onChange={set} options={DEFAULT_EXPORT_OPTIONS} onOptionsChange={()=>{}}/>;}
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText(i18n.t("exportTools.addColumn")),{target:{value:"mark"}});
  fireEvent.click(screen.getByRole("button",{name:i18n.t("exportTools.removeNamedColumn",{name:"Mark"})}));
  expect(screen.queryByRole("button",{name:i18n.t("exportTools.selectColumn",{name:"Mark"})})).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
});


for(const revision of [false,true])test(`${revision?"change table":"pile-plan export"} only numbers a new caption when it already exists`,()=>{
  let result:ExportColumn[]=[];
  function Harness(){const [columns,set]=useState(defaultExportColumns(DEFAULT_EXPORT_OPTIONS,"numeric"));return <ExportColumnsEditor revision={revision} columns={columns} onChange={next=>{set(next);result=next;}} options={DEFAULT_EXPORT_OPTIONS} onOptionsChange={()=>{}}/>;}
  render(<Harness/>);
  const add=screen.getByLabelText(i18n.t("exportTools.addColumn"));
  fireEvent.change(add,{target:{value:"mark"}});
  expect(result[result.length-1]).toMatchObject({field:"mark",header:"Mark"});
  expect(result[result.length-1]?.header_number).toBeUndefined();
  fireEvent.change(add,{target:{value:"mark"}});
  expect(result[result.length-1]).toMatchObject({field:"mark",header:"Mark 1",header_number:1});
  expect(new Set(result.map(c=>c.header)).size).toBe(result.length);
});
