import {fireEvent,render,screen} from "@testing-library/react";
import {test,expect,vi} from "vitest";
import i18n from "../../../i18n/config";
import {DEFAULT_EXPORT_OPTIONS,type PileTableInspection} from "../../../core/exportRevisionContract";
import ExportColumnsEditor from "./ExportColumnsEditor";
import PileTableSourceEditor from "./PileTableSourceEditor";
const t=(key:string)=>i18n.t(key);

test("literal export help is associated with its field and an empty value stays empty",()=>{
 const change=vi.fn();
 const props={columns:[{key:"note",field:"literal" as const,header:"Note",value:"x",enabled:true}],onChange:change,
  options:DEFAULT_EXPORT_OPTIONS,onOptionsChange:()=>{}};
 const view=render(<ExportColumnsEditor {...props}/>);
 const field=screen.getByRole("textbox",{name:t("exportTools.fixedValue")});
 const description=field.getAttribute("aria-describedby");expect(description).toBeTruthy();
 expect(document.getElementById(description!)?.textContent).toBe(t("exportTools.fixedValueHelp"));
 fireEvent.change(field,{target:{value:""}});
 expect(change).toHaveBeenCalledExactlyOnceWith([{...props.columns[0],value:""}]);
 view.rerender(<ExportColumnsEditor {...props} disabled/>);
 for(const control of view.container.querySelectorAll(".export-column-details input,.export-column-details select"))expect(control.matches(":disabled")).toBe(true);
});

test("source size templates retain associated help and clear to null without changing mappings",()=>{
 const inspection:PileTableInspection={sheet_names:["Palen"],sheet_name:"Palen",header_row:1,ambiguous_sheet:false,
  headers:["Afmeting","X","Y"],mapping:{columns:{pile_size:0,x:1,y:2},coordinate_unit:"mm",tip_unit:"m",size_shape:"square",size_template:"{size}x{size}"},
  table:{headers:["Afmeting","X","Y"],rows:[["300x300",0,0]]},source_columns:[]};
 const mapping=vi.fn();
 const view=render(<PileTableSourceEditor source={{file_name:"bron.csv",format:"csv",bytes:[]}} inspection={inspection}
  mapping={inspection.mapping} onMapping={mapping} onSource={()=>{}}/>);
 (view.container.querySelectorAll("details")[1] as HTMLDetailsElement).open=true;
 const field=screen.getByRole("textbox",{name:t("exportTools.sourceSizeTemplate")});
 const description=field.getAttribute("aria-describedby");expect(description).toBeTruthy();
 expect(document.getElementById(description!)?.textContent).toBe(t("exportTools.sourceSizeTemplateHelp"));
 fireEvent.change(field,{target:{value:""}});
 expect(mapping).toHaveBeenCalledExactlyOnceWith({...inspection.mapping,size_template:null});
});
