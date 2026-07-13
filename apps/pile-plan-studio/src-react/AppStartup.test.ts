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

  it("initializes default piles only for the sample and newly imported projects", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

    assert.match(source, /createInitialProjectState\(\s*sampleProjectText,\s*\{ initializeDefaultPiles: true \},?\s*\)/);
    assert.match(source, /createInitialProjectState\(withCosts, \{ initializeDefaultPiles: true \}\)/);
    assert.match(source, /createInitialProjectState\(\s*await file\.text\(\),\s*\{ initializeDefaultPiles: false \},?\s*\)/);
  });

  it("runs one guarded batched default selection after complete analysis", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

    assert.match(source, /chooseDefaultPileOptionsCore/);
    assert.match(source, /defaultPileSelectionPending/);
    assert.match(source, /pileOptionsByLoadPointId\.size !== projectState\.loadPoints\.length/);
  });

  it("keeps default selection pending until the guarded request finishes", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
    const chooserIndex = source.indexOf("chooseDefaultPileOptionsCore({");
    const effectStart = source.lastIndexOf("useEffect(() =>", chooserIndex);
    const beforeChooser = source.slice(effectStart, chooserIndex);

    assert.match(source, /defaultSelectionRequestRef/);
    assert.doesNotMatch(beforeChooser, /defaultPileSelectionPending:\s*false/);
    assert.match(
      source.slice(chooserIndex),
      /selectedPileOptionKeysByLoadPoint:\s*choices,[\s\S]*?defaultPileSelectionPending:\s*false/,
    );
  });

  it("runs greedy optimization through the shared Rust and WASM core", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

    assert.match(source, /greedyOptimizeCore/);
    assert.match(source, /buildGreedyOptimizationSettings/);
    assert.match(source, /applyOptimizationChoices/);
    assert.match(source, /optimizationRunning:\s*true/);
    assert.match(source, /onRunOptimization=\{runGreedyOptimization\}/);
  });
});
