import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("legend editor", () => {
  it("renders a complete draft-based project legend editor", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendEditor.tsx"), "utf8");

    assert.match(source, /<Modal/);
    assert.match(source, /createLegendEditorDraft/);
    assert.match(source, /applyLegendEditorBulkAction/);
    assert.match(source, /setLegendEncodingMode/);
    assert.doesNotMatch(source, /setLegendAssignmentScope/);
    assert.match(source, /unionActivationForPlans/);
    assert.match(source, /unionUsedConfigurationsForPlans/);
    assert.match(source, /applyAutomaticSymbols/);
    assert.match(source, /applyAutomaticColors/);
    assert.match(source, /resetLegendEditorAppearance/);
    assert.match(source, /LegendSymbolPicker/);
    assert.match(source, /LegendColorPicker/);
    assert.match(source, /LegendColorSchemeSelect/);
    assert.match(source, /legend-editor-enabled/);
    assert.match(source, /legend-editor-disabled/);
    assert.match(source, /onApply\(draft\)/);
  });

  it("keeps appearance and activation as separate controls", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendEditor.tsx"), "utf8");

    assert.match(source, /setLegendEditorItemEnabled/);
    assert.doesNotMatch(source, /toggleLegendEditorItem/);
    assert.match(source, /legend-editor-activation-button/);
    assert.doesNotMatch(source, /isDisabled \? null : \(\s*<AppearanceControl/);
    assert.match(source, /<AppearanceControl/);
    assert.match(source, /disabled-used/);
    assert.match(source, /legend\.usedWarning/);
  });

  it("keeps picker-owning rows stable while the draft changes", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendEditor.tsx"), "utf8");
    const componentBody = source.slice(
      source.indexOf("export default function LegendEditor"),
      source.indexOf("type EditorSectionProps"),
    );

    assert.doesNotMatch(componentBody, /function EditorSection/);
    assert.doesNotMatch(componentBody, /function EditorBlock/);
    assert.doesNotMatch(componentBody, /function EditorItemRow/);
    assert.match(source, /^function EditorItemRow/m);
  });

  it("shows encoding, assignment, validation, and reset copy", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendEditor.tsx"), "utf8");

    assert.match(source, /legend\.symbol/);
    assert.match(source, /legend\.color/);
    assert.match(source, /legend\.swapEncoding/);
    assert.doesNotMatch(source, /legend\.colorRepresentsTip/);
    assert.doesNotMatch(source, /legend\.colorRepresentsSize/);
    assert.match(source, /legend\.pilePlansInScope/);
    assert.match(source, /scopePlanIds/);
    assert.match(source, /legend\.assignSymbols/);
    assert.match(source, /legend\.assignColors/);
    assert.match(source, /legend\.symbolLimit/);
    assert.match(source, /legend\.resetAppearance/);
    assert.match(source, /applyEditorActionResult/);
    assert.match(source, /draft\.legend\.colorScheme/);
    assert.doesNotMatch(source, /draft\.colorScheme/);
  });

  it("shows cross-plan counts and co-active conflicts", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendEditor.tsx"), "utf8");

    assert.match(source, /otherActivePlanNames/);
    assert.match(source, /legend-editor-plan-count/);
    assert.match(source, /\+\{item\.otherPlanNames\.length\}/);
    assert.match(source, /findCoactiveLegendConflicts/);
    assert.match(source, /legend\.coactiveConflict/);
  });

  it("uses the normal legend only for selection and opens editing separately", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Legend.tsx"), "utf8");

    assert.doesNotMatch(source, /toggleActivePileConfiguration/);
    assert.match(source, /replaceLegendSelectionFilter/);
    assert.match(source, /event\.shiftKey/);
    assert.match(source, /onEdit/);
    assert.match(source, /disabled-unused/);
    assert.match(source, /is-disabled-used/);
  });

  it("offers a quick action that enables only configurations used by the active plan", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Legend.tsx"), "utf8");

    assert.match(source, /function enableUsedOnly/);
    assert.match(source, /replacePilePlanActivation\(state\.pilePlans, state\.activePilePlanId, used\)/);
    assert.match(source, /legend\.enableUsed/);
    assert.match(source, /filterCheckIcon/);
  });

  it("styles normal and editor states without relying on color alone", () => {
    const viewerCss = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");
    const editorCss = readFileSync(resolve(import.meta.dirname, "LegendEditor.css"), "utf8");

    const normalUnusedRule = viewerCss.match(/\.legend-item\.is-unused\s*\{([^}]*)\}/);

    assert.ok(normalUnusedRule);
    assert.match(normalUnusedRule[1], /opacity:\s*0\.[0-9]+/);
    assert.match(viewerCss, /\.legend-item\.is-disabled-used/);
    assert.match(viewerCss, /text-decoration:\s*line-through/);
    assert.doesNotMatch(editorCss, /\.legend-editor-item\.is-unused\s*\{[^}]*opacity:/s);
    assert.match(
      editorCss,
      /\.legend-editor-item\.is-unused\s+\.legend-editor-item-label\s*\{[^}]*color:\s*var\(--theme-text-muted\)/s,
    );
    assert.match(editorCss, /\.legend-editor-warning/);
    assert.match(editorCss, /minmax\(0,\s*1\.85fr\)\s+minmax\(12rem,\s*1fr\)/);
    assert.match(editorCss, /@media \(max-width:\s*760px\)/);
  });

  it("uses neutral shape previews and theme-aware partial fills", () => {
    const editor = readFileSync(resolve(import.meta.dirname, "LegendEditor.tsx"), "utf8");
    const legend = readFileSync(resolve(import.meta.dirname, "Legend.tsx"), "utf8");
    const viewerCss = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(editor, /NEUTRAL_SYMBOL_PREVIEW_COLOR\s*=\s*"#6F7B82"/);
    assert.match(editor, /color=\{NEUTRAL_SYMBOL_PREVIEW_COLOR\}/);
    assert.match(legend, /outlineColor:\s*"currentColor"/);
    assert.match(legend, /neutralFill:\s*"var\(--theme-bg\)"/);
    assert.doesNotMatch(viewerCss, /\.legend-symbol \.pile-symbol-svg :is\(circle, rect, polygon\)/);
  });

  it("uses stable reassignment controls and disables actions that would have no effect", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendEditor.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "LegendEditor.css"), "utf8");
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../i18n/locales/nl/common.json"), "utf8"));
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../i18n/locales/en/common.json"), "utf8"));

    assert.match(source, /wouldReassignLegendAppearance/);
    assert.match(source, /disabled=\{!canReassignSymbols\}/);
    assert.match(source, /disabled=\{!canReassignColors\}/);
    assert.doesNotMatch(source, /is-pending/);
    assert.match(source, /legend-editor-auto-actions/);
    assert.match(source, /legend-editor-color-action/);
    assert.match(css, /\.legend-editor-auto-actions\s*\{[^}]*grid-template-columns:/s);
    assert.match(css, /\.legend-editor-auto-actions \.legend-editor-toolbar-button\s*\{[^}]*white-space:\s*nowrap/s);
    assert.match(css, /\.legend-scheme-options\s*\{[^}]*right:\s*0[^}]*left:\s*auto[^}]*max-width:/s);
    assert.match(css, /\.legend-editor-toolbar-button:disabled\s*\{[^}]*opacity:/s);
    assert.doesNotMatch(css, /\.legend-editor-toolbar-button\.is-pending/);
    assert.equal(nl.legend.assignSymbols, "Symbolen opnieuw toewijzen");
    assert.equal(nl.legend.assignColors, "Kleuren opnieuw toewijzen");
    assert.equal(en.legend.assignSymbols, "Reassign symbols");
    assert.equal(en.legend.assignColors, "Reassign colors");
    assert.equal(nl.legend.pilePlansInScope, "Palenplannen in bereik");
    assert.equal(en.legend.pilePlansInScope, "Pile plans in scope");
  });

  it("uses compact dialog geometry consistent with the application controls", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendEditor.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "LegendEditor.css"), "utf8");

    assert.match(source, /height="min\(680px, 84vh\)"/);
    assert.match(source, /width=\{760\}/);
    assert.match(css, /\.legend-editor\s*\{[\s\S]*?font-size:\s*11px/);
    assert.match(source, /className="settings-btn settings-btn-secondary"/);
    assert.match(source, /className="settings-btn settings-btn-primary"/);
    assert.match(source, /legend-editor-control-row/);
    assert.match(source, /legend-editor-encoding-line/);
    assert.match(source, /legend-editor-encoding-swap/);
    assert.match(css, /\.legend-editor-control-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.legend-editor-auto-actions\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(190px, 1\.25fr\) minmax\(0, 1\.1fr\)/);
    assert.match(css, /\.legend-editor-color-action\s*\{[\s\S]*?display:\s*contents/);
    assert.match(css, /\.legend-appearance-trigger,[\s\S]*?\.legend-scheme-trigger\s*\{[\s\S]*?min-height:\s*24px/);
    assert.match(css, /\.legend-scheme-trigger,[\s\S]*?\.legend-scheme-options\s*\{[\s\S]*?font:\s*inherit/);
    assert.match(css, /\.legend-editor-segmented button\s*\{[\s\S]*?min-height:\s*24px/);
  });
});
