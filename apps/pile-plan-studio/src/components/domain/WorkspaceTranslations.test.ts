import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Workspace translations", () => {
  it("translates the explorer and legend through the common language setting", () => {
    const app = readFileSync(resolve(import.meta.dirname, "../../App.tsx"), "utf8");
    const legend = readFileSync(resolve(import.meta.dirname, "Legend.tsx"), "utf8");

    assert.match(app, /t\("projectExplorer\.inputSources"\)/);
    assert.match(app, /t\(`projectExplorer\.sources\.\$\{source\.kind\}`\)/);
    assert.match(app, /t\(`projectExplorer\.statuses\.\$\{source\.status\}`\)/);
    assert.match(legend, /useTranslation\("common"\)/);
    assert.match(legend, /t\("legend\.size"\)/);
    assert.match(legend, /t\("legend\.tip"\)/);
  });

  it("translates CPT selection values and range labels at render time", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /localizeCptTableValue/);
    assert.match(panel, /cpts\.frdRange/);
    assert.match(panel, /localizeCptName/);
  });
});
