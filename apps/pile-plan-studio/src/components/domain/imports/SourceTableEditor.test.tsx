import {render,screen,fireEvent} from "@testing-library/react";
import {test,expect,vi} from "vitest";
import i18n from "../../../i18n/config.ts";
import SourceTableEditor from "./SourceTableEditor.tsx";
import type {SourceTablePreview} from "../../../core/coreImportContract.ts";
const preview:SourceTablePreview={processed:false,sheets:[],row_count:2,settings:{has_headers:true,header_row:1,first_data_row:2,columns:[{column:1,field:"id"},{column:2,field:"ignore"}]},columns:[{column:1,header:"Nummer",numeric_count:2,nonempty_count:2},{column:2,header:"Leeg",numeric_count:0,nonempty_count:0}],rows:[{number:1,cells:["Nummer","Leeg"]},{number:2,cells:["1",""]}]};
test("the source header moves to the table head and original data row numbers remain",()=>{
 const view=render(<SourceTableEditor preview={preview} role="load-points" onChange={()=>{}}/>);
 const rows=view.container.querySelectorAll("tbody tr");expect(rows).toHaveLength(1);
 expect(rows[0].querySelector("th")?.textContent).toBe("2");
 expect(rows[0].textContent).not.toContain("Nummer");
 view.rerender(<SourceTableEditor preview={preview} settings={{...preview.settings,has_headers:false,header_row:null,first_data_row:1}} role="load-points" onChange={()=>{}}/>);
 expect(view.container.querySelectorAll("tbody tr")).toHaveLength(2);
});
test("preview precedes settings, both collapsed, and preview column opens its settings",()=>{
 const view=render(<SourceTableEditor preview={preview} role="load-points" onChange={()=>{}}/>);
 const details=view.container.querySelectorAll("details");expect(details).toHaveLength(2);
 expect(details[0].open).toBe(false);expect(details[1].open).toBe(false);
 expect(details[0].querySelector("summary")?.textContent).toContain(i18n.t("tableImport.preview"));
 fireEvent.click(screen.getByRole("button",{name:i18n.t("tableImport.selectColumn",{name:"Leeg"}),hidden:true}));
 expect(details[1].open).toBe(true);
 const field=screen.getByLabelText(i18n.t("tableImport.meaning")) as HTMLSelectElement;
 expect(field.querySelector('option[value="tension"]')?.hasAttribute("disabled")).toBe(true);
});
test("mapping and header settings are editable; processed RFEM has no column mapping",()=>{
 const change=vi.fn();const view=render(<SourceTableEditor preview={preview} role="load-points" onChange={change}/>);
 const details=view.container.querySelectorAll("details");details[1].open=true;
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
 const change=vi.fn();const view=render(<SourceTableEditor preview={preview} role="load-points" onChange={change}/>);
 (view.container.querySelectorAll('details')[1] as HTMLDetailsElement).open=true;
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
 (view.container.querySelectorAll('details')[1] as HTMLDetailsElement).open=true;
 fireEvent.change(screen.getByLabelText(i18n.t("tableImport.adviceApplicability")),{target:{value:"specific"}});
 expect(change).toHaveBeenLastCalledWith(expect.objectContaining({pile_count:1}));
 fireEvent.change(screen.getByLabelText(i18n.t("tableImport.sizeSource")),{target:{value:"fixed"}});
 expect(change).toHaveBeenLastCalledWith(expect.objectContaining({fixed_pile_size_mm:0}));
 view.rerender(<SourceTableEditor preview={preview} role="bearing-capacities" settings={{...preview.settings,pile_count:4,fixed_pile_size_mm:320}} onChange={change}/>);
 const count=screen.getByLabelText(i18n.t("tableImport.capPileCount")) as HTMLInputElement;
 fireEvent.change(count,{target:{value:""}});expect(count.value).toBe("");
 fireEvent.change(count,{target:{value:"2"}});expect(change).toHaveBeenLastCalledWith(expect.objectContaining({pile_count:2,fixed_pile_size_mm:320}));
});
