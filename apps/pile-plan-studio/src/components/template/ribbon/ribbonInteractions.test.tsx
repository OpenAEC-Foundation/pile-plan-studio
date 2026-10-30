import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import Ribbon from "./Ribbon.tsx";

const t = (key: string, values:Record<string,unknown>={}) => i18n.t(key, { ns: "ribbon",...values });
function props() {
  return { isLassoSelectionActive: false, lassoSelectionDisabled: false, isLockEditing: false,
    symbolScalePercent: 100, viewerUtilizationMinimum: 0.5, viewerUtilizationMaximum: 0.9,
    foregroundLayer: "load-points" as const, showGrid: false, showTipLevelRegions: false, showLoadPointGroups: false,
    explorerVisible: true, propertiesVisible: false, onToggleLassoSelection: vi.fn(), onStartLockEditing: vi.fn(),
    onApplyLockEditing: vi.fn(), onCancelLockEditing: vi.fn(), onUnlockAll: vi.fn(),
    onSymbolScaleChangeStart: vi.fn(), onSymbolScaleChange: vi.fn(), onSymbolScaleChangeEnd: vi.fn(),
    onViewerUtilizationRangeChange: vi.fn(), onForegroundLayerChange: vi.fn(), onGridVisibilityChange: vi.fn(),
    onTipLevelRegionVisibilityChange: vi.fn(), onLoadPointGroupVisibilityChange: vi.fn(),
    onExplorerVisibilityChange: vi.fn(), onPropertiesVisibilityChange: vi.fn(), onOpenTaskPanel: vi.fn() };
}
function openView() { fireEvent.click(screen.getByRole("button", { name: t("tabs.view") })); }

test("view toggles send independent visibility changes", () => {
  const p = props(); render(<Ribbon {...p} />); openView();
  for (const [key, callback, value] of [
    ["view.showGrid", p.onGridVisibilityChange, true], ["view.showGroups", p.onLoadPointGroupVisibilityChange, true],
    ["view.hideExplorer", p.onExplorerVisibilityChange, false], ["view.showProperties", p.onPropertiesVisibilityChange, true],
  ] as const) {
    fireEvent.click(screen.getByRole("button", { name: t(key) })); expect(callback).toHaveBeenCalledWith(value);
  }
});

test("utilization changes stay local until pointer or keyboard completion and cannot cross handles", () => {
  const p = props(); render(<Ribbon {...p} />); openView();
  const minimum = screen.getByRole("slider", { name: t("view.minimumUtilization") });
  const maximum = screen.getByRole("slider", { name: t("view.maximumUtilization") });
  fireEvent.change(minimum, { target: { value: "60" } }); expect(p.onViewerUtilizationRangeChange).not.toHaveBeenCalled();
  fireEvent.pointerUp(minimum); expect(p.onViewerUtilizationRangeChange).toHaveBeenLastCalledWith(0.6, 0.9);
  fireEvent.change(maximum, { target: { value: "40" } }); fireEvent.keyUp(maximum, { key: "ArrowLeft" });
  expect(p.onViewerUtilizationRangeChange).toHaveBeenLastCalledWith(0.6, 0.6);
});

test("symbol scale gestures have one keyboard start and finish on key release, pointer cancel, or blur", () => {
  const p = props(); render(<Ribbon {...p} />); openView();
  const slider = screen.getAllByRole("slider")[0];
  fireEvent.keyDown(slider, { key: "ArrowRight" }); fireEvent.keyDown(slider, { key: "ArrowRight", repeat: true });
  fireEvent.change(slider, { target: { value: "120" } });
  expect(p.onSymbolScaleChangeStart).toHaveBeenCalledOnce(); expect(p.onSymbolScaleChange).not.toHaveBeenCalled();
  expect(slider).toHaveProperty("value","120");
  fireEvent.keyUp(slider, { key: "ArrowRight" }); expect(p.onSymbolScaleChangeEnd).toHaveBeenCalledOnce();
  expect(p.onSymbolScaleChange).toHaveBeenCalledExactlyOnceWith(120);
  fireEvent.pointerDown(slider); fireEvent.pointerCancel(slider); expect(p.onSymbolScaleChangeEnd).toHaveBeenCalledTimes(2);
  fireEvent.keyDown(slider, { key: "ArrowLeft" }); fireEvent.blur(slider); expect(p.onSymbolScaleChangeEnd).toHaveBeenCalledTimes(3);
});

