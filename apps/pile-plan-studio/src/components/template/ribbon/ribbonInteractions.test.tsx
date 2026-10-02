import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import Ribbon from "./Ribbon.tsx";

const t = (key: string) => i18n.t(key, { ns: "ribbon" });
function props() {
  return { isLassoSelectionActive: false, lassoSelectionDisabled: false, isLockEditing: false,
    symbolScalePercent: 100, viewerUtilizationMinimum: 0.5, viewerUtilizationMaximum: 0.9,
    foregroundLayer: "load-points" as const, showGrid: false, showTipLevelRegions: false, showLoadPointGroups: false,
    explorerVisible: true, propertiesVisible: false, onToggleLassoSelection: vi.fn(), onStartLockEditing: vi.fn(),
    onApplyLockEditing: vi.fn(), onCancelLockEditing: vi.fn(), onUnlockAll: vi.fn(),
    onSymbolScaleChangeStart: vi.fn(), onSymbolScaleChange: vi.fn(), onSymbolScaleChangeEnd: vi.fn(),
    onViewerUtilizationRangeChange: vi.fn(), onForegroundLayerChange: vi.fn(), onGridVisibilityChange: vi.fn(),
    onTipLevelRegionVisibilityChange: vi.fn(), onLoadPointGroupVisibilityChange: vi.fn(),
    onExplorerVisibilityChange: vi.fn(), onPropertiesVisibilityChange: vi.fn(), onOpenTaskPanel: vi.fn() };
}
function openView() { fireEvent.click(screen.getByRole("button", { name: t("tabs.view") })); }

test("view toggles send independent visibility changes", () => {
  const p = props(); render(<Ribbon {...p} />); openView();
  for (const [key, callback, value] of [
    ["view.showGrid", p.onGridVisibilityChange, true], ["view.showGroups", p.onLoadPointGroupVisibilityChange, true],
    ["view.hideExplorer", p.onExplorerVisibilityChange, false], ["view.showProperties", p.onPropertiesVisibilityChange, true],
  ] as const) {
    fireEvent.click(screen.getByRole("button", { name: t(key) })); expect(callback).toHaveBeenCalledWith(value);
  }
});

test("utilization changes stay local until pointer or keyboard completion and cannot cross handles", () => {
  const p = props(); render(<Ribbon {...p} />); openView();
  const minimum = screen.getByRole("slider", { name: t("view.minimumUtilization") });
  const maximum = screen.getByRole("slider", { name: t("view.maximumUtilization") });
  fireEvent.change(minimum, { target: { value: "60" } }); expect(p.onViewerUtilizationRangeChange).not.toHaveBeenCalled();
  fireEvent.pointerUp(minimum); expect(p.onViewerUtilizationRangeChange).toHaveBeenLastCalledWith(0.6, 0.9);
  fireEvent.change(maximum, { target: { value: "40" } }); fireEvent.keyUp(maximum, { key: "ArrowLeft" });
  expect(p.onViewerUtilizationRangeChange).toHaveBeenLastCalledWith(0.6, 0.6);
});

test("symbol scale gestures have one keyboard start and finish on key release, pointer cancel, or blur", () => {
  const p = props(); render(<Ribbon {...p} />); openView();
  const slider = screen.getAllByRole("slider")[0];
  fireEvent.keyDown(slider, { key: "ArrowRight" }); fireEvent.keyDown(slider, { key: "ArrowRight", repeat: true });
  fireEvent.change(slider, { target: { value: "120" } });
  expect(p.onSymbolScaleChangeStart).toHaveBeenCalledOnce(); expect(p.onSymbolScaleChange).toHaveBeenCalledWith(120);
  fireEvent.keyUp(slider, { key: "ArrowRight" }); expect(p.onSymbolScaleChangeEnd).toHaveBeenCalledOnce();
  fireEvent.pointerDown(slider); fireEvent.pointerCancel(slider); expect(p.onSymbolScaleChangeEnd).toHaveBeenCalledTimes(2);
  fireEvent.keyDown(slider, { key: "ArrowLeft" }); fireEvent.blur(slider); expect(p.onSymbolScaleChangeEnd).toHaveBeenCalledTimes(3);
});

test("optimization and lock draft controls route to their callbacks", () => {
  const p = props(); const view = render(<Ribbon {...p} />);
  fireEvent.click(screen.getByRole("button", { name: t("ilp.run") })); expect(p.onOpenTaskPanel).toHaveBeenCalledWith("ilp-optimization");
  fireEvent.click(screen.getByRole("button", { name: t("plan.editLocks") })); expect(p.onStartLockEditing).toHaveBeenCalledOnce();
  view.rerender(<Ribbon {...p} isLockEditing />);
  for (const [key, callback] of [["plan.applyLocks", p.onApplyLockEditing], ["plan.cancelLocks", p.onCancelLockEditing], ["plan.unlockAll", p.onUnlockAll]] as const) {
    fireEvent.click(screen.getByRole("button", { name: t(key) })); expect(callback).toHaveBeenCalledOnce();
  }
});
