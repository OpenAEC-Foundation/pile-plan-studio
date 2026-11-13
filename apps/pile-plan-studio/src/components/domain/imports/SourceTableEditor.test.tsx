import {render,screen,fireEvent,within} from "@testing-library/react";
import {useState} from "react";
import {test,expect,vi} from "vitest";
import i18n from "../../../i18n/config.ts";
import SourceTableEditor from "./SourceTableEditor.tsx";
import type {SourceTablePreview} from "../../../core/coreImportContract.ts";
const preview:SourceTablePreview={processed:false,sheets:[],row_count:2,settings:{has_headers:true,header_row:1,first_data_row:2,columns:[{column:1,field:"id"},{column:2,field:"ignore"}]},columns:[{column:1,header:"Nummer",numeric_count:2,nonempty_count:2},{column:2,header:"Leeg",numeric_count:0,nonempty_count:0}],rows:[{number:1,cells:["Nummer","Leeg"]},{number:2,cells:["1",""]}]};
test("meaning choices are enabled again when switching from an empty to a populated column",()=>{
 render(<SourceTableEditor variant="blueprint" preview={preview} role="load-points" onChange={()=>{}}/>);
 const choose=(name:string)=>fireEvent.click(screen.getByRole("button",{name:i18n.t("tableImport.selectColumn",{name}),hidden:true}));
 choose("Leeg");
 let field=screen.getByLabelText(i18n.t("tableImport.meaning")) as HTMLSelectElement;
 expect((field.querySelector('option[value="id"]') as HTMLOptionElement).disabled).toBe(true);
 choose("Nummer");
 field=screen.getByLabelText(i18n.t("tableImport.meaning")) as HTMLSelectElement;
 expect((field.querySelector('option[value="id"]') as HTMLOptionElement).disabled).toBe(false);
});
test("the source header moves to the table head and original data row numbers remain",()=>{
 const view=render(<SourceTableEditor preview={preview} role="load-points" onChange={()=>{}}/>);
 const rows=view.container.querySelectorAll("tbody tr");expect(rows).toHaveLength(1);
 expect(rows[0].querySelector("th")?.textContent).toBe("2");
 expect(rows[0].textContent).not.toContain("Nummer");
 view.rerender(<SourceTableEditor preview={preview} settings={{...preview.settings,has_headers:false,header_row:null,first_data_row:1}} role="load-points" onChange={()=>{}}/>);
 expect(view.container.querySelectorAll("tbody tr")).toHaveLength(2);
});
test("the sample and table settings stay visible while editing a column, and Escape returns focus",()=>{
 render(<SourceTableEditor preview={preview} role="load-points" onChange={()=>{}}/>);
 const table=screen.getByRole("table",{name:i18n.t("tableImport.preview")});
 const name=i18n.t("tableImport.selectColumn",{name:"Leeg"});
 const header=within(table).getByRole("button",{name});
 expect(within(table).getByRole("cell",{name:"1"})).toBeTruthy();
 expect(screen.getByRole("checkbox",{name:i18n.t("tableImport.hasHeaders")})).toBeTruthy();
 fireEvent.click(header);
 const editor=screen.getByRole("dialog",{name});
 const field=within(editor).getByLabelText(i18n.t("tableImport.meaning")) as HTMLSelectElement;
 expect(document.activeElement).toBe(field);
 expect(field.querySelector('option[value="tension"]')?.hasAttribute("disabled")).toBe(true);
 expect(screen.getByRole("table")).toBe(table);
 fireEvent.keyDown(field,{key:"Escape"});
 expect(screen.queryByRole("dialog")).toBeNull();
 expect(document.activeElement).toBe(header);
});

