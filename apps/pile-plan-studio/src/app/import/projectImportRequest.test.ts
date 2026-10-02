import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareProjectImportRequest } from "./projectImportRequest.ts";
import { applyImportPreview, beginImportPreview, createEmptyImportDrafts, setImportFile,
  setImportProfileOptions, projectImportReadiness } from "../../domain/imports/projectImportModel.ts";
import type { ImportFileRole } from "../../core/importFiles.ts";
import type { ImportSourcePreview } from "../../core/coreImportContract.ts";

function ready(roles: ImportFileRole[] = ["load-points", "cpts", "bearing-capacities"]) {
  let drafts = createEmptyImportDrafts<File>();
  for (const role of roles) {
    drafts = setImportFile(drafts, role, new File([`${role} data`], `${role}.csv`));
    drafts = beginImportPreview(drafts, role, 1);
    const preview: ImportSourcePreview = { role, requestedProfile: "auto", detectedProfile: "standard-table",
      resolvedProfile: "standard-table", availableProfiles: ["standard-table"],
      resolvedOptions: { coordinateSheet: null, reactionSheet: null }, itemCount: 1, diagnostics: [], details: null };
    drafts = applyImportPreview(drafts, role, 1, preview);
  }
  return drafts;
}

test("a new project needs ready sources and a pile-head level, including zero", () => {
  const drafts = ready();
  assert.deepEqual(projectImportReadiness(drafts, "new-project", null), {
    canSubmit: false, showPileHeadLevelBlocker: true,
  });
  for (const level of [0, -1.25, 2.5]) {
    assert.deepEqual(projectImportReadiness(drafts, "new-project", level), {
      canSubmit: true, showPileHeadLevelBlocker: false,
    });
  }
  assert.deepEqual(projectImportReadiness(createEmptyImportDrafts<File>(), "new-project", null), {
    canSubmit: false, showPileHeadLevelBlocker: false,
  });
});

test("refresh needs no project properties but cannot submit an empty or pending source selection", () => {
  assert.equal(projectImportReadiness(ready(["cpts"]), "refresh", null).canSubmit, true);
  assert.equal(projectImportReadiness(createEmptyImportDrafts<File>(), "refresh", null).canSubmit, false);
  assert.equal(projectImportReadiness(beginImportPreview(ready(["cpts"]), "cpts", 2), "refresh", null).canSubmit, false);
});

for (const status of ["warning", "error", "unresolved-profile"] as const) {
  test(`a source with ${status} diagnostics has the correct import eligibility`, async () => {
    let drafts = ready(["cpts"]);
    const state = drafts.cpts.previewState;
    assert.equal(state.status, "ready");
    if (state.status !== "ready") throw new Error("fixture not ready");
    const preview: ImportSourcePreview = { ...state.preview,
      resolvedProfile: status === "unresolved-profile" ? null : "standard-table",
      diagnostics: status === "unresolved-profile" ? [] : [{
        severity: status, code: "source-row", count: 1, nodeIds: [], loadPointNames: [],
        xMm: null, yMm: null, location: null, tipLevelValues: [], fallbackMessage: "Source row",
      }],
    };
    drafts = beginImportPreview(drafts, "cpts", 2);
    drafts = applyImportPreview(drafts, "cpts", 2, preview);
    assert.equal(projectImportReadiness(drafts, "refresh", null).canSubmit, status === "warning");
    const request = await prepareProjectImportRequest({ drafts, mode: "refresh", projectName: "",
      pileHeadLevelM: null, currencyCode: "EUR" });
    assert.equal(request !== null, status === "warning");
  });
}

test("blocked imports do not read any source files", async () => {
  const drafts = ready();
  for (const draft of Object.values(drafts)) {
    Object.defineProperty(draft.file!, "arrayBuffer", { value: () => { throw new Error("unexpected read"); } });
  }
  assert.equal(await prepareProjectImportRequest({ drafts, mode: "new-project", projectName: "P",
    pileHeadLevelM: null, currencyCode: "EUR" }), null);
  assert.equal(await prepareProjectImportRequest({ drafts: beginImportPreview(drafts, "cpts", 2),
    mode: "new-project", projectName: "P", pileHeadLevelM: 0, currencyCode: "EUR" }), null);
});

