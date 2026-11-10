import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Legend from "./Legend.tsx";
import { projectFixture } from "../../../test/projectFixture.ts";
import i18n from "../../../i18n/config.ts";
import { getActivePilePlan } from "../../../domain/pile-plans/pilePlanActivation.ts";
import { formatPileTipLevelMillimetres } from "../../../domain/formatting.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";

const t = (key: string) => i18n.t(key);
function fixture() {
  const state = projectFixture();
  const [a, b, c] = state.loadPoints.map(point => point.id);
  return { ...state,
    selectedPileConfigurationsByLoadPoint: new Map([
      [a, { pile_size_mm: 290, pile_tip_level_mm: -17500 }],
      [b, { pile_size_mm: 320, pile_tip_level_mm: -17500 }],
      [c, { pile_size_mm: 290, pile_tip_level_mm: -18000 }],
    ]),
    pilePlans: state.pilePlans.map(plan => plan.id === state.activePilePlanId
      ? { ...plan, activePileSizes: [290, 320, 350], activePileTipLevelMms: [-17500, -18000], lockedLoadPointIds: [c] }
      : plan),
  };
}

test("legend selection and Shift extension exclude locked locations without editing activation", () => {
  const state = fixture(), before = structuredClone(state), changed = vi.fn<(next: ProjectState) => void>();
  const props = { state, onStateChange: changed, onEdit: vi.fn(), tipLevelRegionStatus: "idle" as const };
  const view = render(<Legend {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "290 mm" }));
  const first = changed.mock.calls[0][0];
  expect(first.selectedLoadPointIds).toEqual([state.loadPoints[0].id]);
  expect(first.pilePlans).toBe(state.pilePlans);
  view.rerender(<Legend {...props} state={first} />);
  expect(screen.getByRole("button", { name: "290 mm" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "320 mm" }), { shiftKey: true });
  expect(changed.mock.calls[1][0].selectedLoadPointIds).toEqual(state.loadPoints.slice(0, 2).map(point => point.id));
  expect(changed.mock.calls[1][0].legendSelectionFilter.pileSizes).toEqual([290, 320]);
  expect(state).toEqual(before);
});

test("shared legend actions use named icons and keep edit and activation read-only guards", () => {
  const state = fixture(), before = structuredClone(state), changed = vi.fn<(next: ProjectState) => void>(), edit = vi.fn();
  const props = { state, onStateChange: changed, onEdit: edit, tipLevelRegionStatus: "idle" as const };
  const view = render(<Legend {...props} />);
  const used = screen.getByRole("button", { name: t("legend.enableUsed") });
  const editor = screen.getByRole("button", { name: t("legend.edit") });
  expect(used.querySelector("use")?.getAttribute("href")).toContain("#i16-pile.legend-used");
  expect(editor.querySelector("use")?.getAttribute("href")).toContain("#i16-pile.legend-edit");
  expect(editor.getAttribute("data-oa-tip")).toBeNull();
  expect(editor.getAttribute("data-tooltip")).toBe(t("legend.edit"));
  fireEvent.click(editor); expect(edit).toHaveBeenCalledOnce();
  fireEvent.click(used);
  expect(getActivePilePlan(changed.mock.calls[0][0]).activePileSizes).toEqual([290, 320]);
  expect(getActivePilePlan(changed.mock.calls[0][0]).activePileTipLevelMms).toEqual([-17500, -18000]);
  expect(state).toEqual(before);
  view.rerender(<Legend {...props} readOnly />);
  expect(used.hasAttribute("disabled")).toBe(true);
  expect(editor.hasAttribute("disabled")).toBe(true);
  fireEvent.click(used); fireEvent.click(editor);
  expect(changed).toHaveBeenCalledOnce(); expect(edit).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "290 mm" }));
  expect(changed).toHaveBeenCalledTimes(2);
});

test("inactive assigned items retain warning and strike-through cues while unused inactive items stay hidden", () => {
  const state = fixture();
  state.pilePlans = state.pilePlans.map(plan => ({ ...plan, activePileSizes: [320, 350] }));
  const view = render(<Legend state={state} onStateChange={vi.fn()} onEdit={vi.fn()} tipLevelRegionStatus="idle" />);
  const inactive = screen.getByRole("button", { name: new RegExp(`290 mm`) });
  expect(inactive.classList.contains("is-disabled-used")).toBe(true);
  expect(inactive.querySelector(".legend-warning")?.getAttribute("aria-label")).toBe(t("legend.usedWarning"));
  expect(inactive.querySelector(".legend-symbol")?.classList.contains("is-small-dot")).toBe(true);
  expect(screen.getByRole("button", { name: "350 mm" }).classList.contains("is-unused")).toBe(true);
  expect(screen.queryByRole("button", { name: "400 mm" })).toBeNull();
  expect(view.container.querySelectorAll(".legend-warning")).toHaveLength(1);
});

test("tip symbols and region colors keep their encoding and explanatory status", () => {
  const state = fixture();
  const props = { state, onStateChange: vi.fn(), onEdit: vi.fn(), tipLevelRegionStatus: "idle" as const };
  state.pileLegend = { ...state.pileLegend, encodingMode: "tip-symbol" };
  const view = render(<Legend {...props} />);
  const tip = () => screen.getByRole("button", { name: formatPileTipLevelMillimetres(-17500, i18n.language) });
  expect(tip().querySelector(".legend-symbol svg")).toBeTruthy();
  view.rerender(<Legend {...props} state={{ ...state, showTipLevelRegions: false,
    pileLegend: { ...state.pileLegend, encodingMode: "size-color-tip-region" } }} />);
  expect(tip().querySelector(".legend-color.is-region")).toBeTruthy();
  expect(screen.getByText(t("legend.regionsHidden"))).toBeTruthy();
  view.rerender(<Legend {...props} tipLevelRegionStatus="error" state={{ ...state, showTipLevelRegions: true,
    pileLegend: { ...state.pileLegend, encodingMode: "size-color-tip-region" } }} />);
  expect(screen.getByText(t("legend.regionsUnavailable"))).toBeTruthy();
});
