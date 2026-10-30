import { useState } from "react";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import CptPanel from "./CptPanel.tsx";
import RightPanel from "./RightPanel.tsx";
import { saveManualCptSelection, toggleManualCpt, beginManualCptSelection, clearManualCptSelection, selectOnlyNearestCpts } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import { getSelectedLoadPoints } from "./rightPanelModel.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { localizeLoadPointName } from "./PanelControls.tsx";
import ApplicationTooltip from "../../template/ApplicationTooltip.tsx";

function setup(grouped = false) {
  const project = projectFixture();
  const points = project.loadPoints.slice(0, grouped ? 4 : 3).map((p,index)=>({...p,x_mm:index*1000,y_mm:0})), [a, b] = project.cpts;
  const groups = grouped ? [{ load_point_ids: [points[0]!.id, points[2]!.id] }, { load_point_ids: [points[1]!.id, points[3]!.id] }] : [];
  const state: ProjectState = { ...project, rightPanelMode: "cpts", loadPoints: points, cpts: [a!, b!], manualCptIdsByLoadPoint: new Map([[points[1]!.id, [b!.id]]]),
    selectedLoadPointIds: points.map(p => p.id), selectedLoadPointId: points[0]!.id,
    selectedCptsByLoadPointId: new Map(points.map((p, index) => [p.id, [{ cpt: index === 1 ? b! : a!, label: "nearest", distance_mm: 1000 }]])),
  };
  let current: ProjectState = state;
  function Editor() {
    const [s, update] = useState<ProjectState>(state); current = s;
    return <><RightPanel state={s} onStateChange={update} loadPointGroups={groups}
      onApplyCptMethod={async method => update(current => {
        const editing = beginManualCptSelection(current);
        return saveManualCptSelection(method === "automatic" ? clearManualCptSelection(editing) : selectOnlyNearestCpts(editing));
      })}
      onSaveCptSelection={async afterSave => update(current => { const saved = saveManualCptSelection(current); return afterSave ? afterSave(saved) : saved; })} />
      <button onClick={() => update(toggleManualCpt(s, b!.id))}>Toggle test CPT</button></>;
  }
  render(<Editor />);
  return { points, a: a!, b: b!, current: () => current };
}
const tr = (key: string) => i18n.t(key, { ns: "rightPanel" });
function inspect(point: ProjectState["loadPoints"][number]) {
  const name = localizeLoadPointName(point.name, i18n.getFixedT(null, "rightPanel"));
  const force = point.design_load_kn.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
  fireEvent.click(screen.getByRole("button", { name: i18n.t("loadPoints.inspectMember", { ns: "rightPanel", name, force }) }));
}

test("shared location selection scopes map edits and retains edits across navigation", () => {
  const h = setup(); fireEvent.click(screen.getByRole("button", { name: tr("actions.modify") }));
  inspect(h.points[0]!);
  fireEvent.click(screen.getByRole("button", { name: "Toggle test CPT" }));
  fireEvent.click(screen.getByRole("button", { name: tr("cpts.nextLocation") }));
  expect(h.current().selectedLoadPointIds).toEqual([h.points[1]!.id]);
  expect(h.current().manualCptIdsByLoadPoint.size).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: tr("cpts.previousLocation") }));
  expect(h.current().cptSelectionEditDraft?.cptIdsByLoadPoint.get(h.points[0]!.id)).toEqual(new Set([h.a.id, h.b.id]));
  fireEvent.click(screen.getByRole("button", { name: tr("actions.save") }));
  expect(h.current().manualCptIdsByLoadPoint.get(h.points[0]!.id)).toEqual([h.a.id, h.b.id].sort((a,b) => a-b));
  expect(h.current().manualCptIdsByLoadPoint.has(h.points[2]!.id)).toBe(false);
});

test("usage counts expose actual members and open that location directly in the editor", () => {
  const h = setup(); const row = screen.getAllByRole("row").find(row => within(row).queryByText(h.b.name));
  expect(row).toBeDefined();
  fireEvent.click(within(row!).getByRole("button", { name: /1 \/ 3/ }));
  fireEvent.click(screen.getByRole("button", { name: i18n.t("cpts.editLocation", { ns: "rightPanel", id: h.points[1]!.id }) }));
  expect(h.current().cptSelectionEditLoadPointId).toBe(h.points[1]!.id);
  expect(h.current().selectedLoadPointIds).toEqual([h.points[1]!.id]);
  expect(screen.getByRole("columnheader", { name: tr("cpts.distance") })).toBeTruthy();
});

