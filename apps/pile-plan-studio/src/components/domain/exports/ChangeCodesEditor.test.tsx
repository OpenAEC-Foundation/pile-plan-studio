import {render,screen,fireEvent} from "@testing-library/react";
import {useState} from "react";
import {test,expect} from "vitest";
import i18n from "../../../i18n/config.ts";
import {DEFAULT_CHANGE_CODES} from "../../../core/exportRevisionContract.ts";
import ChangeCodesEditor from "./ChangeCodesEditor.tsx";
test("change rules can be disabled, renamed and combined with a chosen separator",()=>{
  let output=DEFAULT_CHANGE_CODES;
  function Harness(){const [value,setValue]=useState(output);return <ChangeCodesEditor value={value} onChange={next=>{output=next;setValue(next);}}/>;}
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText(i18n.t("exportTools.changeCodeFor",{name:i18n.t("exportTools.changeKinds.moved")})),{target:{value:"V"}});
  fireEvent.click(screen.getByLabelText(i18n.t("exportTools.changeKinds.size")));
  fireEvent.change(screen.getByLabelText(i18n.t("exportTools.codeSeparator")),{target:{value:" / "}});
  expect(output.moved.text).toBe("V");expect(output.size.enabled).toBe(false);expect(output.separator).toBe(" / ");
});
