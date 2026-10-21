import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import CptPanel from "./CptPanel.tsx";
import { saveManualCptSelection, toggleManualCpt } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import { getSelectedLoadPoints } from "./rightPanelModel.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";

function setup() {
  const project = projectFixture();
  const points = project.loadPoints.slice(0, 3), [a, b] = project.cpts;
  const state = { ...project, loadPoints: points, cpts: [a!, b!], manualCptIdsByLoadPoint: new Map([[points[1]!.id, [b!.id]]]),
    selectedLoadPointIds: points.map(p => p.id), selectedLoadPointId: points[0]!.id,
    selectedCptsByLoadPointId: new Map(points.map((p, index) => [p.id, [{ cpt: index === 1 ? b! : a!, label: "nearest", distance_mm: 1000 }]])),
  };
  let current: ProjectState = state;
  function Editor() {
    const [s, update] = useState<ProjectState>(state); current = s;
    return <><CptPanel state={s} onStateChange={update} selectedLoadPoints={getSelectedLoadPoints(s)} onSave={async () => update(saveManualCptSelection(s))} />
      <button onClick={() => update(toggleManualCpt(s, b!.id))}>Toggle test CPT</button></>;
  }
  render(<Editor />);
  return { points, a: a!, b: b!, current: () => current };
}
const tr = (key: string) => i18n.t(key, { ns: "rightPanel" });

test("location picker scopes map edits, keeps the group selected and retains edits across navigation", () => {
  const h = setup(); fireEvent.click(screen.getByRole("button", { name: tr("actions.modify") }));
  const picker = screen.getByRole("combobox", { name: tr("cpts.editFor") });
  fireEvent.change(picker, { target: { value: String(h.points[0]!.id) } });
  fireEvent.click(screen.getByRole("button", { name: "Toggle test CPT" }));
  fireEvent.click(screen.getByRole("button", { name: tr("cpts.nextLocation") }));
  expect((picker as HTMLSelectElement).value).toBe(String(h.points[1]!.id));
  expect(h.current().selectedLoadPointIds).toEqual(h.points.map(p => p.id));
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
  expect(h.current().selectedLoadPointIds).toEqual(h.points.map(p => p.id));
  expect(screen.getByRole("columnheader", { name: tr("cpts.distance") })).toBeTruthy();
});

test("nearest and automatic reset remain cancellable draft operations", () => {
  const h = setup(), original = h.current().manualCptIdsByLoadPoint;
  fireEvent.click(screen.getByRole("button", { name: tr("actions.modify") }));
  fireEvent.click(screen.getByRole("button", { name: tr("actions.onlyNearest") }));
  expect(h.current().cptSelectionEditDraft).not.toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: tr("cpts.editFor") }), { target: { value: String(h.points[1]!.id) } });
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
    fireEvent.click(screen.getByRole("button", { name: tr("actions.modify") }));
    const picker = screen.getByRole("combobox", { name: tr("cpts.editFor") });
    expect(within(picker).getAllByRole("option")).toHaveLength(4);
    fireEvent.change(picker, { target: { value: String(h.points[2]!.id) } });
    expect((screen.getByRole("button", { name: tr("cpts.nextLocation") }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: tr("cpts.previousLocation") }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: tr("actions.cancel") }));
    expect(h.current().cptSelectionEditDraft).toBeNull();
  });
}

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
