import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PilePlanImportPanel", () => {
  const source = readFileSync(resolve(import.meta.dirname, "PilePlanImportPanel.tsx"), "utf8");

  it("uses the same Blueprint file action as the project source cards", () => {
    assert.match(source, /<SourceFileButton/);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|ifcImportIcon/);
  });

  it("uses the shared Blueprint select and source column mapping", () => {
    assert.match(source, /<Select/);
    assert.match(source, /variant="blueprint"/);
    assert.doesNotMatch(source, /ThemedSelect/);
  });
});
