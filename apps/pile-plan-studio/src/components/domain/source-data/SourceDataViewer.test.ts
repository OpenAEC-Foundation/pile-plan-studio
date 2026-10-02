import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("source data viewer", () => {
  const source = readFileSync(resolve(import.meta.dirname, "SourceDataViewer.tsx"), "utf8");
  const styles = readFileSync(resolve(import.meta.dirname, "../../../App.css"), "utf8");

  it("keeps source provenance visible", () => {
    assert.match(source, /source\.fileName/);
    assert.match(source, /source\.profile/);
    assert.match(source, /source\.warnings/);
  });

  it("uses the shared adaptive formatter for foundation-advice tip levels", () => {
    assert.match(source, /formatPileTipLevelMetres/);
    assert.match(source, /source\.kind === "bearing_capacities" && columnKey === "tip"/);
  });

  it("keeps the header and data rows in the same scrollbar viewport", () => {
    assert.match(source, /className="source-table-scroll"[\s\S]*className="source-table-heading"/);
    assert.match(source, /className="source-table-body"/);
  });

  it("marks selected rows and leaves foundation advice non-selectable", () => {
    assert.match(source, /source\.kind !== "bearing_capacities"/);
    assert.match(source, /aria-selected=\{isSelectable \? isSelected : undefined\}/);
    assert.match(source, /is-selected/);
    assert.match(source, /tabIndex=\{isSelectable && !isDisabled \? 0 : undefined\}/);
    assert.match(styles, /\.source-table-row\.is-selected\s*\{[\s\S]*?box-shadow:/);
    assert.match(styles, /\.source-table-row\.is-selectable\s*\{[\s\S]*?user-select:\s*none/);
  });

  it("reveals the primary matching selection without changing table filters", () => {
    assert.match(source, /selectedLoadPointId: number \| null/);
    assert.match(source, /const primarySelectedRowId = source\.kind === "load_points"/);
    assert.match(source, /rows\.findIndex\(\(row\) => row\.id === primarySelectedRowId\)/);
    assert.match(source, /scrollElement\.scrollTop = nextScrollTop/);
    assert.match(source, /setScrollTop\(nextScrollTop\)/);
  });

  it("opens the first column filter toward the inside of the viewer", () => {
    assert.match(source, /source-table-column\$\{columnIndex === 0 \? " is-first" : ""\}/);
  });

  it("lets another filter trigger switch the open popup", () => {
    assert.match(source, /closest\("\.source-filter-trigger"\)/);
  });

  it("preserves the shared border for the selected right match mode", () => {
    assert.match(styles, /\.source-filter-modes button:last-child\.is-active\s*\{[\s\S]*?border-left:\s*1px solid var\(--theme-accent\)/);
  });

  it("uses a compact replacement action in the source header", () => {
    assert.match(styles, /\.source-replace-button\s*\{[\s\S]*?min-height:\s*28px/);
    assert.match(styles, /\.source-replace-button\s*\{[\s\S]*?padding:\s*4px 8px/);
    assert.match(styles, /\.source-replace-button\s*\{[\s\S]*?font-size:\s*12px/);
    assert.match(styles, /\.source-replace-button:hover\s*\{[\s\S]*?background:\s*var\(--theme-accent-soft\)/);
  });
});
