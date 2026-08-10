import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("pile plan workspace legend editing", () => {
  it("applies activation and appearance in one project update", () => {
    const source = readFileSync(resolve(import.meta.dirname, "PilePlanWorkspace.tsx"), "utf8");

    const applyBlock = source.match(/onApply=\{\(draft\) => \{(?<body>[\s\S]*?)setLegendEditorOpen\(false\);/)
      ?.groups?.body ?? "";
    assert.match(applyBlock, /activePileSizes:\s*draft\.active\.pileSizes/);
    assert.match(applyBlock, /activePileTipLevels:\s*draft\.active\.pileTipLevels/);
    assert.match(applyBlock, /pileLegend:\s*draft\.legend/);
    assert.equal((applyBlock.match(/onStateChange\(/g) ?? []).length, 1);
  });
});
