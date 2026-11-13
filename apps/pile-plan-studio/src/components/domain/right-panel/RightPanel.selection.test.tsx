import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import RightPanel from "./RightPanel.tsx";

test("shares inspected members and grouped navigation context across the load-point and CPT tabs", () => {
  const project = projectFixture();
  const positions=[[20,100],[0,0],[0,100],[20,0]];
  const points = project.loadPoints.slice(0, 4).map((p,i)=>({...p,x_mm:positions[i][0],y_mm:positions[i][1]}));
  const groups = [{ load_point_ids: [points[0]!.id, points[2]!.id] }, { load_point_ids: [points[1]!.id, points[3]!.id] }];
  let current: ProjectState;
  function Panel() {
    const [state, setState] = useState<ProjectState>({ ...project, rightPanelMode: "cpts",
      loadPoints: points, selectedLoadPointIds: points.map(p => p.id), selectedLoadPointId: points[0]!.id });
    current = state;
    return <RightPanel state={state} onStateChange={setState} loadPointGroups={groups} />;
  }
  const { container } = render(<Panel />);
  const rows = () => container.querySelectorAll<HTMLButtonElement>(".load-point-selection-row");
  fireEvent.click(rows()[0]!);
  expect(current!.selectedLoadPointIds).toEqual([points[2]!.id]);
  expect(current!.loadPointSelectionContext?.ids).toEqual([points[2]!.id, points[0]!.id, points[1]!.id, points[3]!.id]);
  expect(container.querySelector(".selection-overview-count")!.textContent).toBe("1 of 4 selected");
  const options = screen.getByRole("button", { name: i18n.t("tabs.loadPoint", { ns: "rightPanel" }) });
  expect(options.querySelector("use")?.getAttribute("href")).toContain("#i16-pile.options");
  fireEvent.click(options);
  expect(rows()).toHaveLength(4);
  expect(rows()[0]!.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(rows()[1]!);
  expect(current!.selectedLoadPointIds).toEqual([points[0]!.id]);
  const cpts = screen.getByRole("button", { name: i18n.t("tabs.cpts", { ns: "rightPanel" }) });
  expect(cpts.querySelector("use")?.getAttribute("href")).toContain("#i16-pile.cpts");
  fireEvent.click(cpts);
  expect(rows()).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("cpts.nextLocation", { ns: "rightPanel" }) }));
  expect(current!.selectedLoadPointIds).toEqual([points[1]!.id]);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("cpts.selectEntireContext", { ns: "rightPanel" }) }));
  expect(current!.selectedLoadPointIds).toEqual([points[2]!.id, points[0]!.id, points[1]!.id, points[3]!.id]);
  expect(container.querySelector(".selection-overview-count")!.textContent).toBe("4 selected");
});

test("one permanent selection block and navigation are shared by both views, with collapse controls", () => {
  const state = { ...projectFixture(), rightPanelMode: "combined" as const };
  function Panel() {
    const [layout, setLayout] = useState({ rows: 4, collapsed: false });
    return <RightPanel state={state} onStateChange={() => {}} selectionRows={layout.rows}
      selectionCollapsed={layout.collapsed} onSelectionLayoutChange={patch => setLayout(current => ({ ...current, ...patch }))} />;
  }
  const view = render(<Panel />);
  expect(view.container.querySelectorAll(".load-point-selection-list")).toHaveLength(1);
  expect(view.container.querySelectorAll(".cpt-location-navigation")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("selectionOverview.collapse", { ns: "rightPanel" }) }));
  expect(view.container.querySelectorAll(".load-point-selection-list")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("selectionOverview.expand", { ns: "rightPanel" }) }));
  expect(view.container.querySelectorAll(".load-point-selection-list")).toHaveLength(1);
});

test("selection height is keyboard adjustable and retains its chosen height when collapsed", () => {
  const initial = projectFixture(), points = initial.loadPoints.slice(0, 6);
  const state = { ...initial, loadPoints: points, selectedLoadPointIds: [points[0]!.id] };
  let currentRows = 4;
  function Panel() {
    const [layout, setLayout] = useState({ rows: 4, collapsed: false });
    currentRows = layout.rows;
    return <RightPanel state={state} onStateChange={() => {}} loadPointGroups={[{ load_point_ids: points.map(p => p.id) }]}
      selectionRows={layout.rows} selectionCollapsed={layout.collapsed}
      onSelectionLayoutChange={patch => setLayout(current => ({ ...current, ...patch }))} />;
  }
  const view = render(<Panel />);
  const handle = () => screen.getByRole("separator", { name: i18n.t("selectionOverview.resize", { ns: "rightPanel" }) });
  fireEvent.keyDown(handle(), { key: "ArrowDown" });
  expect(currentRows).toBe(5);
  expect(view.container.querySelector<HTMLElement>(".load-point-selection-list")!.style.getPropertyValue("--selection-visible-rows")).toBe("5");
  fireEvent.click(screen.getByRole("button", { name: i18n.t("selectionOverview.collapse", { ns: "rightPanel" }) }));
  fireEvent.click(screen.getByRole("button", { name: i18n.t("selectionOverview.expand", { ns: "rightPanel" }) }));
  expect(handle().getAttribute("aria-valuenow")).toBe("5");
  fireEvent.doubleClick(handle());
  expect(currentRows).toBe(4);
});

