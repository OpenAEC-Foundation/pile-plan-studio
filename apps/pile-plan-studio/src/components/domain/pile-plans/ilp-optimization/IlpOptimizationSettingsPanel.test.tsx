import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { ComponentProps } from "react";
import i18n from "../../../../i18n/config.ts";
import { projectFixture } from "../../../../test/projectFixture.ts";
import IlpOptimizationSettingsPanel from "./IlpOptimizationSettingsPanel.tsx";
import IlpCandidateSelector from "./IlpCandidateSelector.tsx";
const t = (key: string) => i18n.t(key, { ns: "ribbon" });
const panel = (key: string, options = {}) => i18n.t(key, { ns: "rightPanel", ...options });
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
function props() {
  const state = projectFixture();
  state.ilpOptimizationSettings = { ...state.ilpOptimizationSettings, optimize_coherence: true };
  return { state, onChange: vi.fn(), newPlanName: "Candidate", onNewPlanNameChange: vi.fn(),
    sections: { optimize: true, candidates: true, limits: true, costLimits: true, neighbors: true, saveAs: true, result: true },
    onToggleSection: vi.fn(), onRun: vi.fn(), onRunLocal: vi.fn(), onStop: vi.fn(), onCancel: vi.fn(),
    timeLimitSeconds: 600, onTimeLimitChange: vi.fn(), hasBestSolution: false, onClose: vi.fn(),
    running: false, stopping: false, onViewRunningPlan: vi.fn(), disabled: false, children: null,
  } satisfies ComponentProps<typeof IlpOptimizationSettingsPanel>;
}

test("exclusive target and candidate radios preserve immutable settings routes", () => {
  const p = props(); render(<IlpOptimizationSettingsPanel {...p} />);
  fireEvent.click(screen.getByRole("radio", { name: panel("optimization.selected", { count: p.state.selectedLoadPointIds.length }) }));
  expect(p.onChange).toHaveBeenLastCalledWith({ ...p.state, ilpOptimizationTargetScope: "selected" });
  fireEvent.click(screen.getByRole("radio", { name: t("ilp.customCandidates") }));
  const changed = p.onChange.mock.calls[p.onChange.mock.calls.length - 1][0];
  expect(changed.ilpOptimizationSettings.candidate_source).toBe("custom");
  expect(changed.pilePlans).toBe(p.state.pilePlans);
  expect(p.state.ilpOptimizationSettings.candidate_source).not.toBe("custom");
});

test("limits keep blank as unlimited and reject invalid drafts without submitting", () => {
  const p = props(); render(<IlpOptimizationSettingsPanel {...p} />);
  const limit = screen.getByRole("spinbutton", { name: panel("optimization.maxTips") });
  fireEvent.change(limit, { target: { value: "3" } }); expect(p.onChange).not.toHaveBeenCalled();
  fireEvent.blur(limit); expect(p.onChange.mock.calls[p.onChange.mock.calls.length - 1][0].ilpOptimizationSettings.max_pile_tip_levels).toBe(3);
  fireEvent.change(limit, { target: { value: "" } }); fireEvent.blur(limit);
  expect(p.onChange.mock.calls[p.onChange.mock.calls.length - 1][0].ilpOptimizationSettings.max_pile_tip_levels).toBeNull();
  p.onChange.mockClear(); fireEvent.change(limit, { target: { value: "-1" } }); fireEvent.blur(limit);
  expect(limit.getAttribute("aria-invalid")).toBe("true"); expect(screen.getByRole("alert").textContent).toBe(t("ilp.invalidNumber"));
  expect(p.onChange).not.toHaveBeenCalled();
});

test("decimal comma drafts and pointer/keyboard stepping preserve scaled fractions", () => {
  const p = props(); render(<IlpOptimizationSettingsPanel {...p} />);
  const budget = screen.getByRole("textbox", { name: t("ilp.extraCost") });
  fireEvent.change(budget, { target: { value: "1,25" } }); fireEvent.keyDown(budget, { key: "ArrowUp" });
  expect((budget as HTMLInputElement).value).toBe("2.25"); fireEvent.blur(budget);
  expect(p.onChange.mock.calls[p.onChange.mock.calls.length - 1][0].ilpOptimizationSettings.budget_basis_points).toBe(225);
  const group = screen.getByRole("group", { name: t("ilp.extraCost") });
  const increase = within(group).getByRole("button", { name: i18n.t("numberInput.increment", { ns: "common" }) });
  fireEvent.pointerDown(increase, { button: 0 }); fireEvent.pointerUp(increase);
  expect((budget as HTMLInputElement).value).toBe("3.25"); fireEvent.blur(budget);
  expect(p.onChange.mock.calls[p.onChange.mock.calls.length - 1][0].ilpOptimizationSettings.budget_basis_points).toBe(325);
  p.onChange.mockClear(); const utilization = screen.getByRole("textbox", { name: t("ilp.utilization") });
  fireEvent.change(utilization, { target: { value: "100.01" } }); fireEvent.blur(utilization);
  expect(p.onChange).not.toHaveBeenCalled();
});

