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
    assert.match(source, /setLegendAssignmentScope/);
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
    assert.match(source, /isDisabled \? null : \(\s*<AppearanceControl/);
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

    assert.match(source, /legend\.symbolRepresents/);
    assert.match(source, /legend\.colorRepresentsTip/);
    assert.match(source, /legend\.colorRepresentsSize/);
    assert.match(source, /legend\.assignmentScope/);
    assert.match(source, /legend\.assignSymbols/);
    assert.match(source, /legend\.assignColors/);
    assert.match(source, /legend\.symbolLimit/);
    assert.match(source, /legend\.resetAppearance/);
    assert.match(source, /applyEditorActionResult/);
    assert.match(source, /draft\.legend\.colorScheme/);
    assert.doesNotMatch(source, /draft\.colorScheme/);
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
    assert.match(source, /activePileSizes:\s*\[\.\.\.used\.pileSizes\]/);
    assert.match(source, /activePileTipLevels:\s*\[\.\.\.used\.pileTipLevels\]/);
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

  it("uses stable reassignment controls and disables actions without manual overrides", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendEditor.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "LegendEditor.css"), "utf8");
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../i18n/locales/nl/common.json"), "utf8"));
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../i18n/locales/en/common.json"), "utf8"));

    assert.match(source, /hasManualLegendOverrides/);
    assert.match(source, /disabled=\{!symbolHasManualOverrides\}/);
    assert.match(source, /disabled=\{!colorHasManualOverrides\}/);
    assert.doesNotMatch(source, /is-pending/);
    assert.match(source, /legend-editor-auto-action-row/);
    assert.match(source, /legend-editor-auto-action-row is-color/);
    assert.match(css, /\.legend-editor-auto-action-row\s*\{[^}]*grid-template-columns:/s);
    assert.match(css, /\.legend-editor-auto-action-row > \.legend-editor-toolbar-button\s*\{[^}]*white-space:\s*nowrap/s);
    assert.match(css, /\.legend-editor-auto-action-row\.is-reset > \.legend-editor-toolbar-button\s*\{[^}]*grid-column:\s*1/s);
    assert.match(css, /\.legend-scheme-options\s*\{[^}]*right:\s*0[^}]*left:\s*auto[^}]*max-width:/s);
    assert.match(css, /\.legend-editor-toolbar-button:disabled\s*\{[^}]*opacity:/s);
    assert.doesNotMatch(css, /\.legend-editor-toolbar-button\.is-pending/);
    assert.equal(nl.legend.assignSymbols, "Symbolen opnieuw toewijzen");
    assert.equal(nl.legend.assignColors, "Kleuren opnieuw toewijzen");
    assert.equal(en.legend.assignSymbols, "Reassign symbols");
    assert.equal(en.legend.assignColors, "Reassign colors");
  });
});
