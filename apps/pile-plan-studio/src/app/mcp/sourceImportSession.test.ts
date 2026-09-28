import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSourceImportSession, SourceImportValidationError } from "./sourceImportSession.ts";

const marker = { project_instance_id: "one", project_revision: 3 };
const source = { role: "load-points", file_name: "points.csv", chunk_index: 0, text: "ID,X,Y,FED\n1,0,0,100", final: true };
async function settledStatus(session: ReturnType<typeof createSourceImportSession>, transaction_id: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await session.call("pile_get_source_import_status", { transaction_id }, marker);
    if (result.data.status !== "processing") return result;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error("source import validation did not settle");
}

describe("MCP source import session", () => {
  it("stages, validates asynchronously, and applies exactly once", async () => {
    let resolve!: (value: { data: { load_points: number }; value: string }) => void;
    let applied = 0;
    const session = createSourceImportSession({
      requirements: async () => ({ version: 1 }),
      validate: async () => new Promise((done) => { resolve = done; }),
      apply: async () => { applied++; return { changed: true }; },
    });
    const begun = await session.call("pile_begin_source_import", { mode: "refresh", expected_project_instance_id: "one", expected_project_revision: 3 }, marker);
    const transaction_id = begun.data.transaction_id as string;
    await session.call("pile_append_import_source", { transaction_id, ...source }, marker);
    const validating = await session.call("pile_validate_source_import", { transaction_id }, marker);
    assert.equal(validating.data.status, "processing");
    assert.equal((await session.call("pile_get_source_import_status", { transaction_id }, marker)).data.status, "processing");
    await new Promise((done) => setImmediate(done));
    resolve({ data: { load_points: 1 }, value: "valid" });
    const ready = await settledStatus(session, transaction_id);
    assert.equal(ready.data.status, "ready");
    await session.call("pile_apply_source_import", { transaction_id, validation_id: ready.data.validation_id }, marker);
    assert.equal(applied, 1);
    await assert.rejects(session.call("pile_apply_source_import", { transaction_id, validation_id: ready.data.validation_id }, marker), /import_not_found/);
  });

  it("rejects out-of-order chunks and stale project markers", async () => {
    const session = createSourceImportSession({ requirements: async () => ({}), validate: async () => ({}), apply: async () => ({}) });
    const { data } = await session.call("pile_begin_source_import", { mode: "refresh", expected_project_instance_id: "one", expected_project_revision: 3 }, marker);
    const transaction_id = data.transaction_id as string;
    await assert.rejects(session.call("pile_append_import_source", { transaction_id, ...source, chunk_index: 1 }, marker), /invalid_chunk_order/);
    await assert.rejects(session.call("pile_append_import_source", { transaction_id, ...source }, { ...marker, project_revision: 4 }), /project_changed/);
  });

  it("requires all roles for a new project and caps chunk bytes", async () => {
    const session = createSourceImportSession({ requirements: async () => ({}), validate: async () => ({}), apply: async () => ({}) });
    const { data } = await session.call("pile_begin_source_import", { mode: "new_project", project_name: "Test", pile_head_level_m: 0, currency_code: "EUR", expected_project_instance_id: "one", expected_project_revision: 3 }, marker);
    const transaction_id = data.transaction_id as string;
    await session.call("pile_append_import_source", { transaction_id, ...source }, marker);
    await assert.rejects(session.call("pile_validate_source_import", { transaction_id }, marker), /missing_import_roles/);
    await assert.rejects(session.call("pile_append_import_source", { transaction_id, ...source, role: "cpts", text: "x".repeat(131073) }, marker), /import_chunk_too_large/);
  });

  it("reports source diagnostics and lets a corrected role be restaged", async () => {
    const session = createSourceImportSession({ requirements: async () => ({}),
      validate: async ({ sources }) => {
        if (new TextDecoder().decode(sources[0].bytes).includes("bad")) {
          throw new SourceImportValidationError("invalid row", [{ location: { row: 2, column: 1 } }]);
        }
        return { data: { load_point_count: 1 } };
      }, apply: async () => ({}) });
    const { data } = await session.call("pile_begin_source_import", { mode: "refresh",
      expected_project_instance_id: "one", expected_project_revision: 3 }, marker);
    const transaction_id = data.transaction_id as string;
    await session.call("pile_append_import_source", { transaction_id, ...source, text: "bad" }, marker);
    await session.call("pile_validate_source_import", { transaction_id }, marker);
    const failed = await settledStatus(session, transaction_id);
    assert.equal(failed.data.status, "failed");
    assert.deepEqual(failed.data.error.diagnostics[0].location, { row: 2, column: 1 });
    await session.call("pile_append_import_source", { transaction_id, ...source }, marker);
    await session.call("pile_validate_source_import", { transaction_id }, marker);
    assert.equal((await settledStatus(session, transaction_id)).data.status, "ready");
  });

  it("rejects source paths and expires abandoned transactions", async () => {
    let clock = 0;
    const session = createSourceImportSession({ requirements: async () => ({}),
      validate: async () => ({}), apply: async () => ({}), now: () => clock });
    const { data } = await session.call("pile_begin_source_import", { mode: "refresh",
      expected_project_instance_id: "one", expected_project_revision: 3 }, marker);
    const transaction_id = data.transaction_id as string;
    await assert.rejects(session.call("pile_append_import_source", { transaction_id, ...source,
      file_name: "C:\\data\\points.csv" }, marker), /invalid_import_source_name/);
    clock = 30 * 60 * 1000 + 1;
    await assert.rejects(session.call("pile_get_source_import_status", { transaction_id }, marker), /import_expired/);
  });
});