test("restoring four rows keeps that preference even when the current group has fewer members", () => {
  const initial = projectFixture(), points = initial.loadPoints.slice(0, 2);
  const state = { ...initial, loadPoints: points, selectedLoadPointIds: [points[0]!.id] };
  let rows = 1;
  function Panel() {
    const [height, setHeight] = useState(1); rows = height;
    return <RightPanel state={state} onStateChange={() => {}} selectionRows={height}
      loadPointGroups={[{ load_point_ids: points.map(p => p.id) }]}
      onSelectionLayoutChange={patch => { if (patch.rows !== undefined) setHeight(patch.rows); }} />;
  }
  render(<Panel />);
  fireEvent.doubleClick(screen.getByRole("separator", { name: i18n.t("selectionOverview.resize", { ns: "rightPanel" }) }));
  expect(rows).toBe(4);
});


test("only this location drops the earlier inspection context without changing its physical group",()=>{
 const project=projectFixture(),points=project.loadPoints.slice(0,4),groups=[{load_point_ids:points.slice(0,2).map(p=>p.id)}];
 let current!:ProjectState;
 function Panel(){const [state,setState]=useState<ProjectState>({...project,loadPoints:points,selectedLoadPointIds:points.map(p=>p.id),selectedLoadPointId:points[0]!.id});current=state;return <RightPanel state={state} onStateChange={setState} loadPointGroups={groups}/>;}
 const view=render(<Panel/>);fireEvent.click([...view.container.querySelectorAll<HTMLButtonElement>(".load-point-selection-row")].find(row=>row.textContent?.includes(` ${points[0]!.id}`))!);
 fireEvent.click(screen.getByRole("button",{name:i18n.t("cpts.selectOnlyLocation",{ns:"rightPanel"})}));
 expect(current.selectedLoadPointIds).toEqual([points[0]!.id]);
 expect(current.loadPointSelectionContext?.ids).toEqual([points[0]!.id]);
 expect(view.container.querySelectorAll(".load-point-selection-row")).toHaveLength(1);
 expect(groups[0].load_point_ids).toEqual(points.slice(0,2).map(p=>p.id));
 expect(current.loadPointGroupingSettings).toBe(project.loadPointGroupingSettings);
});


test("shared header buttons expose exactly one selected view and return from task panels without changing selection", () => {
  const original = projectFixture();
  const state = {...original, rightPanelMode: "load-point" as const};
  const close = vi.fn(), change = vi.fn();
  const view = render(<RightPanel state={state} taskPanel="ilp-optimization" onCloseTaskPanel={close} onStateChange={change} />);
  const names = ["loadPoint", "cpts", "combined"].map(key => i18n.t(`tabs.${key}`, {ns:"rightPanel"}));
  for (const name of names) {
    const button = screen.getByRole("button", {name});
    expect(button.classList.contains("oa-button")).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  }
  fireEvent.click(screen.getByRole("button", {name:names[2]}));
  expect(close).toHaveBeenCalledOnce();
  const combined = change.mock.calls[0][0];
  expect(combined.rightPanelMode).toBe("combined");
  expect(combined.selectedLoadPointIds).toEqual(state.selectedLoadPointIds);
  view.rerender(<RightPanel state={combined} onStateChange={change} />);
  expect(screen.getByRole("button", {name:names[2]}).getAttribute("aria-pressed")).toBe("true");
  for (const [index,mode] of [[0,"load-point"],[1,"cpts"]] as const) {
    fireEvent.click(screen.getByRole("button", {name:names[index]}));
    const next = change.mock.calls[change.mock.calls.length - 1][0];
    expect(next.rightPanelMode).toBe(mode);
    expect(next.selectedLoadPointIds).toEqual(state.selectedLoadPointIds);
    view.rerender(<RightPanel state={next} onStateChange={change} />);
    expect(screen.getByRole("button", {name:names[index]}).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", {name:names[2]}).getAttribute("aria-pressed")).toBe("false");
  }
});

test("selection labels switch to pile numbers with a location fallback", () => {
  const project = projectFixture();
  const [first, second] = project.loadPoints;
  const state = {
    ...project,
    selectedLoadPointIds: [first.id, second.id],
    pilePlans: project.pilePlans.map(plan => plan.id === project.activePilePlanId
      ? { ...plan, revitMarksByLoadPoint: new Map([[first.id, "001-A"]]) }
      : plan),
  };
  const change = vi.fn();
  const view = render(<RightPanel state={state} onStateChange={change} />);
  const labels = () => Array.from(view.container.querySelectorAll(".load-point-selection-name"), row => row.textContent);
  const toggle = screen.getByRole("button", { name: "Pile numbers" });
  expect(labels()).toContain(first.name);
  fireEvent.click(toggle);
  expect(labels()).toEqual(expect.arrayContaining(["Pile 001-A", second.name]));
  fireEvent.click(screen.getByRole("button", { name: "Location numbers" }));
  expect(labels()).toEqual(expect.arrayContaining([first.name, second.name]));
  fireEvent.click(screen.getByRole("button", { name: "Pile numbers" }));
  expect(change).not.toHaveBeenCalled();

  view.rerender(<RightPanel state={{ ...state, pilePlans: project.pilePlans }} onStateChange={change} />);
  expect(screen.queryByRole("button", { name: /^(Pile|Location) numbers$/ })).toBeNull();
  expect(labels()).toContain(first.name);
});
