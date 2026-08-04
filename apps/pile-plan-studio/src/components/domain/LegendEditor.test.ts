import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("legend editor", () => {
  it("renders a draft-based project legend editor", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendEditor.tsx"), "utf8");

    assert.match(source, /<Modal/);
    assert.match(source, /createLegendEditorDraft/);
    assert.match(source, /applyLegendEditorBulkAction/);
    assert.match(source, /legend-editor-enabled/);
    assert.match(source, /legend-editor-disabled/);
    assert.match(source, /onApply\(draft\)/);
  });

  it("uses text-only disabled items and warns when one remains used", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendEditor.tsx"), "utf8");

    assert.match(source, /isDisabled/);
    assert.match(source, /!isDisabled && item\.shape/);
    assert.match(source, /!isDisabled && item\.color/);
    assert.match(source, /disabled-used/);
    assert.match(source, /legend\.usedWarning/);
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

  it("styles normal and editor states without relying on color alone", () => {
    const viewerCss = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");
    const editorCss = readFileSync(resolve(import.meta.dirname, "LegendEditor.css"), "utf8");

    assert.match(viewerCss, /\.legend-item\.is-unused/);
    assert.match(viewerCss, /\.legend-item\.is-disabled-used/);
    assert.match(viewerCss, /text-decoration:\s*line-through/);
    assert.match(editorCss, /\.legend-editor-item\.is-unused/);
    assert.match(editorCss, /\.legend-editor-warning/);
  });
});
