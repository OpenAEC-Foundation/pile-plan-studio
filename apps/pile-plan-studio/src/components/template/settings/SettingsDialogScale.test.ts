import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "SettingsDialog.tsx"), "utf8");
const english = readFileSync(resolve(import.meta.dirname, "../../../i18n/locales/en/settings.json"), "utf8");
const dutch = readFileSync(resolve(import.meta.dirname, "../../../i18n/locales/nl/settings.json"), "utf8");

describe("SettingsDialog interface scale", () => {
  it("shows a desktop-only 50 to 150 percent appearance control", () => {
    assert.match(source, /isDesktop/);
    assert.match(source, /MIN_INTERFACE_SCALE/);
    assert.match(source, /MAX_INTERFACE_SCALE/);
    assert.match(source, /INTERFACE_SCALE_STEP/);
    assert.match(source, /type="range"/);
    assert.match(source, /interfaceScalePercent/);
  });

  it("previews draft changes and restores or commits them through dialog actions", () => {
    assert.match(source, /draftInterfaceScale/);
    assert.match(source, /originalInterfaceScale/);
    assert.match(source, /onInterfaceScalePreview/);
    assert.match(source, /onPreferencesChange/);
  });

  it("edits language and default currency through the unified settings contract", () => {
    assert.doesNotMatch(source, /getSetting|setSetting/);
    assert.match(source, /language/);
    assert.match(source, /defaultCurrencyCode/);
    assert.match(source, /onPreferencesChange/);
    assert.match(english, /Default currency/);
    assert.match(dutch, /Standaardvaluta/);
  });

  it("documents the unshifted equals-key zoom shortcut", () => {
    assert.match(english, /Ctrl\+=/);
    assert.match(dutch, /Ctrl\+=/);
    assert.doesNotMatch(english, /Ctrl\+\+/);
    assert.doesNotMatch(dutch, /Ctrl\+\+/);
  });
});
