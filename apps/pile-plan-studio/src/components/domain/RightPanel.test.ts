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

describe("React CPT settings panel", () => {
  it("keeps settings available without a selection and exposes all or selected scope", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.doesNotMatch(panel, /cptSettingsScope\s*(?:===|:)\s*"current"/);
    assert.doesNotMatch(panel, /const loadPoint = state\.loadPoints\.find\(.*selectedLoadPointId/s);
    assert.doesNotMatch(panel, /empty\.selectLoadPointForCpts/);
    assert.match(panel, /settingsScope === "selected"/);
    assert.match(panel, /selectedLoadPoints\.length === 0 \? "all" : state\.cptSettingsScope/);
    assert.match(panel, /t\("cptSettings\.allLoadPoints"\)/);
    assert.match(panel, /t\("cptSettings\.selectedLoadPoints"\)/);
    assert.match(panel, /disabled=\{selectedLoadPoints\.length === 0\}/);
    assert.match(panel, /t\("cptSettings\.selectedCount", \{ count: selectedLoadPoints\.length \}\)/);
    assert.match(panel, /const settingsLoadPoints = selectedLoadPoints/);
    assert.doesNotMatch(panel, /cptSettings\.thisLoadPoint/);
  });

  it("uses aggregate values, mixed placeholders, and field-level settings patches", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /getCptSelectionSettingsAggregate\(state\)/);
    assert.match(panel, /value=\{settings\.maxDistanceM \?\? ""\}/);
    assert.match(panel, /value=\{settings\.monopolyDistanceM \?\? ""\}/);
    assert.match(panel, /value=\{settings\.maxAngleDegrees \?\? ""\}/);
    assert.match(panel, /placeholder=\{settings\.maxDistanceM === null \? t\("cptSettings\.mixed"\) : undefined\}/);
    assert.match(panel, /placeholder=\{settings\.monopolyDistanceM === null \? t\("cptSettings\.mixed"\) : undefined\}/);
    assert.match(panel, /placeholder=\{settings\.maxAngleDegrees === null \? t\("cptSettings\.mixed"\) : undefined\}/);
    assert.match(panel, /applyCptSelectionSettingsPatch\(state, \{ maxDistanceM:[\s\S]*?\}, overwriteManualSelections\)/);
    assert.match(panel, /applyCptSelectionSettingsPatch\(state, \{ monopolyDistanceM:[\s\S]*?\}, overwriteManualSelections\)/);
    assert.match(panel, /applyCptSelectionSettingsPatch\(state, \{ algorithm: "quadrants" \}, overwriteManualSelections\)/);
    assert.match(panel, /applyCptSelectionSettingsPatch\(state, \{ algorithm: "maximum-angle" \}, overwriteManualSelections\)/);
    assert.match(panel, /applyCptSelectionSettingsPatch\(state, \{\s*maxAngleDegrees:[\s\S]*?\}, overwriteManualSelections\)/);
    assert.doesNotMatch(panel, /applyCptSelectionSettings\(/);
  });

  it("places monopoly distance and overwrite control in the settings flow", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /const \[overwriteManualSelections, setOverwriteManualSelections\] = useState\(false\)/);
    assert.match(panel, /checked=\{overwriteManualSelections\}[\s\S]*type="checkbox"[\s\S]*setOverwriteManualSelections/);
    assert.match(panel, /t\("cptSettings\.overwriteManualSelections"\)/);
    assert.match(panel, /cptSettings\.maxDistance[\s\S]*cptSettings\.monopolyDistance/);
    assert.match(panel, /aria-label=\{t\("cptSettings\.monopolyDistance"\)\}[\s\S]*min="0"/);
  });

  it("keeps mixed algorithms unselected and maximum angle editable until a concrete alternative is common", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /active=\{settings\.algorithm === "quadrants"\}/);
    assert.match(panel, /active=\{settings\.algorithm === "maximum-angle"\}/);
    assert.match(panel, /disabled=\{settings\.algorithm !== null && settings\.algorithm !== "maximum-angle"\}/);
  });

  it("routes Modify selection into the shared CPT panel edit mode", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /startManualCptSelectionEdit\(state\)/);
    assert.match(panel, /t\("actions\.modifySelection"\)/);
    assert.match(panel, /className="settings-modify-button"[\s\S]*disabled=\{selectedLoadPoints\.length === 0\}/);
    assert.doesNotMatch(panel, /draft\.cptIds/);
  });
});

describe("React CPT panel edit mode", () => {
  it("keeps Modify available, disables it without a selection, and presents draft controls", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /t\("actions\.modify"\)/);
    assert.match(panel, /disabled=\{selectedLoadPoints\.length === 0\}/);
    assert.match(panel, /selectOnlyNearestCpts\(state\)/);
    assert.match(panel, /saveManualCptSelection\(state\)/);
    assert.match(panel, /cancelManualCptSelection\(state\)/);
    assert.match(panel, /draft\.loadPointIds\.includes\(loadPoint\.id\)/);
  });

  it("uses icon-only remove controls in edit mode and preserves normal CPT inspection links", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");
    const icons = readFileSync(resolve(import.meta.dirname, "../template/ribbon/icons.ts"), "utf8");

    assert.match(icons, /export const removeIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">/);
    assert.match(panel, /import \{ removeIcon \} from "\.\.\/template\/ribbon\/icons\.ts"/);
    assert.match(panel, /className="cpt-remove-button"/);
    assert.match(panel, /aria-label=\{t\("actions\.removeCpt"/);
    assert.match(panel, /dangerouslySetInnerHTML=\{\{ __html: removeIcon \}\}/);
    assert.match(panel, /removeManualCpt\(state, row\.cpt\.id\)/);
    assert.match(panel, /className="cpt-link"/);
    assert.match(panel, /openCpt\(state, row\.cpt\.id\)/);
  });
});
