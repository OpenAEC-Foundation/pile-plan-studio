import {fireEvent,render,screen} from "@testing-library/react";
import {expect,test,vi} from "vitest";
import i18n from "../../../i18n/config.ts";
import {DEFAULT_EXPORT_OPTIONS,DEFAULT_CHANGE_CODES} from "../../../core/exportRevisionContract.ts";
import ChangeCodesEditor from "./ChangeCodesEditor.tsx";
import ExportSettings from "./ExportSettings.tsx";
import LocationMatchingEntry from "../location-matching/LocationMatchingEntry.tsx";

test("export numbering fields can be cleared without committing zero",()=>{
 const change=vi.fn();render(<ExportSettings options={{...DEFAULT_EXPORT_OPTIONS,mark:{...DEFAULT_EXPORT_OPTIONS.mark,enabled:true}}} onChange={change} only="mark"/>);
 for(const label of ["firstMark","rowTolerance"]){
  const input=screen.getByLabelText(i18n.t(`exportTools.${label}`)) as HTMLInputElement;
  fireEvent.change(input,{target:{value:""}});expect(input.value).toBe("");expect(change).not.toHaveBeenCalled();fireEvent.blur(input);expect(input.value).toBe("1");
 }
});

test("movement threshold and numeric matching tolerance can be cleared without changing the applied tolerance",()=>{
 const change=vi.fn();const view=render(<ChangeCodesEditor value={DEFAULT_CHANGE_CODES} onChange={change}/>);
 const input=screen.getByLabelText(i18n.t("exportTools.movementThreshold")) as HTMLInputElement;
 fireEvent.change(input,{target:{value:""}});expect(input.value).toBe("");expect(change).not.toHaveBeenCalled();fireEvent.blur(input);expect(input.value).toBe("99");
 view.rerender(<LocationMatchingEntry help="" tolerance={99} onToleranceChange={change} onOpen={()=>{}}/>);
 const tolerance=screen.getByLabelText(i18n.t("exportTools.matchTolerance")) as HTMLInputElement;
 fireEvent.change(tolerance,{target:{value:""}});expect(tolerance.value).toBe("");expect(change).not.toHaveBeenCalled();
 fireEvent.change(tolerance,{target:{value:"25"}});expect(change).toHaveBeenCalledExactlyOnceWith("25");
});
