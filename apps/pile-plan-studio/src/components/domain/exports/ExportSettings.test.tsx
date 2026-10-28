import {fireEvent,render,screen} from "@testing-library/react";
import {test,expect} from "vitest";
import {useState} from "react";
import i18n from "../../../i18n/config.ts";
import ExportSettings from "./ExportSettings.tsx";
import {DEFAULT_EXPORT_OPTIONS,type ExportOptions} from "../../../core/exportRevisionContract.ts";

const t=(key:string)=>i18n.t(`exportTools.${key}`);
test("export controls enable numbering and independently change code sequence and direction",()=>{
  let result=DEFAULT_EXPORT_OPTIONS;
  function Harness(){const [value,set]=useState(DEFAULT_EXPORT_OPTIONS);return <ExportSettings options={value} onChange={next=>{result=next;set(next);}}/>;}
  render(<Harness/>);
  fireEvent.click(screen.getByText(t("numberingSettings")));
  fireEvent.click(screen.getByRole("checkbox",{name:t("markEnabled")}));
  fireEvent.change(screen.getByLabelText(t("firstMark")),{target:{value:"12"}});
  fireEvent.change(screen.getByLabelText(t("axis")),{target:{value:"x"}});
  fireEvent.click(screen.getByRole("checkbox",{name:t("codeEnabled")}));
  fireEvent.change(screen.getByLabelText(t("codeSequence")),{target:{value:"numbers"}});
  fireEvent.change(screen.getByLabelText(t("codeDirection")),{target:{value:"ascending"}});
  expect(result.mark.start).toBe(12);expect(result.mark.rule.axis).toBe("x");
  expect(result.tip_code).toEqual({enabled:true,sequence:"numbers",direction:"ascending"});
  expect(DEFAULT_EXPORT_OPTIONS.mark.enabled).toBe(false);
});
test("revision settings preserve existing marks and show the next available number",()=>{
  render(<ExportSettings options={DEFAULT_EXPORT_OPTIONS} onChange={(_value:ExportOptions)=>{}} revision firstNewMark={263}/>);
  fireEvent.click(screen.getByText(t("numberingSettings")));
  expect(screen.getByText(i18n.t("exportTools.retainedMarks",{number:263}))).toBeTruthy();
  expect(screen.queryByLabelText(t("firstMark"))).toBeNull();
  expect(screen.getByLabelText(t("codeSequence"))).toBeTruthy();
});

test("revision numbering offers retention or renumbering and a start for renumbering",()=>{
  let output=DEFAULT_EXPORT_OPTIONS;
  function Harness(){const [options,set]=useState(output);return <ExportSettings only="mark" revision options={options} onChange={next=>{output=next;set(next);}} firstNewMark={263}/>;}
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText(t("markRevisionMode")),{target:{value:"renumber"}});
  expect(screen.getByLabelText(t("firstMark"))).toBeTruthy();
  expect(output.mark.revision_mode).toBe("renumber");
});
