import { fireEvent, render, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { projectFixture } from "../../../test/projectFixture.ts";
import { normalizePileOptionColumnLayouts, setPileOptionColumnVisible } from "../../../domain/pile-options/pileOptionColumnLayout.ts";
import i18n from "../../../i18n/config.ts";
import RightPanel from "./RightPanel.tsx";

function fixture() {
  const project = projectFixture();
  const point = project.loadPoints[0]!;
  const options = [-17_500, -18_000].map(tip => ({
    configuration: { pile_size_mm: 290, pile_tip_level_mm: tip },
    pile_size_mm: 290, pile_tip_level_m: tip / 1000, isOption: true,
    governing_cpt_id: null, governing_frd_kn: 900, utilization: 0.75,
    missing_cpt_ids: [], technicalStatus: "valid" as const,
  }));
  return { ...project, rightPanelMode: "load-point" as const,
    selectedLoadPointIds: [point.id], selectedLoadPointId: point.id,
    pileOptionsByLoadPointId: new Map([[point.id, options]]),
    selectedPileConfigurationsByLoadPoint: new Map(),
    pilePlans: project.pilePlans.map(plan => ({ ...plan, activePileSizes: [290], activePileTipLevelMms: [-17_500, -18_000] })),
    pileLegend: { ...project.pileLegend, encodingMode: "size-color-tip-region" as const,
      pileSizes: [{ ...project.pileLegend.pileSizes[0]!, value: 290, color: "#123456" }],
      pileTipLevels: [-17_500, -18_000].map((value, index) => ({
        ...project.pileLegend.pileTipLevels[0]!, value, color: index === 0 ? "#ABCDEF" : "#FEDCBA",
      })),
    },
  };
}

test("dual-color rows put tip colors behind size symbols and keep numeric levels readable", () => {
  const state = fixture(), apply = vi.fn();
  const view = render(<RightPanel state={state} onStateChange={() => {}} onApplyPileConfiguration={apply} />);
  const rows = view.container.querySelectorAll<HTMLElement>(".pile-option-row");
  expect(rows).toHaveLength(2);
  expect([...rows].map(row => row.querySelector<HTMLElement>(".pile-option-symbol-background")?.style.getPropertyValue("--pile-option-tip-color")))
    .toEqual(["#ABCDEF", "#FEDCBA"]);
  for (const row of rows) {
    expect(row.querySelector(".pile-option-symbol-cell [fill='#123456']")).not.toBeNull();
    expect(row.querySelector(".pile-option-tip-color")).toBeNull();
  }
  fireEvent.click(within(rows[1]!).getByText("-18 m"));
  expect(apply).toHaveBeenCalledWith(state.selectedLoadPointIds, { pile_size_mm: 290, pile_tip_level_mm: -18_000 });
  for (const encodingMode of ["size-symbol", "tip-symbol"] as const) {
    view.rerender(<RightPanel state={{ ...state, pileLegend: { ...state.pileLegend, encodingMode } }} onStateChange={() => {}} />);
    expect(view.container.querySelectorAll(".pile-option-symbol-background, .pile-option-tip-color")).toHaveLength(0);
    expect(within(view.container.querySelector(".pile-option-row")!).getByText("-17.5 m")).toBeTruthy();
  }
});

test("shows a tip color swatch when the symbol column is hidden", () => {
  const state = fixture();
  const layouts = normalizePileOptionColumnLayouts(undefined);
  const columnLayouts = { ...layouts, single: setPileOptionColumnVisible(layouts.single, "symbol", false) };
  const view = render(<RightPanel state={state} columnLayouts={columnLayouts} onStateChange={() => {}} />);
  expect(view.container.querySelector(".pile-option-symbol-cell")).toBeNull();
  const row = view.container.querySelector<HTMLElement>(".pile-option-row")!;
  expect(row.querySelector<HTMLElement>(".pile-option-tip-color")?.style.backgroundColor).toBe("rgb(171, 205, 239)");
  expect(row.querySelector(".pile-option-tip-color")?.getAttribute("aria-hidden")).toBe("true");
});

test("a retained inactive tip is gray and keeps its numeric level and inactive text", () => {
  const state = fixture(), pointId = state.selectedLoadPointId!;
  const configuration = { pile_size_mm: 290, pile_tip_level_mm: -18_000 };
  state.selectedPileConfigurationsByLoadPoint = new Map([[pointId, configuration]]);
  state.pilePlans = state.pilePlans.map(plan => ({ ...plan, activePileTipLevelMms: [-17_500],
    selectedPileConfigurationsByLoadPoint: state.selectedPileConfigurationsByLoadPoint }));
  const view = render(<RightPanel state={state} onStateChange={() => {}} />);
  const row = view.container.querySelector<HTMLElement>(".pile-option-row.is-chosen")!;
  expect(within(row).getByText("-18 m")).toBeTruthy();
  expect(row.querySelector<HTMLElement>(".pile-option-symbol-background")?.style.getPropertyValue("--pile-option-tip-color")).toBe("#8C989F");
  expect(within(row).getByText(i18n.t("pileOptions.inactive", { ns: "rightPanel" }))).toBeTruthy();
  expect(row.querySelector(".pile-option-symbol-cell [fill='#123456']")).not.toBeNull();
});
