import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectImportPreviewController } from "./projectImportPreviewController.ts";
import { createEmptyImportDrafts, setImportFile } from "../../components/domain/imports/projectImportModel.ts";
import type { ImportSourceInput, ImportSourcePreview } from "../../core/coreImportContract.ts";
import type { ImportFileRole } from "../../core/importFiles.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const options = { coordinateSheet: null, reactionSheet: null };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function file(name = "points.csv", read?: ReturnType<typeof deferred<ArrayBuffer>>) {
  const file = new File(["ID,X,Y,FED\n1,0,0,10"], name);
  if (read) Object.defineProperty(file, "arrayBuffer", { value: () => read.promise });
  return file;
}
function result(role: ImportFileRole, itemCount = 1): ImportSourcePreview {
  return { role, requestedProfile: "auto", detectedProfile: "standard-table", resolvedProfile: "standard-table",
    availableProfiles: ["standard-table"], resolvedOptions: options, itemCount, diagnostics: [], details: null };
}
function fixture() {
  let drafts = createEmptyImportDrafts<File>();
  const calls: Array<{ input: ImportSourceInput; response: ReturnType<typeof deferred<ImportSourcePreview>> }> = [];
  const controller = createProjectImportPreviewController({
    update: update => { drafts = update(drafts); },
    evaluate: input => { const response = deferred<ImportSourcePreview>(); calls.push({ input, response }); return response.promise; },
  });
  return { controller, calls, current: () => drafts,
    assign: (role: ImportFileRole, source: File) => { drafts = setImportFile(drafts, role, source); } };
}

test("a slow file read cannot submit or overwrite the replacement file", async () => {
  const f = fixture(), read = deferred<ArrayBuffer>();
  const oldFile = file("old.csv", read), nextFile = file("next.csv");
  f.assign("load-points", oldFile);
  const old = f.controller.preview("load-points", oldFile, "auto", options);
  f.assign("load-points", nextFile);
  const next = f.controller.preview("load-points", nextFile, "auto", options);
  await flush();
  assert.equal(f.calls[0].input.fileName, "next.csv");
  f.calls[0].response.resolve(result("load-points", 99)); await next;
  const installed = f.current();
  read.resolve(new ArrayBuffer(0)); await old;
  assert.equal(f.calls.length, 1);
  assert.equal(f.current(), installed);
});

for (const change of ["profile", "sheet options"] as const) test(`a newer ${change} preview wins over a late error`, async () => {
  const f = fixture(), source = file("rfem.xlsx"); f.assign("load-points", source);
  const old = f.controller.preview("load-points", source, "auto", options); await flush();
  const next = f.controller.preview("load-points", source, "rfem-export",
    change === "sheet options" ? { coordinateSheet: "Nodes", reactionSheet: "Loads" } : options);
  await flush();
  assert.equal(f.calls[1].input.profile, "rfem-export");
  assert.deepEqual(f.calls[1].input.profileOptions, change === "sheet options" ? { coordinateSheet: "Nodes", reactionSheet: "Loads" } : options);
  f.calls[1].response.resolve(result("load-points", 2)); await next;
  const installed = f.current();
  f.calls[0].response.reject(new Error("obsolete")); await old;
  assert.equal(f.current(), installed);
});

test("previews for different project roles finish independently", async () => {
  const f = fixture(), points = file(), cpts = file("cpts.csv");
  f.assign("load-points", points); f.assign("cpts", cpts);
  const a = f.controller.preview("load-points", points, "auto", options);
  const b = f.controller.preview("cpts", cpts, "auto", options); await flush();
  f.calls[1].response.resolve(result("cpts", 7)); await b;
  f.calls[0].response.resolve(result("load-points", 3)); await a;
  assert.equal(f.current().cpts.previewState.status, "ready");
  assert.equal(f.current()["load-points"].previewState.status, "ready");
});

for (const stage of ["read", "response"] as const) test(`invalidation during ${stage} leaves the draft untouched`, async () => {
  const f = fixture(), read = deferred<ArrayBuffer>(), source = file("points.csv", stage === "read" ? read : undefined);
  f.assign("load-points", source);
  const pending = f.controller.preview("load-points", source, "auto", options); await flush();
  f.controller.invalidate(); const before = f.current();
  if (stage === "read") read.resolve(new ArrayBuffer(0));
  else f.calls[0].response.resolve(result("load-points"));
  await pending;
  assert.equal(f.current(), before);
  if (stage === "read") assert.equal(f.calls.length, 0);
});

test("a current read failure is reported and a later request can recover", async () => {
  const f = fixture(), read = deferred<ArrayBuffer>(), source = file("points.csv", read);
  f.assign("load-points", source);
  const pending = f.controller.preview("load-points", source, "auto", options);
  read.reject(new Error("cannot read")); await pending;
  assert.deepEqual(f.current()["load-points"].previewState, { status: "failed", requestId: 1, message: "cannot read" });
  const nextFile = file(); f.assign("load-points", nextFile);
  const next = f.controller.preview("load-points", nextFile, "auto", options); await flush();
  f.calls[0].response.resolve(result("load-points")); await next;
  assert.equal(f.current()["load-points"].previewState.status, "ready");
});

test("invalidation also guards a result update queued by React", async () => {
  let drafts = setImportFile(createEmptyImportDrafts<File>(), "load-points", file());
  const response = deferred<ImportSourcePreview>();
  const queued: Array<(state: typeof drafts) => typeof drafts> = [];
  let deferUpdates = false;
  const controller = createProjectImportPreviewController({
    evaluate: () => response.promise,
    update: update => { if (deferUpdates) queued.push(update); else drafts = update(drafts); },
  });
  const pending = controller.preview("load-points", drafts["load-points"].file!, "auto", options);
  await flush(); deferUpdates = true; response.resolve(result("load-points")); await pending;
  controller.invalidate(); const before = drafts;
  for (const update of queued) drafts = update(drafts);
  assert.equal(drafts, before);
});
