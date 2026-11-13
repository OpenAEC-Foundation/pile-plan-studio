import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("browser recovery integration", () => {
  it("offers an explicit sample project command through the replacement guard", () => {
    const root = resolve(import.meta.dirname, "../../..");
    const appSource = readFileSync(resolve(root, "app/session/AppSession.tsx"), "utf8");
    const startScreen = readFileSync(
      resolve(root, "components/domain/project/ProjectStartScreen.tsx"),
      "utf8",
    );

    assert.match(startScreen, /onClick=\{onSample\}/);
    assert.match(appSource, /const openSampleProject = async[\s\S]*?if \(!await confirmProjectReplacement\(\)\) return;/);
    assert.match(appSource, /onSample=\{\(\) => void runStartAction\(\(\) => openSampleProject\(\)\)\}/);
    assert.match(appSource, /if \(!hasOpenedProject \|\| !recoveryWriter \|\| projectState\.defaultPileSelectionPending\) return;/);
  });
});
