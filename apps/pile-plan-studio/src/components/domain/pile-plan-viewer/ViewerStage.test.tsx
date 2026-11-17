import {fireEvent,render} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import sampleProjectText from "../../../../../../sample_project/sample_project.ifcpp?raw";
import {createRef} from "react";
import ViewerStage from "./ViewerStage.tsx";
import {buildViewerMarkerPresentation} from "./viewerMarkerPresentation.ts";
import {canonicalProjectForTest,projectTipLevelKeysForTest} from "../../../core/projectTestSupport.ts";
import {createInitialProjectState} from "../../../domain/project/projectState.ts";
import {createProjectViewTransform} from "../../../viewer/viewerGeometry.ts";
vi.mock("./viewerMarkerPresentation.ts",async importOriginal=>{
  const actual=await importOriginal<typeof import("./viewerMarkerPresentation.ts")>();
  return {...actual,buildViewerMarkerPresentation:vi.fn(actual.buildViewerMarkerPresentation)};
});
it("preserves the marker model for viewport-only updates and routes cached hit targets to current handlers",()=>{
  const project=canonicalProjectForTest(sampleProjectText);
  const state=createInitialProjectState(project,{initializeDefaultPiles:false},projectTipLevelKeysForTest(project));
  const empty=new Set<number>();
  const props={state,loadDirection:"compression" as const,technicalAssignment:{status:"ready" as const,assessment:null,issuesByLoadPointId:new Map(),error:null},
    projectTransform:createProjectViewTransform(state.bounds,{width:800,height:600}),
    tipLevelRegionPresentation:[],loadPointGroupGeometry:[],cptConnectionSegments:[],
    pileOptionsByLoadPointId:state.pileOptionsByLoadPointId,selectedLoadPointIds:empty,
    selectionContextLoadPointIds:empty,completeSelectedGroupLoadPointIds:empty,relatedLoadPointIds:empty,
    lockedLoadPointIds:empty,contextSelectedCptIds:empty,governingCptId:null,isEditingLoadPointLocks:false,
    isEditingCptSelection:false,activeHoverCandidateKey:null,stageRef:createRef<HTMLDivElement>(),
    onCptClick:vi.fn(),onLoadPointClick:vi.fn()};
  const view=render(<ViewerStage {...props}/>);
  const original=view.container.querySelector(`[data-map-marker-key="load-point:${state.loadPoints[0].id}"]`)!;
  const count=vi.mocked(buildViewerMarkerPresentation).mock.calls.length;
  const currentClick=vi.fn();
  view.rerender(<ViewerStage {...props} state={{...state,viewport:{scale:2,offsetX:20,offsetY:10}}} onLoadPointClick={currentClick}/>);
  expect(buildViewerMarkerPresentation).toHaveBeenCalledTimes(count);
  expect(view.container.querySelector(`[data-map-marker-key="load-point:${state.loadPoints[0].id}"]`)).toBe(original);
  fireEvent.click(original);
  expect(currentClick).toHaveBeenCalledOnce();
  expect(currentClick.mock.calls[0][1]).toBe(state.loadPoints[0].id);
  expect(props.onLoadPointClick).not.toHaveBeenCalled();
  view.rerender(<ViewerStage {...props} selectedLoadPointIds={new Set([state.loadPoints[0].id])}/>);
  expect(buildViewerMarkerPresentation).toHaveBeenCalledTimes(count+1);
  expect(original.classList.contains("is-selected")).toBe(true);
  const markedIds = new Set([state.loadPoints[0].id]);
  view.rerender(<ViewerStage {...props} selectedLoadPointIds={markedIds}
    drivingStatuses={new Map([[state.loadPoints[0].id, "doubtful"]])}/>);
  expect(view.container.querySelectorAll(".viewer-drawing-svg .viewer-status-halos > g")).toHaveLength(1);
  expect(view.container.querySelector(".viewer-status-halos [data-driving-status=doubtful]")).not.toBeNull();
  expect(original.getAttribute("aria-label")).toMatch(/Driving status: Needs review/);
  expect(original.classList.contains("is-selected")).toBe(true);
  view.rerender(<ViewerStage {...props} selectedLoadPointIds={markedIds}/>);
  expect(view.container.querySelectorAll(".viewer-status-halos > g").length).toBeGreaterThan(1);
  expect(original.getAttribute("aria-label")).not.toContain("Driving status");
  const loadPoints = state.loadPoints.map((point, index) => index === 0
    ? { ...point, tension: { state: "known" as const, value_kn: 0 } } : point);
  const testedState = { ...state, loadPoints };
  const statuses = new Map([[loadPoints[0].id, "doubtful" as const]]);
  view.rerender(<ViewerStage {...props} state={testedState} selectedLoadPointIds={markedIds} drivingStatuses={statuses} />);
  const halo = view.container.querySelector(".viewer-status-halos [data-driving-status=doubtful]")!;
  const projection = halo.getAttribute("transform");
  const marker = view.container.querySelector(`.viewer-marker-graphic.is-load-point[transform="${projection}"]`)!;
  const hitTarget = view.container.querySelector(`[data-map-marker-key="load-point:${loadPoints[0].id}"]`)!;
  const targetBefore = hitTarget.getAttribute("style");
  view.rerender(<ViewerStage {...props} state={testedState} loadDirection="tension"
    selectedLoadPointIds={markedIds} drivingStatuses={statuses} />);
  expect(Number(halo.getAttribute("opacity"))).toBeGreaterThan(0);
  expect(Number(halo.getAttribute("opacity"))).toBeLessThan(0.5);
  expect(marker.querySelector(":scope > g[opacity]")).not.toBeNull();
  expect(marker.querySelector(":scope > circle[stroke='#ed7100']")).not.toBeNull();
  expect(hitTarget.getAttribute("style")).toBe(targetBefore);
  fireEvent.click(hitTarget);
  expect(props.onLoadPointClick).toHaveBeenLastCalledWith(expect.anything(), loadPoints[0].id);
});
