import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../i18n/config";
import ViewerFocusButton from "../domain/pile-plan-viewer/ViewerFocusButton";
import ActionNotice from "./ActionNotice";

test("Focus dispatches once without reaching drawing mouse, click or keyboard handlers",()=>{
  const focus=vi.fn(),drawingMouse=vi.fn(),drawingClick=vi.fn(),drawingKey=vi.fn();
  const view=render(<div onMouseDown={drawingMouse} onClick={drawingClick} onKeyDown={drawingKey}>
    <ViewerFocusButton disabled={false} onFocusSelection={focus}/></div>);
  const button=screen.getByRole("button",{name:i18n.t("viewer.focusSelection")});
  fireEvent.mouseDown(button);fireEvent.click(button);fireEvent.keyDown(button,{key:" "});
  expect(focus).toHaveBeenCalledOnce();
  for(const handler of [drawingMouse,drawingClick,drawingKey])expect(handler).not.toHaveBeenCalled();
  view.rerender(<ViewerFocusButton disabled onFocusSelection={focus}/>);
  fireEvent.click(screen.getByRole("button",{name:i18n.t("viewer.focusSelection")}));
  expect(focus).toHaveBeenCalledOnce();
});

test("shared notices distinguish info/errors and visibility remains owned by the parent",()=>{
  vi.useFakeTimers();
  try{
    const view=render(<ActionNotice message="Saved" noticeId={1}/>);
    const original=screen.getByRole("status");
    expect(original.querySelector("use")?.getAttribute("href")).toContain("#i16-status.info");
    view.rerender(<ActionNotice message="Saved" noticeId={2}/>);
    expect(original.isConnected).toBe(false);
    view.rerender(<ActionNotice message="Blocked" noticeId={3} tone="error"/>);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert").querySelector("use")?.getAttribute("href")).toContain("#i16-status.error");
    act(()=>vi.advanceTimersByTime(6000));
    expect(screen.getByRole("alert").textContent).toBe("Blocked");
    view.rerender(<ActionNotice message="" noticeId={3} tone="error"/>);
    expect(screen.queryByRole("alert")).toBeNull();
  }finally{vi.useRealTimers();}
});
