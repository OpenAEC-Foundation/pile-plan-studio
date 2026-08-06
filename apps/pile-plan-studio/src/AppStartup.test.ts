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

  it("initializes default piles for the sample, new imports, and refreshed unmatched points", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

    assert.match(source, /createInitialProjectState\(\s*projectText,\s*\{[\s\S]*?initializeDefaultPiles,[\s\S]*?defaultPilePlanName: i18n\.language\.startsWith\("nl"\) \? "Basisplan" : "Base plan",[\s\S]*?\},?\s*\)/);
    assert.match(source, /initialProjectText: result\.record\.ifcppText,[\s\S]*?initializeDefaultPiles: false/);
    assert.match(source, /createInitialProjectState\(sampleProjectText, \{[\s\S]*?initializeDefaultPiles: true,[\s\S]*?viewerPreferences: projectState/);
    assert.match(source, /createInitialProjectState\(withCosts, \{[\s\S]*?initializeDefaultPiles: true,[\s\S]*?viewerPreferences: projectState,[\s\S]*?\}\)/);
    assert.match(source, /createInitialProjectState\(refreshedProject, \{[\s\S]*?initializeDefaultPiles: true,[\s\S]*?viewerPreferences: projectState,[\s\S]*?\}\)/);
    assert.match(source, /createInitialProjectState\(\s*await file\.text\(\),\s*\{ initializeDefaultPiles: false, viewerPreferences: projectState \},?\s*\)/);
  });

  it("runs one guarded batched default selection after complete analysis", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

    assert.match(source, /chooseDefaultPileOptionsCore/);
    assert.match(source, /defaultPileSelectionPending/);
    assert.match(source, /pileOptionsByLoadPointId\.size !== projectState\.loadPoints\.length/);
  });

  it("keeps the initialized sample project clean after choosing default piles", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
    const guardedRequestIndex = source.indexOf("defaultSelectionRequestRef.current = analysisRequest;");
    const chooserIndex = source.indexOf("chooseDefaultPileOptionsCore({", guardedRequestIndex);
    const defaultSelectionEffect = source.slice(chooserIndex, source.indexOf("  }, [", chooserIndex));

    assert.doesNotMatch(defaultSelectionEffect, /setIsDirty\(true\)/);
    assert.match(defaultSelectionEffect, /savedProjectSignatureRef\.current !== ""/);
    assert.match(defaultSelectionEffect, /updateSavedProjectSignature\(JSON\.stringify\(projectFromState\(next\)\)\)/);
  });

  it("keeps default selection pending until the guarded request finishes", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
    const guardedRequestIndex = source.indexOf("defaultSelectionRequestRef.current = analysisRequest;");
    const chooserIndex = source.indexOf("chooseDefaultPileOptionsCore({", guardedRequestIndex);
    const effectStart = source.lastIndexOf("useEffect(() =>", chooserIndex);
    const beforeChooser = source.slice(effectStart, chooserIndex);

    assert.match(source, /defaultSelectionRequestRef/);
    assert.doesNotMatch(beforeChooser, /defaultPileSelectionPending:\s*false/);
    assert.match(
      source.slice(chooserIndex),
      /selectedPileOptionKeysByLoadPoint:\s*mergeDefaultPileChoices\([\s\S]*?defaultPileSelectionPending:\s*false/,
    );
  });

  it("refreshes selected sources through Rust while retaining the open project path", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
    const handler = source.slice(
      source.indexOf("onImportProject={async"),
      source.indexOf("onOpenProjectFile=", source.indexOf("onImportProject={async")),
    );

    assert.match(source, /refreshProjectFromFilesCore/);
    assert.match(source, /mode === "refresh"/);
    assert.match(source, /currentProject:\s*projectFromState\(projectState\)/);
    assert.match(source, /createInitialProjectState\(refreshedProject, \{[\s\S]*?initializeDefaultPiles: true,[\s\S]*?viewerPreferences: projectState,[\s\S]*?\}\)/);
    assert.match(source, /defaultSelectionKeepsDirtyRef\.current = true/);
    assert.ok(
      handler.indexOf('mode === "refresh"') < handler.indexOf("confirmProjectReplacement()"),
      "refresh should run before the replacement confirmation used by new-project imports",
    );
  });

  it("runs greedy optimization through the shared Rust and WASM core", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

    assert.match(source, /greedyOptimizeCore/);
    assert.match(source, /buildGreedyOptimizationSettings/);
    assert.match(source, /applyOptimizationChoices/);
    assert.match(source, /optimizationRunning:\s*true/);
    assert.match(source, /onRunOptimization=\{runGreedyOptimization\}/);
    assert.match(source, /snapshot\.optimizationCreatesPilePlan/);
    assert.match(source, /createOptimizationPilePlan/);
  });

  it("waits for complete analysis before creating a fresh pile plan", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
    const createStart = source.indexOf("const createFreshPilePlan");
    const createEnd = source.indexOf("useEffect(() =>", createStart);
    const createHandler = source.slice(createStart, createEnd);

    assert.match(createHandler, /pileOptionsByLoadPointId\.size !== snapshot\.loadPoints\.length/);
  });

  it("uses the working pile plan explorer instead of passive source rows", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

    assert.match(source, /<PilePlanExplorer/);
    assert.match(source, /summarizePilePlanCosts/);
    assert.doesNotMatch(source, /projectState\.inputSources\.map/);
  });

  it("waits for stored viewer preferences before saving them", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

    assert.match(source, /viewerPreferencesLoaded/);
    assert.match(source, /setViewerPreferencesLoaded\(true\)/);
    assert.match(source, /if \(!viewerPreferencesLoaded\) return/);
  });

  it("uses the sample project costs as fixed defaults without reading mutable stored defaults", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

    assert.match(source, /BUILT_IN_PILE_COST_DEFAULTS\s*=\s*loadIfcppProjectData\(sampleProjectText\)\.pileCostSettings/);
    assert.match(source, /applyDefaultPileCostSettings\(project, BUILT_IN_PILE_COST_DEFAULTS\)/);
    assert.doesNotMatch(source, /PILE_COST_DEFAULTS_KEY/);
    assert.doesNotMatch(source, /getSetting<PileCostSettings/);
    assert.doesNotMatch(
      source,
      /setProjectState\(\(current\)\s*=>\s*\(\{\s*\.\.\.current,\s*pileCostSettings:\s*saved\s*\}\)\)/,
    );
  });

  it("keeps task panels open while viewer selections change", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

    assert.doesNotMatch(source, /<PilePlanWorkspace[\s\S]*?onMapMarkerSelect=/);
  });
});
