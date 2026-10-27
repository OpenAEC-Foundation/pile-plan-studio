import type { ProjectState } from "../../../../domain/project/projectState.ts";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { projectFixture } from "../../../../test/projectFixture.ts";
import IlpOptimizationSettingsPanel from "./IlpOptimizationSettingsPanel.tsx";

function Harness() {
  const [state, setState] = useState<ProjectState>(() => {
    const state = projectFixture();
    return { ...state, ilpOptimizationSettings: { ...state.ilpOptimizationSettings, allow_pile_count_changes: true } };
  });
  const noop = () => {};
  return <><IlpOptimizationSettingsPanel state={state} onChange={setState}
    newPlanName="Plan" onNewPlanNameChange={noop} sections={{ optimize: true, candidates: true, limits: true, costLimits: true, neighbors: true, saveAs: true, result: true }}
    onToggleSection={noop} onRun={noop} onRunLocal={noop} onStop={noop} onCancel={noop}
    timeLimitSeconds={600} onTimeLimitChange={noop} hasBestSolution={false} onClose={noop}
    running={false} stopping={false} onViewRunningPlan={noop} disabled={false}>{null}</IlpOptimizationSettingsPanel>
    <output data-testid="settings">{JSON.stringify(state.ilpOptimizationSettings)}</output></>;
}

test("count popup applies maximum and exclusions together, while cancel discards edits", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Choose pile counts" }));
  let dialog = within(screen.getByRole("dialog", { name: "Allowed pile counts" }));
  const maximum = () => dialog.getByRole("spinbutton", { name: "Maximum piles per cap" });
  expect((maximum() as HTMLInputElement).value).toBe("6");
  fireEvent.click(dialog.getByRole("checkbox", { name: "5 piles" }));
  expect((dialog.getByRole("checkbox", { name: "7 piles" }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.change(maximum(), { target: { value: "12" } });
  expect((dialog.getByRole("checkbox", { name: "12 piles" }) as HTMLInputElement).disabled).toBe(false);
  fireEvent.click(dialog.getByRole("button", { name: "Apply" }));
  const saved = JSON.parse(screen.getByTestId("settings").textContent!);
  expect(saved.max_piles_per_cap).toBe(12);
  expect(saved.allowed_pile_counts).not.toContain(5);
  expect(saved.allowed_pile_counts).toContain(20);
  fireEvent.click(screen.getByRole("button", { name: "Choose pile counts" }));
  dialog = within(screen.getByRole("dialog", { name: "Allowed pile counts" }));
  fireEvent.change(maximum(), { target: { value: "4" } });
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(JSON.parse(screen.getByTestId("settings").textContent!).max_piles_per_cap).toBe(12);
});

test("an empty effective selection or an invalid maximum cannot be applied", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Choose pile counts" }));
  const dialog = within(screen.getByRole("dialog", { name: "Allowed pile counts" }));
  const apply = () => dialog.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
  fireEvent.click(dialog.getByRole("button", { name: "Clear selection" }));
  expect(apply().disabled).toBe(true);
  fireEvent.click(dialog.getByRole("button", { name: "Select all" }));
  expect(apply().disabled).toBe(false);
  fireEvent.change(dialog.getByRole("spinbutton", { name: "Maximum piles per cap" }), { target: { value: "21" } });
  expect(apply().disabled).toBe(true);
});