test("running states disable settings but preserve destination, stop-best and cancellation controls", () => {
  const p = props(); const view = render(<IlpOptimizationSettingsPanel {...p} running runningPlanName="Destination" />);
  const stop = screen.getByRole("button", { name: t("ilp.stopBest") });
  expect(stop.matches(":disabled")).toBe(true);
  expect([...view.container.querySelectorAll("input")].every(input => input.matches(":disabled"))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: panel("ilp.runningPlan", { name: "Destination" }) }));
  expect(p.onViewRunningPlan).toHaveBeenCalledOnce();
  view.rerender(<IlpOptimizationSettingsPanel {...p} running hasBestSolution runningPlanName="Destination" />);
  fireEvent.click(stop); expect(p.onStop).toHaveBeenCalledOnce();
  view.rerender(<IlpOptimizationSettingsPanel {...p} running stopping hasBestSolution runningPlanName="Destination" />);
  expect(screen.getByRole("button", { name: t("ilp.stopping") }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("status").textContent).toBe(panel("ilp.stoppingHelp"));
  fireEvent.click(screen.getByRole("button", { name: t("ilp.cancel") })); expect(p.onCancel).toHaveBeenCalledOnce();
  view.rerender(<IlpOptimizationSettingsPanel {...p} running cancelling hasBestSolution />);
  expect(screen.getByRole("button", { name: t("ilp.cancel") }).matches(":disabled")).toBe(true);
});

test("settings activation stays separate from viewer shortcuts and leaves Undo available", () => {
  const p = props(), background = vi.fn();
  render(<div onKeyDown={background}><IlpOptimizationSettingsPanel {...p} /></div>);
  const coherence = screen.getByRole("checkbox", { name: t("ilp.optimizeCoherence") });
  expect(fireEvent.keyDown(coherence, { key: " ", code: "Space" })).toBe(true);
  expect(background).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("button", { name: t("ilp.close") }), { key: "z", ctrlKey: true });
  expect(background).toHaveBeenCalledOnce();
});

test("candidate matrix retains partial group selection and unavailable chosen configurations", async () => {
  const catalog = [{ pile_size_mm: 290, pile_tip_level_mm: -18000 }, { pile_size_mm: 290, pile_tip_level_mm: -19000 }];
  const selected = [catalog[0], { pile_size_mm: 320, pile_tip_level_mm: -18000 }], onChange = vi.fn();
  render(<IlpCandidateSelector catalog={catalog} selected={selected} onChange={onChange} />);
  const size = screen.getByRole("checkbox", { name: i18n.t("ilp.selectSizeCandidates", { ns: "ribbon", value: 290 }) }) as HTMLInputElement;
  expect(size.indeterminate).toBe(true); expect(size.getAttribute("aria-checked")).toBe("mixed");
  fireEvent.click(size); expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toHaveLength(3);
  expect((screen.getByRole("checkbox", { name: "320 mm / -18 m" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: t("ilp.clearCandidates") })); expect(onChange).toHaveBeenLastCalledWith([]);
  expect(selected).toHaveLength(2);
});


test("holding a numeric stepper repeats and releasing stops without changing fractional precision", () => {
  vi.useFakeTimers(); const p = props(); render(<IlpOptimizationSettingsPanel {...p} />);
  const budget = screen.getByRole("textbox", { name: t("ilp.extraCost") });
  fireEvent.change(budget, { target: { value: "1,25" } });
  const increase = within(screen.getByRole("group", { name: t("ilp.extraCost") })).getByRole("button", { name: i18n.t("numberInput.increment", { ns: "common" }) });
  fireEvent.pointerDown(increase, { button: 0 });
  act(() => vi.advanceTimersByTime(510));
  expect((budget as HTMLInputElement).value).toBe("4.25");
  fireEvent.pointerUp(increase); act(() => vi.advanceTimersByTime(500));
  expect((budget as HTMLInputElement).value).toBe("4.25");
  fireEvent.blur(budget); expect(p.onChange.mock.calls[p.onChange.mock.calls.length - 1][0].ilpOptimizationSettings.budget_basis_points).toBe(425);
});