test("overlapping range handles can separate in both directions, including 100–100 and 0–0",()=>{
  const p=props();
  const view=render(<Ribbon {...p} viewerUtilizationMinimum={1} viewerUtilizationMaximum={1}/>);
  openView();
  const track=view.container.querySelector('.ribbon-dual-range')!;
  vi.spyOn(track,"getBoundingClientRect").mockReturnValue({left:0,width:115,top:0,height:18,right:115,bottom:18,x:0,y:0,toJSON:()=>({})});
  fireEvent.pointerDown(track,{clientX:107.5,pointerId:1,button:0});
  fireEvent.pointerMove(track,{clientX:67.5,pointerId:1,buttons:1});
  fireEvent.pointerUp(track,{clientX:67.5,pointerId:1});
  expect(p.onViewerUtilizationRangeChange).toHaveBeenLastCalledWith(0.6,1);
  view.rerender(<Ribbon {...p} viewerUtilizationMinimum={0} viewerUtilizationMaximum={0}/>);
  fireEvent.pointerDown(track,{clientX:7.5,pointerId:2,button:0});
  fireEvent.pointerMove(track,{clientX:47.5,pointerId:2,buttons:1});
  fireEvent.pointerUp(track,{clientX:47.5,pointerId:2});
  expect(p.onViewerUtilizationRangeChange).toHaveBeenLastCalledWith(0,0.4);
  view.rerender(<Ribbon {...p} viewerUtilizationMinimum={0.66} viewerUtilizationMaximum={0.66}/>);
  fireEvent.pointerDown(track,{clientX:73.5,pointerId:3,button:0});
  fireEvent.pointerMove(track,{clientX:57.5,pointerId:3,buttons:1});
  fireEvent.pointerUp(track,{clientX:57.5,pointerId:3});
  expect(p.onViewerUtilizationRangeChange).toHaveBeenLastCalledWith(0.5,0.66);
});

test("symbol scale drag keeps the control responsive and commits only its final value",()=>{
  const p=props(); render(<Ribbon {...p}/>); openView();
  const slider=screen.getByRole("slider",{name:t("view.symbolSize")});
  fireEvent.pointerDown(slider);
  for(const value of [110,130,150])fireEvent.change(slider,{target:{value:String(value)}});
  expect(slider).toHaveProperty("value","150");
  expect(p.onSymbolScaleChange).not.toHaveBeenCalled();
  fireEvent.pointerUp(slider);
  expect(p.onSymbolScaleChange).toHaveBeenCalledExactlyOnceWith(150);
  fireEvent.blur(slider);
  expect(p.onSymbolScaleChange).toHaveBeenCalledTimes(1);
});

test("clicking the numeric symbol size supports empty drafts and commits one gesture",()=>{
  const p=props(); render(<Ribbon {...p}/>); openView();
  fireEvent.click(screen.getByRole("button",{name:t("view.editValue",{label:t("view.symbolSize")})}));
  const field=screen.getByRole("spinbutton",{name:t("view.symbolSize")});
  fireEvent.change(field,{target:{value:""}}); expect(field).toHaveProperty("value","");
  expect(p.onSymbolScaleChange).not.toHaveBeenCalled();
  fireEvent.change(field,{target:{value:"135"}});
  fireEvent.keyDown(field,{key:"Enter"});
  expect(p.onSymbolScaleChange).toHaveBeenCalledExactlyOnceWith(135);
  expect(p.onSymbolScaleChangeStart).toHaveBeenCalledOnce();
  expect(p.onSymbolScaleChangeEnd).toHaveBeenCalledOnce();
  expect(screen.getByRole("slider",{name:t("view.symbolSize")})).toHaveProperty("value","135");
  expect(screen.queryByRole("spinbutton",{name:t("view.symbolSize")})).toBeNull();
  expect(document.activeElement).not.toBe(screen.getByRole("button",{name:t("view.editValue",{label:t("view.symbolSize")})}));
});

