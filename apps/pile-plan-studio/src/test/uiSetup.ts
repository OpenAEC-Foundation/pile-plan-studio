import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import i18n from "../i18n/config.ts";

// jsdom does not implement PointerEvent; these tests need its mouse button fields.
Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
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