test("editing a mapping and its unit immediately updates the heading",()=>{
 function Editor(){
  const [settings,setSettings]=useState(preview.settings);
  return <SourceTableEditor preview={preview} settings={settings} role="cpts" onChange={setSettings}/>;
 }
 render(<Editor/>);
 const header=screen.getByRole("button",{name:i18n.t("tableImport.selectColumn",{name:"Nummer"})});
 fireEvent.click(header);
 fireEvent.change(screen.getByLabelText(i18n.t("tableImport.meaning")),{target:{value:"x"}});
 fireEvent.change(screen.getByLabelText(i18n.t("tableImport.unit")),{target:{value:"m"}});
 expect(header.textContent).toContain(`${i18n.t("tableImport.fields.x")} · m`);
 fireEvent.pointerDown(screen.getByRole("checkbox",{name:i18n.t("tableImport.hasHeaders")}));
 expect(screen.queryByRole("dialog")).toBeNull();
});
test("mapping and header settings are editable; processed RFEM has no column mapping",()=>{
 const change=vi.fn();const view=render(<SourceTableEditor preview={preview} role="load-points" onChange={change}/>);
 fireEvent.click(screen.getByLabelText(i18n.t("tableImport.hasHeaders")));
 expect(change.mock.calls[0][0]).toMatchObject({has_headers:false,header_row:null,first_data_row:1});
 view.rerender(<SourceTableEditor preview={{...preview,processed:true}} role="load-points" onChange={change}/>);
 expect(screen.queryByLabelText(i18n.t("tableImport.meaning"))).toBeNull();
});

test("pile-plan blank action columns can be mapped for explicit clearing while blank identifiers remain disabled",()=>{
 const change=vi.fn();render(<SourceTableEditor preview={preview} role="pile-plan" onChange={change}/>);
 fireEvent.click(screen.getByRole("button",{name:i18n.t("tableImport.selectColumn",{name:"Leeg"}),hidden:true}));
 const select=screen.getByLabelText(i18n.t("tableImport.meaning")) as HTMLSelectElement;
 expect(select.querySelector('option[value="selected-cpts"]')?.hasAttribute("disabled")).toBe(false);
 expect(select.querySelector('option[value="id"]')?.hasAttribute("disabled")).toBe(true);
 fireEvent.change(select,{target:{value:"selected-cpts"}});
 expect(change.mock.calls[0][0].columns).toContainEqual({column:2,field:"selected-cpts"});
});


test("import row numbers allow empty editing drafts without changing import settings",()=>{
 const change=vi.fn();render(<SourceTableEditor preview={preview} role="load-points" onChange={change}/>);
 for(const key of ["headerRow","dataRow"]){
  const input=screen.getByLabelText(i18n.t(`tableImport.${key}`)) as HTMLInputElement;
  fireEvent.change(input,{target:{value:""}});
  expect(input.value).toBe("");expect(change).not.toHaveBeenCalled();
  fireEvent.blur(input);expect(input.value).toBe(key==="headerRow"?"1":"2");
 }
 const header=screen.getByLabelText(i18n.t("tableImport.headerRow"));
 fireEvent.change(header,{target:{value:"12"}});
 expect(change).toHaveBeenLastCalledWith(expect.objectContaining({header_row:12,first_data_row:13,columns:null}));
});


test("foundation advice can apply to one cap count and a fixed worksheet size",()=>{
 const change=vi.fn();const view=render(<SourceTableEditor preview={preview} role="bearing-capacities" onChange={change}/>);
 fireEvent.change(screen.getByLabelText(i18n.t("tableImport.adviceApplicability")),{target:{value:"specific"}});
 expect(change).toHaveBeenLastCalledWith(expect.objectContaining({pile_count:1}));
 fireEvent.change(screen.getByLabelText(i18n.t("tableImport.sizeSource")),{target:{value:"fixed"}});
 expect(change).toHaveBeenLastCalledWith(expect.objectContaining({fixed_pile_size_mm:0}));
 view.rerender(<SourceTableEditor preview={preview} role="bearing-capacities" settings={{...preview.settings,pile_count:4,fixed_pile_size_mm:320}} onChange={change}/>);
 const count=screen.getByLabelText(i18n.t("tableImport.capPileCount")) as HTMLInputElement;
 fireEvent.change(count,{target:{value:""}});expect(count.value).toBe("");
 fireEvent.change(count,{target:{value:"2"}});expect(change).toHaveBeenLastCalledWith(expect.objectContaining({pile_count:2,fixed_pile_size_mm:320}));
});
