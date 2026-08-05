import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("browser recovery integration", () => {
  it("offers an explicit sample project command through the replacement guard", () => {
    const root = resolve(import.meta.dirname, "..");
    const appSource = readFileSync(resolve(root, "App.tsx"), "utf8");
    const backstageSource = readFileSync(
      resolve(root, "components/template/backstage/Backstage.tsx"),
      "utf8",
    );

    assert.match(backstageSource, /onOpenSampleProject/);
    assert.match(appSource, /const openSampleProject = async/);
    assert.match(appSource, /if \(!await confirmProjectReplacement\(\)\) return;/);
    assert.match(appSource, /onOpenSampleProject=\{openSampleProject\}/);
    assert.match(appSource, /if \(!recoveryWriter \|\| projectState\.defaultPileSelectionPending\) return;/);
  });
});
