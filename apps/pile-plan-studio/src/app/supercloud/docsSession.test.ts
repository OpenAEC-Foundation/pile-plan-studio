import assert from "node:assert/strict";
import { test } from "node:test";
import { createDocsSession, type SiteHost } from "./docsSession.ts";

function fixture(readOnly = false) {
  const requests: Array<Parameters<SiteHost["save"]>[1]> = [];
  const host: SiteHost = {
    open: async (id) => ({ id, name: "Plan.ifcpp", version: 3, readOnly, bytes: new TextEncoder().encode("palenplan") }),
    list: async () => [],
    versions: async () => [],
    save: async (_bytes, options) => {
      requests.push(options);
      return { id: "copy", name: "Plan (copy).ifcpp", version: 1 };
    },
  };
  return { host, requests, session: createDocsSession() };
}

test("a Docs save uses the opened version and adopts the host's conflict copy", async () => {
  const { host, requests, session } = fixture();
  const opened = await session.read(host, "plan");
  assert.equal(opened.contents, "palenplan");
  session.install(opened.file);
  const saved = await session.save(host, "updated", "unused.ifcpp", false);
  assert.deepEqual(requests, [{ id: "plan", expectedVersion: 3 }]);
  assert.deepEqual(saved, { id: "copy", name: "Plan (copy).ifcpp", version: 1, readOnly: false });
  await session.save(host, "again", "unused.ifcpp", false);
  assert.deepEqual(requests[1], { id: "copy", expectedVersion: 1 });
});

test("read-only Docs projects can be saved as a new file only", async () => {
  const { host, requests, session } = fixture(true);
  session.install((await session.read(host, "plan")).file);
  await assert.rejects(session.save(host, "updated", "New.ifcpp", false), /read.only/i);
  assert.deepEqual(requests, []);
  await session.save(host, "updated", "New.ifcpp", true);
  assert.deepEqual(requests, [{ name: "New.ifcpp" }]);
});

test("a failed Docs save leaves the opened version in place", async () => {
  const { host, requests, session } = fixture();
  session.install((await session.read(host, "plan")).file);
  await assert.rejects(session.save({ ...host, save: async () => { throw new Error("offline"); } },
    "updated", "New.ifcpp", false), /offline/);
  await session.save(host, "retry", "New.ifcpp", false);
  assert.deepEqual(requests, [{ id: "plan", expectedVersion: 3 }]);
});

test("a late Docs save cannot rebind a replacement project", async () => {
  const { host, session } = fixture();
  session.install((await session.read(host, "plan")).file);
  const replacement = (await session.read(host, "replacement")).file;
  const pending = session.save(host, "updated", "New.ifcpp", false);
  session.install(replacement);
  assert.equal(await pending, null);
});