test("range numbers can be typed, clamp to the other endpoint and cancel with Escape",()=>{
  const p=props(); render(<Ribbon {...p}/>); openView();
  const edit=(label:string)=>fireEvent.click(screen.getByRole("button",{name:t("view.editValue",{label:t(label)})}));
  edit("view.minimumUtilization");
  let field=screen.getByRole("spinbutton",{name:t("view.minimumUtilization")});
  fireEvent.change(field,{target:{value:"65"}}); fireEvent.blur(field);
  expect(p.onViewerUtilizationRangeChange).toHaveBeenCalledExactlyOnceWith(0.65,0.9);
  edit("view.maximumUtilization");
  field=screen.getByRole("spinbutton",{name:t("view.maximumUtilization")});
  fireEvent.change(field,{target:{value:"10"}}); fireEvent.keyDown(field,{key:"Enter"});
  expect(p.onViewerUtilizationRangeChange).toHaveBeenLastCalledWith(0.65,0.65);
  edit("view.minimumUtilization");
  field=screen.getByRole("spinbutton",{name:t("view.minimumUtilization")});
  fireEvent.change(field,{target:{value:"0"}}); fireEvent.keyDown(field,{key:"Escape"});
  expect(p.onViewerUtilizationRangeChange).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("slider",{name:t("view.minimumUtilization")})).toHaveProperty("value","65");
});

test.each(["view.symbolSize","view.minimumUtilization","view.maximumUtilization"])("Escape cancels %s without retaining focus",key=>{
  const p=props(); render(<Ribbon {...p}/>); openView();
  const label=t(key),buttonName=t("view.editValue",{label});
  fireEvent.click(screen.getByRole("button",{name:buttonName}));
  const field=screen.getByRole("spinbutton",{name:label});
  fireEvent.change(field,{target:{value:"75"}});
  fireEvent.keyDown(field,{key:"Escape"});
  expect(screen.queryByRole("spinbutton",{name:label})).toBeNull();
  expect(document.activeElement).not.toBe(screen.getByRole("button",{name:buttonName}));
  expect(p.onSymbolScaleChange).not.toHaveBeenCalled();
  expect(p.onViewerUtilizationRangeChange).not.toHaveBeenCalled();
});

test("optimization and lock draft controls route to their callbacks", () => {
  const p = props(); const view = render(<Ribbon {...p} />);
  fireEvent.click(screen.getByRole("button", { name: t("ilp.run") })); expect(p.onOpenTaskPanel).toHaveBeenCalledWith("ilp-optimization");
  fireEvent.click(screen.getByRole("button", { name: t("plan.editLocks") })); expect(p.onStartLockEditing).toHaveBeenCalledOnce();
  view.rerender(<Ribbon {...p} isLockEditing />);
  for (const [key, callback] of [["plan.applyLocks", p.onApplyLockEditing], ["plan.cancelLocks", p.onCancelLockEditing], ["plan.unlockAll", p.onUnlockAll]] as const) {
    fireEvent.click(screen.getByRole("button", { name: t(key) })); expect(callback).toHaveBeenCalledOnce();
  }
});

import RibbonButton from "./RibbonButton.tsx";
test("ribbon buttons omit help that merely repeats their visible label",()=>{
 const view=render(<RibbonButton icon="" label="Projectinformatie"/>);
 expect(screen.getByRole("button").hasAttribute("title")).toBe(false);
 view.rerender(<RibbonButton icon="" label="Projectinformatie" title="Projectinformatie"/>);
 expect(screen.getByRole("button").hasAttribute("title")).toBe(false);
 view.rerender(<RibbonButton icon="" label="Kaderselectie" title="Shift+slepen"/>);
 expect(screen.getByRole("button").getAttribute("title")).toBe("Shift+slepen");
});
