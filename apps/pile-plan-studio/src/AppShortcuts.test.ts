import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "app/session/AppSession.tsx"), "utf8");

describe("App save and interface shortcuts", () => {

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

});
