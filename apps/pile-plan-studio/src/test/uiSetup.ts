import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import i18n from "../i18n/config.ts";

// jsdom does not implement PointerEvent; these tests need its mouse button fields.
Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
beforeEach(async () => { await i18n.changeLanguage("en"); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
