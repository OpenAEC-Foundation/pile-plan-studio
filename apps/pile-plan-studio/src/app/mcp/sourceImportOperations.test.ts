import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState, type ProjectState } from "../../domain/project/projectState.ts";
import { createSourceImportOperations } from "./sourceImportOperations.ts";
import { SourceImportValidationError } from "./sourceImportSession.ts";
import type { ImportSourcePreview } from "../../core/coreImportContract.ts";

const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
const outcome = { status: "valid" as const, project, keys: projectTipLevelKeysForTest(project) };
const original = createInitialProjectState(project, { initializeDefaultPiles: false }, outcome.keys);
const marker = { project_instance_id: "project", project_revision: 1 };
function setup(diagnostics: ImportSourcePreview["diagnostics"] = []) {
  let current = { ...marker }, enabled = true, dirty = false;
  const refresh: ProjectState[] = [], replacements: ProjectState[] = [];
  let finishCosts: (() => void) | undefined;
  let afterImport = () => {};
  const operations = createSourceImportOperations({
    requirements: async () => ({}), currentState: () => original, currentMarker: () => current,
    canEdit: () => enabled, isDirty: () => dirty, defaultPlanName: () => "Basisplan",
    personalCostDefault: () => null, builtInCostDefault: original.pileCostSettings,
    installRefresh: (state) => { refresh.push(state); },
    installNewProject: (state) => { replacements.push(state); },
  }, {
    previewSource: async () => ({ role: "load-points", itemCount: 2, diagnostics }) as unknown as ImportSourcePreview,
    readProject: async () => outcome, writeProject: async () => "project",
    refreshProject: async () => outcome, importProject: async () => { afterImport(); return outcome; },
    prepareCosts: async (state) => {
      await new Promise<void>((resolve) => { finishCosts = resolve; });
      return { changed: false, next: state, update: (current: ProjectState) => current };
    },
  });
  return { operations, refresh, replacements, finishCosts: () => finishCosts!(),
    afterImport: (callback: () => void) => { afterImport = callback; },
    setMarker: () => { current = { ...current, project_revision: 2 }; },
    disable: () => { enabled = false; }, dirty: () => { dirty = true; } };
}

test("refresh installs once through the history callback without replacing the project", async () => {
  const context = setup();
  await context.operations.apply({ mode: "refresh", validated: { outcome }, marker });
  assert.equal(context.refresh.length, 1);
  assert.equal(context.replacements.length, 0);
});

for (const [change, reason] of [["setMarker", "project_changed"], ["disable", "write_access_disabled"],
  ["dirty", "unsaved_project_changes"]] as const) {
  test(`new project rejects ${reason} after cost defaults finish`, async () => {
    const context = setup();
    const applying = context.operations.apply({ mode: "new_project", validated: { outcome }, marker });
    context[change]();
    context.finishCosts();
    await assert.rejects(applying, new RegExp(reason));
    assert.equal(context.replacements.length, 0);
    assert.equal(context.refresh.length, 0);
  });
}

test("new project installs the prepared state once after defaults finish", async () => {
  const context = setup();
  const applying = context.operations.apply({ mode: "new_project", validated: { outcome }, marker });
  assert.equal(context.replacements.length, 0);
  context.finishCosts();
  await applying;
  assert.equal(context.replacements.length, 1);
  assert.equal(context.refresh.length, 0);
});

test("validation reports source summary and rejects a changed project", async () => {
  const context = setup();
  const validated = await context.operations.validate({ mode: "refresh", sources: [], marker });
  assert.equal(validated.data?.project_name, project.metadata.name);
  assert.ok(validated.data?.reconciliation);
  context.setMarker();
  await assert.rejects(context.operations.validate({ mode: "refresh", sources: [], marker }), /project_changed/);
});

test("invalid source rows preserve diagnostics and do not install project content", async () => {
  const diagnostic = { severity: "error", code: "invalid_row" } as ImportSourcePreview["diagnostics"][number];
  const context = setup([diagnostic]);
  await assert.rejects(context.operations.validate({ mode: "new_project", sources: [{
    role: "load-points", profile: "standard-table", profileOptions: { coordinateSheet: null, reactionSheet: null },
    fileName: "points.csv", format: "csv", bytes: new Uint8Array(),
  }], marker }), (error: unknown) => error instanceof SourceImportValidationError
    && error.diagnostics[0] === diagnostic);
  assert.equal(context.replacements.length, 0);
  assert.equal(context.refresh.length, 0);
});

test("validation rejects a project changed while Rust was importing sources", async () => {
  const context = setup();
  context.afterImport(context.setMarker);
  await assert.rejects(context.operations.validate({ mode: "new_project", sources: [], marker,
    projectName: "Import", pileHeadLevelM: 0, currencyCode: "EUR" }), /project_changed/);
  assert.equal(context.replacements.length, 0);
});

test("apply rejects disabled editing and unsaved replacement before preparing defaults", async () => {
  const disabled = setup();
  disabled.disable();
  await assert.rejects(disabled.operations.apply({ mode: "refresh", validated: { outcome }, marker }), /write_access_disabled/);
  assert.equal(disabled.refresh.length, 0);
  const dirty = setup();
  dirty.dirty();
  await assert.rejects(dirty.operations.apply({ mode: "new_project", validated: { outcome }, marker }), /unsaved_project_changes/);
  assert.equal(dirty.replacements.length, 0);
});
