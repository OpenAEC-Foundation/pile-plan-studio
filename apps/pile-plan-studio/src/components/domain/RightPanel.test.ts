import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("React optimization panel", () => {
  it("provides a closable task panel outside the permanent context tabs", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");
    const optimization = readFileSync(resolve(import.meta.dirname, "OptimizationPanel.tsx"), "utf8");

    assert.doesNotMatch(panel, /PanelTab label="Optimization"/);
    assert.match(panel, /taskPanel === "optimization"/);
    assert.match(panel, /onCloseTaskPanel/);
    assert.match(optimization, /t\("optimization\.close"\)/);
    assert.match(optimization, /t\("optimization\.description"\)/);
    assert.match(optimization, /t\("optimization\.maxSizes"\)/);
    assert.match(optimization, /t\("optimization\.maxTips"\)/);
    assert.match(optimization, /t\("optimization\.maxConfigurations"\)/);
    assert.match(optimization, /t\("optimization\.run"\)/);
    assert.match(optimization, /optimizationSummary/);
    assert.match(optimization, /optimizationError/);
  });

  it("does not mark a permanent panel tab active while the optimization task is open", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /active=\{taskPanel === null\}/);
    assert.match(panel, /active && state\.rightPanelMode === mode/);
  });

  it("uses the shared right-panel translations", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");
    const optimization = readFileSync(resolve(import.meta.dirname, "OptimizationPanel.tsx"), "utf8");
    const config = readFileSync(resolve(import.meta.dirname, "../../i18n/config.ts"), "utf8");

    assert.match(panel, /useTranslation\("rightPanel"\)/);
    assert.match(optimization, /useTranslation\("rightPanel"\)/);
    assert.match(config, /enRightPanel/);
    assert.match(config, /nlRightPanel/);
    assert.match(config, /"rightPanel"/);
  });
});
