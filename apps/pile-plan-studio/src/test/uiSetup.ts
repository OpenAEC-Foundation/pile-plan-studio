import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import i18n from "../i18n/config.ts";

// jsdom does not implement PointerEvent; these tests need its mouse button fields.
Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
// jsdom has dialog elements but no modal lifecycle or top-layer implementation.
// Browser verification covers focus, inert background and Escape dispatch.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
}
beforeEach(async () => {
  await i18n.changeLanguage("en");
  // jsdom has no raster canvas; projection and grid geometry have separate tests.
  vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue(null);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({addEventListener() {}, removeEventListener() {}}));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
