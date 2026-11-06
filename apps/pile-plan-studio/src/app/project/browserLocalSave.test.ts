import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createRecentProjectController } from "./recentProjectController.ts";
import { saveBrowserProjectLocally } from "./browserLocalSave.ts";

function setup(recentKey: string | null = "browser:existing") {
  const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
  const state = { ...createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project)), name: "Edited project" };
  const copies = new Map<string, string>();
  const controller = createRecentProjectController({ readMetadata: async () => [], writeMetadata: async () => {},
    cache: { read: async key => copies.get(key) ?? null, write: async (key, text) => { copies.set(key, text); }, remove: async key => { copies.delete(key); } } });
  let clean: { key: string; signature: string } | null = null;
  return { state, copies, controller, get clean() { return clean; }, options: {
    state, recentKey, serialize: async (draft: unknown) => JSON.stringify(draft),
    remember: controller.rememberBrowser, isCurrent: () => true,
    didSave: (key: string, signature: string) => { clean = { key, signature }; },
  } };
}

describe("browser local save before replacement", () => {
  it("replaces the existing recent copy with current edits before marking it saved", async () => {
    const t = setup();
    await t.controller.rememberBrowser("browser:existing", "Old.ifcpp", "old");
    assert.equal(await saveBrowserProjectLocally(t.options), true);
    const text = await t.controller.readBrowser("browser:existing");
    assert.equal(JSON.parse(text!).metadata.name, "Edited project");
    assert.equal(t.controller.getSnapshot().length, 1);
    assert.equal(t.controller.getSnapshot()[0].name, "Edited-project.ifcpp");
    assert.equal(t.clean?.signature, text);
    assert.equal(t.state.name, "Edited project");
  });

  it("creates a reopenable recent copy for a project without an identity", async () => {
    const t = setup(null);
    assert.equal(await saveBrowserProjectLocally(t.options), true);
    assert.match(t.clean!.key, /^browser:/);
    assert.equal(JSON.parse((await t.controller.readBrowser(t.clean!.key))!).metadata.name, "Edited project");
  });

  it("does not mark clean or permit replacement when the copy cannot be stored", async () => {
    const t = setup();
    await assert.rejects(saveBrowserProjectLocally({ ...t.options, remember: async () => { throw new Error("quota"); } }), /quota/);
    assert.equal(t.clean, null);
    assert.equal(t.copies.size, 0);
  });

  it("does not mark another or newer project state clean after a delayed save", async () => {
    const t = setup();
    assert.equal(await saveBrowserProjectLocally({ ...t.options, isCurrent: () => false }), false);
    assert.equal(t.clean, null);
    assert.equal(JSON.parse((await t.controller.readBrowser("browser:existing"))!).metadata.name, "Edited project");
  });
});
