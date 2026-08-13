import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("source data viewer", () => {
  const source = readFileSync(resolve(import.meta.dirname, "SourceDataViewer.tsx"), "utf8");
  const styles = readFileSync(resolve(import.meta.dirname, "../../App.css"), "utf8");

  it("shows source provenance, popup column filters, and sorting", () => {
    assert.match(source, /source\.fileName/);
    assert.match(source, /source\.profile/);
    assert.match(source, /source\.warnings/);
    assert.match(source, /filterAndSortSourceRows/);
    assert.match(source, /setFilters/);
    assert.match(source, /setSort/);
    assert.match(source, /source-filter-popover/);
    assert.match(source, /mode \?\? "exact"/);
  });

  it("captures filter input before React releases the change event", () => {
    assert.match(source, /const value = event\.currentTarget\.value;/);
    assert.match(source, /setFilters/);
  });

  it("virtualizes large source tables", () => {
    assert.match(source, /ROW_HEIGHT/);
    assert.match(source, /scrollTop/);
    assert.match(source, /visibleRows/);
    assert.match(source, /paddingTop/);
    assert.match(source, /paddingBottom/);
  });

  it("keeps the header and data rows in the same scrollbar viewport", () => {
    assert.match(source, /className="source-table-scroll"[\s\S]*className="source-table-heading"/);
    assert.match(source, /className="source-table-body"/);
  });

  it("opens the first column filter toward the inside of the viewer", () => {
    assert.match(source, /source-table-column\$\{columnIndex === 0 \? " is-first" : ""\}/);
  });

  it("keeps one filter popup open and closes it after an outside click", () => {
    assert.match(source, /const \[activeFilterKey, setActiveFilterKey\]/);
    assert.match(source, /activeFilterMenuRef/);
    assert.match(source, /document\.addEventListener\("pointerdown", handleOutsidePointerDown\)/);
    assert.match(source, /setActiveFilterKey\(\(current\) => current === column\.key \? null : column\.key\)/);
    assert.doesNotMatch(source, /<details|<summary/);
  });

  it("lets another filter trigger switch the open popup", () => {
    assert.match(source, /closest\("\.source-filter-trigger"\)/);
  });

  it("preserves the shared border for the selected right match mode", () => {
    assert.match(styles, /\.source-filter-modes button:last-child\.is-active\s*\{[\s\S]*?border-left:\s*1px solid var\(--theme-accent\)/);
  });

  it("chooses a replacement file for the active role before opening import", () => {
    assert.match(source, /type="file"/);
    assert.match(source, /onReplaceSource/);
    assert.match(source, /File/);
  });

  it("uses a compact replacement action in the source header", () => {
    assert.match(styles, /\.source-replace-button\s*\{[\s\S]*?min-height:\s*28px/);
    assert.match(styles, /\.source-replace-button\s*\{[\s\S]*?padding:\s*4px 8px/);
    assert.match(styles, /\.source-replace-button\s*\{[\s\S]*?font-size:\s*12px/);
    assert.match(styles, /\.source-replace-button:hover\s*\{[\s\S]*?background:\s*var\(--theme-accent-soft\)/);
  });
});