test("a new-project request keeps source order, actual bytes, trimmed name and project properties", async () => {
  const request = await prepareProjectImportRequest({ drafts: ready(), mode: "new-project",
    projectName: "  Project A  ", pileHeadLevelM: -1.25, currencyCode: "GBP" });
  assert.ok(request);
  assert.equal(request.mode, "new-project");
  assert.equal(request.projectName, "Project A");
  assert.deepEqual(request.properties, { pileHeadLevelM: -1.25, currencyCode: "GBP" });
  assert.deepEqual(request.sources.map(source => source.role), ["load-points", "cpts", "bearing-capacities"]);
  for (const source of request.sources) {
    assert.equal(source.fileName, `${source.role}.csv`);
    assert.equal(source.format, "csv");
    assert.equal(new TextDecoder().decode(source.bytes), `${source.role} data`);
  }
});

test("an empty new-project name retains the existing fallback", async () => {
  const request = await prepareProjectImportRequest({ drafts: ready(), mode: "new-project",
    projectName: "  ", pileHeadLevelM: 0, currencyCode: "EUR" });
  assert.equal(request?.projectName, "Imported Project");
});

test("refresh includes only selected sources and never replaces project properties", async () => {
  const request = await prepareProjectImportRequest({ drafts: ready(["cpts"]), mode: "refresh",
    projectName: "Ignored", pileHeadLevelM: 5, currencyCode: "USD" });
  assert.ok(request);
  assert.equal(request.mode, "refresh");
  assert.deepEqual(request.sources.map(source => source.role), ["cpts"]);
  assert.equal(request.projectName, null);
  assert.equal(request.properties, null);
});

test("a request preserves explicit RFEM profile and sheet choices", async () => {
  let drafts = ready(["load-points"]);
  drafts = { ...drafts, "load-points": { ...drafts["load-points"], requestedProfile: "rfem-export" } };
  drafts = setImportProfileOptions(drafts, "load-points", { coordinateSheet: "Nodes", reactionSheet: "RC1" });
  drafts = beginImportPreview(drafts, "load-points", 2);
  const preview = ready(["load-points"])["load-points"].previewState;
  assert.equal(preview.status, "ready");
  if (preview.status !== "ready") throw new Error("fixture not ready");
  drafts = applyImportPreview(drafts, "load-points", 2, { ...preview.preview,
    resolvedOptions: { coordinateSheet: "Nodes", reactionSheet: "RC1" } });
  const request = await prepareProjectImportRequest({ drafts, mode: "refresh", projectName: "",
    pileHeadLevelM: null, currencyCode: "EUR" });
  assert.equal(request?.sources[0].profile, "rfem-export");
  assert.deepEqual(request?.sources[0].profileOptions, { coordinateSheet: "Nodes", reactionSheet: "RC1" });
});

test("a file read failure rejects the whole request instead of returning partial sources", async () => {
  const drafts = ready();
  Object.defineProperty(drafts.cpts.file!, "arrayBuffer", { value: () => Promise.reject(new Error("read failed")) });
  await assert.rejects(prepareProjectImportRequest({ drafts, mode: "new-project", projectName: "P",
    pileHeadLevelM: 0, currencyCode: "EUR" }), /read failed/);
});

test("an unsupported selected file is rejected before a request can be delivered", async () => {
  const drafts = ready(["cpts"]);
  drafts.cpts = { ...drafts.cpts, file: new File(["data"], "cpts.txt") };
  await assert.rejects(prepareProjectImportRequest({ drafts, mode: "refresh", projectName: "",
    pileHeadLevelM: null, currencyCode: "EUR" }), /Unsupported file format: cpts.txt/);
});