test("expanded CPT usage shows its members without retaining their tooltip", async () => {
  const h=setup(); render(<ApplicationTooltip/>);
  const row=screen.getAllByRole("row").find(row=>within(row).queryByText(h.b.name))!;
  const summary=within(row).getByRole("button",{name:/1 \/ 3/});
  fireEvent.mouseOver(summary);
  expect(screen.getByRole("tooltip").textContent).toContain(String(h.points[1]!.id));
  const details=summary.closest("details")!;
  details.open=true; fireEvent(details,new Event("toggle"));
  await waitFor(()=>expect(screen.queryByRole("tooltip")).toBeNull());
  fireEvent.mouseOut(summary); fireEvent.mouseOver(summary);
  expect(screen.queryByRole("tooltip")).toBeNull();
  details.open=false; fireEvent(details,new Event("toggle"));
  await waitFor(()=>expect(summary.getAttribute("data-tooltip")).toContain(String(h.points[1]!.id)));
  fireEvent.mouseOut(summary); fireEvent.mouseOver(summary);
  expect(screen.getByRole("tooltip")).toBeTruthy();
});

test("nearest and automatic reset remain cancellable draft operations", () => {
  const h = setup(), original = h.current().manualCptIdsByLoadPoint;
  fireEvent.click(screen.getByRole("button", { name: tr("actions.modify") }));
  fireEvent.click(screen.getByRole("button", { name: tr("actions.onlyNearest") }));
  expect(h.current().cptSelectionEditDraft).not.toBeNull();
  inspect(h.points[1]!);
  fireEvent.click(screen.getByRole("button", { name: tr("actions.useAlgorithm") }));
  expect(h.current().cptSelectionEditDraft?.automaticLoadPointIds).toEqual(new Set([h.points[1]!.id]));
  expect(h.current().manualCptIdsByLoadPoint).toBe(original);
  fireEvent.click(screen.getByRole("button", { name: tr("actions.cancel") }));
  expect(h.current().manualCptIdsByLoadPoint).toBe(original);
  expect(h.current().analysisRequest.revision).toBe(0);
});

for (const language of ["nl", "en"]) {
  test(`CPT editor controls are usable in ${language}`, async () => {
    await i18n.changeLanguage(language);
    const h = setup();
    expect(screen.getByRole("button",{name:i18n.t("cpts.usedByValue",{ns:"rightPanel",used:2,total:3})})).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: tr("actions.modify") }));
    expect(screen.queryByRole("combobox", { name: tr("cpts.editFor") })).toBeNull();
    inspect(h.points[2]!);
    expect(screen.getByText(i18n.t("cpts.locationPosition", { ns: "rightPanel", current: 3, total: 3 }))).toBeTruthy();
    expect((screen.getByRole("button", { name: tr("cpts.nextLocation") }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: tr("cpts.previousLocation") }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: tr("actions.cancel") }));
    expect(h.current().cptSelectionEditDraft).toBeNull();
  });
}

test("navigation stays within the displayed multiselection and visits each group together outside edit mode", () => {
  const h = setup(true);
  expect(screen.getByRole("region", { name: tr("selectionOverview.title") })).toBeTruthy();
  inspect(h.points[0]!);
  for (const expected of [h.points[2]!, h.points[1]!, h.points[3]!]) {
    fireEvent.click(screen.getByRole("button", { name: tr("cpts.nextLocation") }));
    expect(h.current().selectedLoadPointIds).toEqual([expected.id]);
    expect(screen.getAllByRole("button").filter(button => button.classList.contains("load-point-selection-row"))).toHaveLength(4);
  }
  expect((screen.getByRole("button", { name: tr("cpts.nextLocation") }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: tr("cpts.previousLocation") }));
  expect(h.current().selectedLoadPointIds).toEqual([h.points[1]!.id]);
  fireEvent.click(screen.getAllByRole("button", { name: i18n.t("loadPoints.selectGroup", { ns: "rightPanel", count: 2 }) })[0]!);
  expect(h.current().selectedLoadPointIds).toEqual([h.points[0]!.id, h.points[2]!.id]);
  expect(h.current().cptSelectionEditDraft).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: tr("cpts.selectEntireContext") }));
  expect(h.current().selectedLoadPointIds).toEqual([h.points[0]!.id, h.points[2]!.id, h.points[1]!.id, h.points[3]!.id]);
  expect((screen.getByRole("button", { name: tr("cpts.selectEntireContext") }) as HTMLButtonElement).disabled).toBe(true);
  const modify = screen.getByRole("button", { name: tr("actions.modify") });
  const region = screen.getByRole("region", { name: tr("selectionOverview.title") });
  expect(region.compareDocumentPosition(modify) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(modify.closest("header")).toBeNull();
});

