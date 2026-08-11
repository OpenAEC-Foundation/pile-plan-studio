import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("source data viewer", () => {
  const source = readFileSync(resolve(import.meta.dirname, "SourceDataViewer.tsx"), "utf8");

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

  it("chooses a replacement file for the active role before opening import", () => {
    assert.match(source, /type="file"/);
    assert.match(source, /onReplaceSource/);
    assert.match(source, /File/);
  });
});
