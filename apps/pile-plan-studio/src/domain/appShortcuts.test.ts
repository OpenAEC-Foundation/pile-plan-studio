import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyAppShortcut } from "./appShortcuts.ts";

describe("application shortcuts", () => {
  it("recognizes save in desktop and browser without depending on focused editors", () => {
    const event = { key: "s", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false };
    assert.equal(classifyAppShortcut(event, true), "save");
    assert.equal(classifyAppShortcut(event, false), "save");
  });

  it("ignores repeated, alt-modified, and unmodified save keys", () => {
    assert.equal(classifyAppShortcut({ key: "s", ctrlKey: true, repeat: true }, true), null);
    assert.equal(classifyAppShortcut({ key: "s", ctrlKey: true, altKey: true }, true), null);
    assert.equal(classifyAppShortcut({ key: "s" }, true), null);
  });

  it("recognizes desktop zoom shortcuts and leaves browser zoom native", () => {
    const modified = (key: string, shiftKey = false) => ({ key, ctrlKey: true, shiftKey });
    assert.equal(classifyAppShortcut(modified("+"), true), "zoom-in");
    assert.equal(classifyAppShortcut(modified("="), true), "zoom-in");
    assert.equal(classifyAppShortcut(modified("-"), true), "zoom-out");
    assert.equal(classifyAppShortcut(modified("_", true), true), "zoom-out");
    assert.equal(classifyAppShortcut(modified("0"), true), "zoom-reset");
    assert.equal(classifyAppShortcut(modified("+"), false), null);
    assert.equal(classifyAppShortcut(modified("-"), false), null);
    assert.equal(classifyAppShortcut(modified("0"), false), null);
  });

  it("opens a project with Ctrl+O in the desktop runtime", () => {
    const event = { key: "o", ctrlKey: true, repeat: false };
    assert.equal(classifyAppShortcut(event, true), "open");
    assert.equal(classifyAppShortcut(event, false), null);
  });
});
