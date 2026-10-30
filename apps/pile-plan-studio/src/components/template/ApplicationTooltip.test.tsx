import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {expect,test} from "vitest";
import ApplicationTooltip from "./ApplicationTooltip.tsx";

test("repeated visible labels do not show application or native tooltips",()=>{
 const view=render(<><ApplicationTooltip/><button title="Reset">Reset</button><button data-tooltip="Location 449"><span>Location 449</span><strong>50 kN</strong></button></>);
 const reset=screen.getByRole("button",{name:"Reset"});
 fireEvent.mouseOver(reset);
 expect(screen.queryByRole("tooltip")).toBeNull();
 expect(reset.hasAttribute("title")).toBe(false);
 expect(reset.hasAttribute("aria-describedby")).toBe(false);
 fireEvent.mouseOut(reset);
 expect(reset.getAttribute("title")).toBe("Reset");
 fireEvent.mouseOver(view.container.querySelector('strong')!);
 expect(screen.queryByRole("tooltip")).toBeNull();
});

test("full clipped text remains useful even when its source text matches the title",()=>{
 render(<><ApplicationTooltip/><span title="A long filename.xlsx" style={{overflow:"hidden"}}>A long filename.xlsx</span></>);
 const label=screen.getByText("A long filename.xlsx");
 Object.defineProperty(label,"clientWidth",{value:80});Object.defineProperty(label,"scrollWidth",{value:200});
 fireEvent.mouseOver(label);
 expect(screen.getByRole("tooltip").textContent).toBe("A long filename.xlsx");
});

test("hovering the SVG inside an icon button shows its help",()=>{
 const view=render(<><ApplicationTooltip/><button title="Icon explanation"><svg><path d="M0 0h1"/></svg></button></>);
 fireEvent.mouseOver(view.container.querySelector('path')!);
 expect(screen.getByRole("tooltip").textContent).toBe("Icon explanation");
});

test("existing title help appears immediately and restores native attributes after leaving",()=>{
 render(<><ApplicationTooltip/><button title="Complete explanation" aria-describedby="existing">Action</button></>);
 const button=screen.getByRole("button",{name:"Action"});
 fireEvent.mouseOver(button);
 expect(screen.getByRole("tooltip").textContent).toBe("Complete explanation");
 expect(button.hasAttribute("title")).toBe(false);
 expect(button.getAttribute("aria-describedby")).toContain("existing");
 fireEvent.mouseOut(button);
 expect(screen.queryByRole("tooltip")).toBeNull();
 expect(button.getAttribute("title")).toBe("Complete explanation");
 expect(button.getAttribute("aria-describedby")).toBe("existing");
});

test("keyboard focus shows help for icon buttons and Escape dismisses it without losing its name",()=>{
 render(<><ApplicationTooltip/><button title="Undo action"/></>);
 const button=screen.getByRole("button",{name:"Undo action"});
 fireEvent.focus(button);
 expect(screen.getByRole("tooltip").textContent).toBe("Undo action");
 expect(screen.getByRole("button",{name:"Undo action"})).toBe(button);
 fireEvent.keyDown(document,{key:"Escape"});
 expect(screen.queryByRole("tooltip")).toBeNull();
 expect(button.getAttribute("title")).toBe("Undo action");
});

test("custom information help uses the same layer and disabled controls can expose their explanation",()=>{
 render(<><ApplicationTooltip/><span title="Unavailable because locked"><button disabled>Disabled</button></span><button data-tooltip="Tolerance explanation">Info</button></>);
 fireEvent.mouseOver(screen.getByRole("button",{name:"Disabled"}));
 expect(screen.getByRole("tooltip").textContent).toBe("Unavailable because locked");
 fireEvent.mouseOver(screen.getByRole("button",{name:"Info"}));
 expect(screen.getByRole("tooltip").textContent).toBe("Tolerance explanation");
 fireEvent.scroll(window);
 expect(screen.queryByRole("tooltip")).toBeNull();
});


test("pointer press and dragging immediately dismiss help and suppress it until release",()=>{
 render(<><ApplicationTooltip/><button title="Resize help">Resize</button></>);
 const button=screen.getByRole("button",{name:"Resize"});
 fireEvent.mouseOver(button);expect(screen.getByRole("tooltip")).toBeTruthy();
 fireEvent.pointerDown(button,{buttons:1});expect(screen.queryByRole("tooltip")).toBeNull();
 fireEvent.focus(button);fireEvent.mouseOver(button,{buttons:1});
 expect(screen.queryByRole("tooltip")).toBeNull();
 fireEvent.pointerUp(document);fireEvent.mouseOut(button);fireEvent.pointerMove(button,{buttons:0});fireEvent.mouseOver(button);
 expect(screen.getByRole("tooltip")).toBeTruthy();
 fireEvent.pointerMove(document,{buttons:1});expect(screen.queryByRole("tooltip")).toBeNull();
});

test("removing the hovered control or losing the window clears its tooltip",async()=>{
 const view=render(<><ApplicationTooltip/><button title="Context help">Context</button></>);
 fireEvent.mouseOver(screen.getByRole("button"));
 view.rerender(<ApplicationTooltip/>);
 await waitFor(()=>expect(screen.queryByRole("tooltip")).toBeNull());
 view.rerender(<><ApplicationTooltip/><button title="Context help">Context</button></>);
 fireEvent.mouseOver(screen.getByRole("button"));fireEvent.blur(window);
 expect(screen.queryByRole("tooltip")).toBeNull();
});


test("clicking a status cannot immediately replace its tooltip with help from the new content",()=>{
 const view=render(<><ApplicationTooltip/><button title="Switch force">Switch</button></>);
 const button=screen.getByRole("button");fireEvent.mouseOver(button);fireEvent.pointerDown(button);fireEvent.pointerUp(button);fireEvent.click(button);
 view.rerender(<><ApplicationTooltip/><span title="Insufficient capacity">Not OK</span></>);
 const replacement=screen.getByText("Not OK");fireEvent.mouseOver(replacement);
 expect(screen.queryByRole("tooltip")).toBeNull();
 fireEvent.pointerMove(replacement,{buttons:0});expect(screen.getByRole("tooltip")).toBeTruthy();
});
