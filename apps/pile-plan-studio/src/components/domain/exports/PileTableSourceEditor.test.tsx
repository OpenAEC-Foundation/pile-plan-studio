import {fireEvent,render,screen,within} from "@testing-library/react";
import {expect,test,vi} from "vitest";
import i18n from "../../../i18n/config.ts";
import PileTableSourceEditor from "./PileTableSourceEditor.tsx";
import type {PileTableInspection} from "../../../core/exportRevisionContract.ts";

test("revision source values and mappings are visible alongside the file settings",()=>{
 const inspection:PileTableInspection={sheet_names:[],sheet_name:null,header_row:1,ambiguous_sheet:false,headers:["X","Y"],mapping:{columns:{x:0,y:1},coordinate_unit:"mm",tip_unit:"m"},table:{headers:["X","Y"],rows:[[0,0]]},source_columns:[]};
 render(<PileTableSourceEditor source={{file_name:"previous.csv",format:"csv",bytes:[]}} inspection={inspection} mapping={inspection.mapping} onMapping={()=>{}} onSource={()=>{}}/>);
 const table=screen.getByRole("table",{name:i18n.t("tableImport.preview")});
 expect(within(table).getAllByRole("cell",{name:"0"})).toHaveLength(2);
 expect(within(table).getByRole("button",{name:i18n.t("tableImport.selectColumn",{name:"X"})}).textContent).toContain("mm");
 expect(screen.getByLabelText(i18n.t("exportTools.headerRow"))).toBeTruthy();
});


test("revision column editor assigns the selected source column and replaces an existing assignment",()=>{
 const inspection:PileTableInspection={sheet_names:[],sheet_name:null,header_row:1,ambiguous_sheet:false,headers:["Mark","X","Other X","Y"],mapping:{columns:{mark:0,x:1,y:3},coordinate_unit:"mm",tip_unit:"m"},table:{headers:["Mark","X","Other X","Y"],rows:[[1,10,20,30]]},source_columns:[]};
 const onMapping=vi.fn();
 render(<PileTableSourceEditor source={{file_name:"previous.csv",format:"csv",bytes:[]}} inspection={inspection} mapping={inspection.mapping} onMapping={onMapping} onSource={()=>{}}/>);
 const header=screen.getByRole("button",{name:i18n.t("tableImport.selectColumn",{name:"Other X"})});
 fireEvent.click(header);
 const settings=screen.getByRole("dialog");
 const meaning=within(settings).getByLabelText(i18n.t("tableImport.meaning"));
 fireEvent.change(meaning,{target:{value:"x"}});
 expect(onMapping).toHaveBeenLastCalledWith({...inspection.mapping,columns:{mark:0,x:2,y:3}});
 expect(within(settings).getAllByRole('combobox',{name:i18n.t("tableImport.meaning")})).toHaveLength(1);
 fireEvent.keyDown(meaning,{key:"Escape"});
 expect(document.activeElement).toBe(header);
});


test("revision header row can be cleared and replaced without importing an empty row number",()=>{
 const inspection:PileTableInspection={sheet_names:[],sheet_name:null,header_row:2,ambiguous_sheet:false,headers:["X","Y"],mapping:{columns:{x:0,y:1},coordinate_unit:"mm",tip_unit:"m"},table:{headers:["X","Y"],rows:[[0,0]]},source_columns:[]};
 const onSource=vi.fn();
 const view=render(<PileTableSourceEditor source={{file_name:"old.csv",format:"csv",bytes:[]}} inspection={inspection} mapping={inspection.mapping} onMapping={()=>{}} onSource={onSource}/>);
 const input=within(view.container).getByLabelText(i18n.t("exportTools.headerRow")) as HTMLInputElement;
 fireEvent.change(input,{target:{value:""}});
 expect(input.value).toBe("");expect(onSource).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:"12"}});
 expect(onSource).toHaveBeenLastCalledWith({header_row:12});
});
