import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

describe("App save and interface shortcuts", () => {
  it("routes one global shortcut handler through the existing project action", () => {
    const handler = source.match(/const handleAppShortcut[\s\S]*?window\.addEventListener\("keydown", handleAppShortcut\)/)?.[0] ?? "";
    assert.match(source, /classifyAppShortcut\(event, isDesktop\)/);
    assert.match(source, /event\.preventDefault\(\)/);
    assert.match(source, /projectActionRef\.current/);
    assert.match(source, /openProjectActionRef\.current/);
    assert.match(source, /saveShortcutInFlightRef/);
    assert.doesNotMatch(handler, /isEditableTarget\(event\.target\)/);
  });

  it("loads, applies, and persists desktop interface scale", () => {
    assert.match(source, /createPlatformUserSettingsStore/);
    assert.match(source, /loadUserSettings/);
    assert.match(source, /applyDesktopInterfaceScale/);
    assert.match(source, /saveUserSettings/);
    assert.match(source, /stepInterfaceScale/);
    assert.match(source, /DEFAULT_INTERFACE_SCALE/);
  });
});
