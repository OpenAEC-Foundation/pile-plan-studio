import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import RightPanel from "./RightPanel.tsx";

test("shares inspected members and grouped navigation context across the load-point and CPT tabs", () => {
  const project = projectFixture();
  const points = project.loadPoints.slice(0, 4);
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
  expect(current!.selectedLoadPointIds).toEqual([points[0]!.id]);
  expect(current!.loadPointSelectionContext?.ids).toEqual([points[0]!.id, points[2]!.id, points[1]!.id, points[3]!.id]);
  expect(container.querySelector(".selection-overview-count")!.textContent).toBe("1 of 4 selected");
  fireEvent.click(screen.getByRole("button", { name: i18n.t("tabs.loadPoint", { ns: "rightPanel" }) }));
  expect(rows()).toHaveLength(4);
  expect(rows()[0]!.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(rows()[1]!);
  expect(current!.selectedLoadPointIds).toEqual([points[2]!.id]);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("tabs.cpts", { ns: "rightPanel" }) }));
  expect(rows()).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("cpts.nextLocation", { ns: "rightPanel" }) }));
  expect(current!.selectedLoadPointIds).toEqual([points[1]!.id]);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("cpts.selectEntireContext", { ns: "rightPanel" }) }));
  expect(current!.selectedLoadPointIds).toEqual([points[0]!.id, points[2]!.id, points[1]!.id, points[3]!.id]);
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
