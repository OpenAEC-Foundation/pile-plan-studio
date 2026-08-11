import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizePileHeadLevel, normalizeProjectName } from "./projectInformationModel.ts";

describe("Project information", () => {
  it("stores a trimmed non-empty project name", () => {
    assert.equal(normalizeProjectName("  Alpha foundation  "), "Alpha foundation");
    assert.equal(normalizeProjectName("   "), null);
  });

  it("accepts decimal comma or point pile head levels", () => {
    assert.equal(normalizePileHeadLevel("-1,25"), -1.25);
    assert.equal(normalizePileHeadLevel("2.5"), 2.5);
    assert.equal(normalizePileHeadLevel(""), null);
    assert.equal(normalizePileHeadLevel("not a level"), null);
  });

  it("edits the project name, pile head level and currency together", () => {
    const source = readFileSync(new URL("./ProjectInformationDialog.tsx", import.meta.url), "utf8");

    assert.match(source, /pileHeadLevelM/);
    assert.match(source, /currencyCode/);
    assert.match(source, /onSave\(\{/);
  });

  it("uses the custom themed listbox for project currency", () => {
    const source = readFileSync(new URL("./ProjectInformationDialog.tsx", import.meta.url), "utf8");

    assert.match(source, /<ThemedSelect/);
    assert.match(source, /ariaLabel=\{t\("projectInformation\.currency"\)\}/);
    assert.doesNotMatch(source, /<select/);
  });

  it("uses a stable two-column form layout", () => {
    const styles = readFileSync(new URL("../../App.css", import.meta.url), "utf8");

    assert.match(styles, /\.project-information-form label\s*{[\s\S]*?grid-template-columns:/);
    assert.match(styles, /\.project-information-form input[\s\S]*?width:\s*100%/);
  });
});
