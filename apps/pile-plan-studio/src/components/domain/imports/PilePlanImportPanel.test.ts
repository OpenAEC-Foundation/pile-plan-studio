import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PilePlanImportPanel", () => {
  const source = readFileSync(resolve(import.meta.dirname, "PilePlanImportPanel.tsx"), "utf8");

  it("uses the same aligned import icon as the project source cards", () => {
    assert.match(source, /import \{ ifcImportIcon \} from "\.\.\/\.\.\/template\/ribbon\/icons\.ts"/);
    assert.match(source, /dangerouslySetInnerHTML=\{\{ __html: ifcImportIcon \}\}/);
    assert.doesNotMatch(source, /function FileIcon/);
  });

  it("uses the shared themed listbox for its import profile", () => {
    assert.match(source, /<ThemedSelect/);
    assert.doesNotMatch(source, /<select/);
  });
});
