import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("React optimization panel", () => {
  it("defers numeric optimization limits until blur or Enter", () => {
    const optimization = readFileSync(resolve(import.meta.dirname, "OptimizationPanel.tsx"), "utf8");

    assert.match(optimization, /useState\(String\(value\)\)/);
    assert.match(optimization, /onChange=\{\(event\) => setDraft\(event\.currentTarget\.value\)\}/);
    assert.match(optimization, /onBlur=\{commit\}/);
    assert.match(optimization, /event\.key === "Enter"/);
    assert.match(optimization, /min=\{1\}[\s\S]*updateLimit\("sizes"/);
    assert.match(optimization, /min=\{0\}[\s\S]*updateMaxUtilization/);
    assert.doesNotMatch(optimization, /onChange=\{\(event\) => onChange\(Number\(event\.currentTarget\.value\)\)\}/);
  });

  it("does not refocus a numeric field when the empty part of its row is clicked", () => {
    const optimization = readFileSync(resolve(import.meta.dirname, "OptimizationPanel.tsx"), "utf8");
    const styles = readFileSync(resolve(import.meta.dirname, "rightPanel.css"), "utf8");

    assert.match(optimization, /<div\s+className="optimization-number"/);
    assert.match(optimization, /<label htmlFor=\{inputId\}>\{label\}<\/label>/);
    assert.match(optimization, /id=\{inputId\}/);
    assert.doesNotMatch(optimization, /<label className="optimization-number">/);
    assert.match(optimization, /if \(event\.target === event\.currentTarget\) inputRef\.current\?\.blur\(\);/);
    assert.match(styles, /\.optimization-number > label\s*\{[^}]*justify-self:\s*start;/s);
  });

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
    assert.match(optimization, /optimizationCreatesPilePlan/);
    assert.match(optimization, /t\("optimization\.saveAsNewPilePlan"\)/);
    assert.match(optimization, /type="number"/);
    assert.match(optimization, /max_utilization: value \/ 100/);
    assert.doesNotMatch(optimization, /type="range"/);
    assert.ok(
      optimization.indexOf('t("optimization.performanceLimit")')
        < optimization.indexOf("optimizationCreatesPilePlan"),
      "utilization limit should appear before the save-as-new-plan option",
    );
    assert.match(optimization, /optimizationSummary/);
    assert.match(optimization, /optimizationError/);
  });

  it("does not mark a permanent panel tab active while the optimization task is open", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /active=\{taskPanel === null\}/);
    assert.match(panel, /active && state\.rightPanelMode === mode/);
  });

  it("closes a task panel when a permanent inspection tab is activated", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /<PanelTab[\s\S]*?onActivate=\{onCloseTaskPanel\}/);
    assert.match(panel, /onActivate\(\);[\s\S]*?switchRightPanelMode\(state, mode\)/);
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
    const english = readFileSync(resolve(import.meta.dirname, "../../i18n/locales/en/rightPanel.json"), "utf8");
    assert.match(english, /"optimization\.performanceLimit": "Utilization limit"/);
  });

  it("keeps only inspection views as permanent tabs", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /mode="load-point"/);
    assert.match(panel, /mode="cpts"/);
    assert.doesNotMatch(panel, /mode="cpt-settings"/);
    assert.doesNotMatch(panel, /mode="cost-settings"/);
    assert.match(panel, /taskPanel === "cpt-settings"/);
    assert.match(panel, /taskPanel === "cost-settings"/);
  });
});

describe("React cost settings panel", () => {
  it("keeps edited pile costs inside the current project", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.doesNotMatch(panel, /PILE_COST_DEFAULTS_KEY/);
    assert.doesNotMatch(panel, /setSetting\(/);
    assert.match(panel, /onStateChange\(\{ \.\.\.state, pileCostSettings: nextSettings \}\)/);
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
    assert.match(panel, /value=\{settings\.maxDistanceM\}/);
    assert.match(panel, /value=\{settings\.monopolyDistanceM\}/);
    assert.match(panel, /value=\{settings\.maxAngleDegrees\}/);
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
    assert.match(panel, /ariaLabel=\{t\("cptSettings\.monopolyDistance"\)\}[\s\S]*min=\{0\}/);
  });

  it("defers pile head level and CPT number changes until blur or Enter", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /function DraftNumberField/);
    assert.match(panel, /const \[draft, setDraft\] = useState/);
    assert.match(panel, /onBlur=\{commit\}/);
    assert.match(panel, /if \(event\.key === "Enter"\) event\.currentTarget\.blur\(\)/);
    assert.match(panel, /value=\{state\.pileCostSettings\.pile_head_level_m\}/);
    assert.match(panel, /onCommit=\{\(value\) => applySettings\(updatePileHeadLevel/);
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