test("CPT methods are available outside editing and zero changes has no empty disclosure", () => {
  const h = setup();
  expect(screen.getByRole("button", { name: tr("actions.onlyNearest") })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: tr("actions.onlyNearest") }));
  expect(h.current().cptSelectionEditDraft).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: tr("actions.useAlgorithm") }));
  expect(h.current().manualCptIdsByLoadPoint.size).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: tr("actions.modify") }));
  expect(screen.getByText(i18n.t("cpts.changedLocations", { ns: "rightPanel", changed: 0, total: 3 })).closest("details")).toBeNull();
});

test("switching to pile options saves staged changes and closes the CPT editor", () => {
  const h = setup();
  inspect(h.points[0]!);
  fireEvent.click(screen.getByRole("button", { name: tr("actions.modify") }));
  fireEvent.click(screen.getByRole("button", { name: "Toggle test CPT" }));
  fireEvent.click(screen.getByRole("button", { name: tr("tabs.loadPoint") }));
  expect(h.current().cptSelectionEditDraft).toBeNull();
  expect(h.current().rightPanelMode).toBe("load-point");
  expect(h.current().manualCptIdsByLoadPoint.get(h.points[0]!.id)).toEqual([h.a.id, h.b.id].sort((a,b) => a-b));
});

test("starting on one member can edit another group member without losing the first draft", () => {
  const h = setup(true);
  inspect(h.points[0]!);
  fireEvent.click(screen.getByRole("button", { name: tr("actions.modify") }));
  fireEvent.click(screen.getByRole("button", { name: "Toggle test CPT" }));
  fireEvent.click(screen.getByRole("button", { name: tr("cpts.nextLocation") }));
  expect(h.current().selectedLoadPointIds).toEqual([h.points[2]!.id]);
  fireEvent.click(screen.getByRole("button", { name: "Toggle test CPT" }));
  expect(h.current().manualCptIdsByLoadPoint.has(h.points[0]!.id)).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: tr("actions.save") }));
  for (const point of [h.points[0]!, h.points[2]!]) {
    expect(h.current().manualCptIdsByLoadPoint.get(point.id)).toEqual([h.a.id, h.b.id].sort((a, b) => a - b));
  }
  expect(h.current().manualCptIdsByLoadPoint.get(h.points[1]!.id)).toEqual([h.b.id]);
});

test("Modify is disabled without load points and saving stays disabled without a session handler", () => {
  const state = projectFixture();
  const view = render(<CptPanel state={state} selectedLoadPoints={[]} onStateChange={() => {}} />);
  expect((screen.getByRole("button", { name: tr("actions.modify") }) as HTMLButtonElement).disabled).toBe(true);
  const editing = { ...state, cptSelectionEditDraft: {
    loadPointIds: [state.loadPoints[0]!.id], cptIdsByLoadPoint: new Map<number, Set<number>>(),
    initialCptIdsByLoadPoint: new Map<number, ReadonlySet<number>>(), automaticLoadPointIds: new Set<number>(),
  } };
  view.rerender(<CptPanel state={editing} selectedLoadPoints={getSelectedLoadPoints(state)} onStateChange={() => {}} />);
  expect((screen.getByRole("button", { name: tr("actions.save") }) as HTMLButtonElement).disabled).toBe(true);
});

test("a failed automatic preview can be retried without losing the pending edits", () => {
  const project = projectFixture(), id = project.loadPoints[0]!.id;
  const draft = { loadPointIds: [id], cptIdsByLoadPoint: new Map([[id, new Set([project.cpts[0]!.id])]]),
    initialCptIdsByLoadPoint: new Map([[id, new Set([project.cpts[0]!.id])]]), automaticLoadPointIds: new Set([id]) };
  let next: ProjectState | null = null;
  const state: ProjectState = { ...project, cptSelectionEditDraft: draft,
    cptSelectionPreview: { draft, status: "failed", error: "unavailable" } };
  render(<CptPanel state={state} selectedLoadPoints={getSelectedLoadPoints(state)} onStateChange={value => { next = value; }} />);
  fireEvent.click(screen.getByRole("button", { name: tr("cpts.retryPreview") }));
  expect(next!.manualCptIdsByLoadPoint).toBe(state.manualCptIdsByLoadPoint);
  expect(next!.cptSelectionEditDraft?.automaticLoadPointIds).toEqual(new Set([id]));
  expect(next!.cptSelectionPreview).toBeNull();
  expect(next!.cptSelectionEditDraft).not.toBe(draft);
});
