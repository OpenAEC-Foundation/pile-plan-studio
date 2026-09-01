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

  it("shares viewer selection with the source data tables", () => {
    assert.match(source, /clearReactViewerSelection/);
    assert.match(source, /openReactViewerCpt/);
    assert.match(source, /setReactViewerLoadPoints/);
    assert.match(source, /addReactViewerLoadPoints/);
    assert.match(source, /toggleReactViewerLoadPoint/);
    assert.match(source, /selectedLoadPointId=\{projectState\.selectedLoadPointId\}/);
    assert.match(source, /selectedLoadPointIds=\{projectState\.selectedLoadPointIds\}/);
    assert.match(source, /selectedCptId=\{projectState\.selectedCptId\}/);
    assert.match(source, /lockedLoadPointIds=\{activeLockedLoadPointIdSet\}/);
    assert.match(source, /onSelectLoadPoints=\{handleSourceLoadPointSelection\}/);
    assert.match(source, /onSelectCpt=\{handleSourceCptSelection\}/);
    assert.match(source, /onClearSelection=\{clearSourceSelection\}/);
  });

  it("loads, applies, and persists desktop interface scale", () => {
    assert.match(source, /createPlatformUserSettingsStore/);
    assert.match(source, /loadUserSettings/);
    assert.match(source, /applyDesktopInterfaceScale/);
    assert.match(source, /saveUserSettings/);
    assert.match(source, /stepInterfaceScale/);
    assert.match(source, /DEFAULT_INTERFACE_SCALE/);
  });

  it("shows logical application scale feedback from desktop zoom shortcuts", () => {
    assert.match(source, /<InterfaceScaleNotice/);
    assert.match(source, /const applyInterfaceScale = useCallback/);
    assert.match(source, /setInterfaceScaleNotice\(\{[\s\S]*?percent: normalizedScale,[\s\S]*?\}\)/);
    assert.match(source, /action === "zoom-reset"/);
    assert.match(source, /onDecrease=\{\(\) => applyInterfaceScale/);
    assert.match(source, /onIncrease=\{\(\) => applyInterfaceScale/);
    assert.match(source, /onReset=\{\(\) => applyInterfaceScale\(DEFAULT_INTERFACE_SCALE\)\}/);
  });

  it("releases pointer focus so modifier keys remain available for viewer selection", () => {
    assert.match(source, /function releasePointerActivatedControlFocus/);
    assert.match(source, /POINTER_FOCUS_CONTROL_SELECTOR = "button, \[role='option'\], \[role='tab'\], \[role='row'\]\[tabindex='0'\]"/);
    assert.match(source, /target\.closest<HTMLElement>\(POINTER_FOCUS_CONTROL_SELECTOR\)/);
    assert.match(source, /control\.blur\(\)/);
    assert.match(source, /className="app-shell"[\s\S]*?onPointerUpCapture=\{releasePointerActivatedControlFocus\}/);
  });
});
