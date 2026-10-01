import { test } from "node:test";
import assert from "node:assert/strict";
import { createPilePlanImportPreviewController } from "./pilePlanImportPreviewController.ts";
import { createPilePlanImportDraft, setPilePlanImportFile, setPilePlanImportProfile,
  setPilePlanImportTolerance, setPilePlanImportCategory } from "../../components/domain/imports/pilePlanImportModel.ts";
import type { PilePlanImportPreview, PilePlanImportRequest } from "../../core/pilePlanImportContract.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function file(name = "plan.csv", read?: ReturnType<typeof deferred<ArrayBuffer>>) {
  const file = new File(["ID,SIZE,TIP\n1,320,-18.5"], name);
  if (read) Object.defineProperty(file, "arrayBuffer", { value: () => read.promise });
  return file;
}
function result(): PilePlanImportPreview {
  return { requestedProfile: "automatic", detectedProfile: "standard-table", supportsCptSelections: true,
    canApply: true, summary: { sourceRows: 1, matchedRows: 1, coordinateFallbacks: 0, skippedRows: 0, conflicts: 0 },
    diagnostics: [], patch: { changes: [] } };
}
function fixture(source = file()) {
  let draft = setPilePlanImportFile(createPilePlanImportDraft<File>(), source);
  let context: Pick<PilePlanImportRequest, "loadPoints" | "cpts" | "availablePileConfigurations"> = {
    loadPoints: [], cpts: [], availablePileConfigurations: [{ pile_size_mm: 320, pile_tip_level_mm: -18500 }] };
  const calls: Array<{ input: PilePlanImportRequest; response: ReturnType<typeof deferred<PilePlanImportPreview>> }> = [];
  const controller = createPilePlanImportPreviewController({
    currentContext: () => context,
    update: update => { draft = update(draft); },
    evaluate: input => { const response = deferred<PilePlanImportPreview>(); calls.push({ input, response }); return response.promise; },
  });
  return { controller, calls, current: () => draft, replaceContext: () => { context = { ...context, loadPoints: [] }; } };
}

for (const change of ["file", "profile", "tolerance", "category"] as const) test(`a newer ${change} request wins over a delayed file read`, async () => {
  const read = deferred<ArrayBuffer>(), source = file("old.csv");
  let reads = 0;
  Object.defineProperty(source, "arrayBuffer", { value: () => ++reads === 1 ? read.promise : Promise.resolve(new ArrayBuffer(0)) });
  const f = fixture(source);
  const old = f.controller.preview(f.current());
  let nextDraft = change === "file" ? setPilePlanImportFile(f.current(), file("next.csv")) : f.current();
  if (change === "profile") nextDraft = setPilePlanImportProfile(nextDraft, "legacy");
  if (change === "tolerance") nextDraft = setPilePlanImportTolerance(nextDraft, "12.5");
  if (change === "category") nextDraft = setPilePlanImportCategory(nextDraft, "cpts", false);
  const next = f.controller.preview(nextDraft); await flush();
  assert.equal(f.calls[0].input.fileName, change === "file" ? "next.csv" : "old.csv");
  assert.equal(f.calls[0].input.profile, change === "profile" ? "legacy" : "automatic");
  assert.equal(f.calls[0].input.options.coordinateToleranceMm, change === "tolerance" ? 12.5 : 1);
  assert.equal(f.calls[0].input.options.importCptSelections, change !== "profile" && change !== "category");
  f.calls[0].response.resolve(result()); await next;
  const installed = f.current(); read.resolve(new ArrayBuffer(0)); await old;
  assert.equal(f.calls.length, 1); assert.equal(f.current(), installed);
});

test("a late error cannot replace a successful newer preview", async () => {
  const f = fixture(); const old = f.controller.preview(f.current()); await flush();
  const next = f.controller.preview(setPilePlanImportTolerance(f.current(), "2")); await flush();
  f.calls[1].response.resolve(result()); await next; const installed = f.current();
  f.calls[0].response.reject(new Error("obsolete")); await old;
  assert.equal(f.current(), installed);
});

for (const stage of ["read", "response"] as const) test(`invalidation during ${stage} leaves the draft untouched`, async () => {
  const read = deferred<ArrayBuffer>(), f = fixture(file("plan.csv", stage === "read" ? read : undefined));
  const pending = f.controller.preview(f.current()); await flush();
  f.controller.invalidate(); const before = f.current();
  if (stage === "read") read.resolve(new ArrayBuffer(0)); else f.calls[0].response.resolve(result());
  await pending; assert.equal(f.current(), before);
  if (stage === "read") assert.equal(f.calls.length, 0);
});

for (const invalid of ["no file", "invalid tolerance", "no categories"] as const) test(`${invalid} cancels the pending preview`, async () => {
  const f = fixture(); const old = f.controller.preview(f.current()); await flush();
  let nextDraft = f.current();
  if (invalid === "no file") nextDraft = setPilePlanImportFile(nextDraft, null);
  if (invalid === "invalid tolerance") nextDraft = setPilePlanImportTolerance(nextDraft, "");
  if (invalid === "no categories") nextDraft = setPilePlanImportCategory(setPilePlanImportCategory(nextDraft, "piles", false), "cpts", false);
  await f.controller.preview(nextDraft); const installed = f.current();
  assert.equal(installed.previewState.status, "empty");
  f.calls[0].response.resolve(result()); await old;
  assert.equal(f.current(), installed);
});

test("a changed project context cannot receive an old preview", async () => {
  const f = fixture(); const pending = f.controller.preview(f.current()); await flush();
  f.replaceContext(); const before = f.current(); f.calls[0].response.resolve(result()); await pending;
  assert.equal(f.current(), before);
});

test("a current preview error is shown with the original message", async () => {
  const f = fixture(); const pending = f.controller.preview(f.current()); await flush();
  f.calls[0].response.reject(new Error("cannot analyze")); await pending;
  assert.deepEqual(f.current().previewState, { status: "failed", requestId: 1, message: "cannot analyze" });
});

test("invalidation also guards a result update queued by React", async () => {
  let draft = setPilePlanImportFile(createPilePlanImportDraft<File>(), file());
  const context = { loadPoints: [], cpts: [], availablePileConfigurations: [] };
  const response = deferred<PilePlanImportPreview>();
  const queued: Array<(state: typeof draft) => typeof draft> = [];
  let deferUpdates = false;
  const controller = createPilePlanImportPreviewController({
    currentContext: () => context,
    evaluate: () => response.promise,
    update: update => { if (deferUpdates) queued.push(update); else draft = update(draft); },
  });
  const pending = controller.preview(draft); await flush();
  deferUpdates = true; response.resolve(result()); await pending;
  controller.invalidate(); const before = draft;
  for (const update of queued) draft = update(draft);
  assert.equal(draft, before);
});
