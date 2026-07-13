import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("React app startup", () => {
  it("does not run the expensive WASM initialization twice in development", () => {
    const source = readFileSync(resolve(import.meta.dirname, "main.tsx"), "utf8");

    assert.doesNotMatch(source, /React\.StrictMode/);
  });

  it("runs one batched analysis whenever the analysis request object changes", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

    assert.match(source, /calculateProjectAnalysisCore/);
    assert.match(source, /\[projectState\.analysisRequest\]/);
    assert.doesNotMatch(source, /Promise\.all\(analysisLoadPoints\.map/);
    assert.doesNotMatch(source, /Promise\.all\(projectState\.cpts\.map/);
  });

  it("stores analysis failures instead of leaving a permanent loading state", () => {
    const appSource = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
    const panelSource = readFileSync(
      resolve(import.meta.dirname, "components/domain/RightPanel.tsx"),
      "utf8",
    );

    assert.match(appSource, /analysisError/);
    assert.match(panelSource, /state\.analysisError/);
  });
});
