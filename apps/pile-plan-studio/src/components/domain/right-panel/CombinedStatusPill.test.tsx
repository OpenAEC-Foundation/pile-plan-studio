import {fireEvent,render,screen} from "@testing-library/react";
import {expect,test,vi} from "vitest";
import i18n from "../../../i18n/config.ts";
import CombinedStatusPill from "./CombinedStatusPill.tsx";
test("other-direction status switches directly without assigning the row or opening a popover",()=>{
 const assign=vi.fn(),switchMode=vi.fn();
 const view=render(<div onClick={assign}><CombinedStatusPill status={{key:"tension_insufficient_capacity",className:"is-not-ok",switchTo:"tension"}} onSwitch={switchMode}/></div>);
 const button=screen.getByRole("button",{name:i18n.t("loadDirection.combined.tension_insufficient_capacity")});
 expect(button.getAttribute("title")).toBe(i18n.t("loadDirection.show_tension"));
 fireEvent.click(button);
 expect(assign).not.toHaveBeenCalled();expect(switchMode).toHaveBeenCalledExactlyOnceWith("tension");
 expect(view.container.querySelector("details")).toBeNull();
});
