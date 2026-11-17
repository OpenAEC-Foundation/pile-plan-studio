import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { GroupAssignmentConflict } from "../../../core/loadPointGroupContract.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import PilePlanViewer, { type PilePlanViewerProps } from "./PilePlanViewer.tsx";

test("hides a group conflict warning and red contour while keeping ordinary group and selection contours", () => {
  const project = projectFixture();
  const loadPoints = project.loadPoints.slice(0, 2);
  const [first, second] = loadPoints.map(point => point.id);
  const ids = [first, second];
  const conflict: GroupAssignmentConflict = {
    load_point_ids: ids, kind: "partial_assignment", assignment_repair_blocked: false,
    unassignment_repair_blocked: false, blocking_locked_load_point_ids: [],
  };
  const props: PilePlanViewerProps = {
    showGroupConflicts: true,
    state: { ...project, loadPoints, cpts: [], showGrid: false, showLoadPointGroups: true,
      selectedLoadPointIds: [], selectedLoadPointId: null },
    loadPointGroups: [{ load_point_ids: ids }],
    loadPointGroupTopology: {
      load_point_ids: ids, edges: [{ from_load_point_id: first, to_load_point_id: second }], faces: [],
    },
    groupAssignmentAssessment: {
      conflicts: [conflict], conflictsByLoadPointId: new Map([[first, conflict], [second, conflict]]),
      pending: false, error: null,
    },
    technicalAssignment: { status: "idle", assessment: null, issuesByLoadPointId: new Map(), error: null },
    lassoSelectionActive: false, tipLevelRegionTopology: null, onStateChange: vi.fn(),
  };
  const view = render(<PilePlanViewer {...props} />);
  const contour = (state: string) => view.container.querySelector(`.load-point-group-contour.is-${state}`);
  const warning = () => view.container.querySelector(".load-point-group-warning");
  expect(contour("conflict")).toBeTruthy();
  expect(warning()).toBeTruthy();

  view.rerender(<PilePlanViewer {...props} showGroupConflicts={false} />);
  expect(contour("default")).toBeTruthy();
  expect(contour("conflict")).toBeNull();
  expect(warning()).toBeNull();

  view.rerender(<PilePlanViewer {...props} showGroupConflicts={false}
    state={{ ...props.state, showLoadPointGroups: false }} />);
  expect(contour("default")).toBeNull();
  view.rerender(<PilePlanViewer {...props} showGroupConflicts={false}
    state={{ ...props.state, showLoadPointGroups: false, selectedLoadPointIds: ids, selectedLoadPointId: first }} />);
  expect(contour("selected")).toBeTruthy();
  expect(warning()).toBeNull();
});
