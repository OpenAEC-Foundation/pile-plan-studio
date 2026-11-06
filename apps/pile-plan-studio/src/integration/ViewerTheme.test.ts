import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildLoadPointGroupSvgModel } from "../components/domain/pile-plan-viewer/load-point-groups/loadPointGroupSvgModel.ts";

describe("viewer theme surfaces", () => {
  it("keeps selected CPTs the same viewer-owned orange as selected load-point groups", () => {
    const styles = readFileSync(resolve(import.meta.dirname, "../components/domain/pile-plan-viewer/viewer.css"), "utf8");
    const group = buildLoadPointGroupSvgModel([]).filters.find(filter => filter.id === "load-point-group-outline-selected");
    const selectionColor = styles.match(/--viewer-selection-color:\s*(#[\da-f]+)/i)?.[1];
    assert.equal(selectionColor, group?.color);
    assert.match(styles, /--cpt-selected-stroke:\s*var\(--viewer-selection-color\)/);
    assert.match(styles, /--cpt-selected-fill:\s*color-mix\([^;]*--viewer-selection-color/);
  });
  it("uses the separate Blueprint workspace role for the drawing canvas", () => {
    const styles = readFileSync(resolve(import.meta.dirname, "../components/domain/pile-plan-viewer/viewer.css"), "utf8");

    assert.match(styles, /\.pile-plan-workspace\s*{[\s\S]*?background:\s*var\(--theme-bg\)/);
    assert.match(styles, /\.viewer-canvas\s*{[^}]*?background:\s*var\(--oa-workspace\)/);
    assert.match(styles, /\.viewer-coordinate-grid\s*{[^}]*?color:[^;]*var\(--oa-workspace-text\)/);
  });

  it("keeps CPT numbers legible on both workspace backgrounds without moving their geometry", () => {
    const styles = readFileSync(resolve(import.meta.dirname, "../components/domain/pile-plan-viewer/viewer.css"), "utf8");
    const label = styles.match(/\.viewer-cpt-label\s*\{([^}]*)\}/)?.[1] ?? "";
    assert.match(label, /fill:\s*var\(--cpt-label-text\)/);
    assert.match(label, /paint-order:\s*stroke fill/);
    assert.match(label, /stroke:\s*var\(--cpt-label-surface/);
    assert.match(styles, /--cpt-label-text:\s*var\(--oa-workspace-text\)/);
    assert.match(styles, /--cpt-default-fill:\s*color-mix\([^;]*--oa-workspace/);
  });
});
