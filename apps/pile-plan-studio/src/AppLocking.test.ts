import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./app/session/AppSession.tsx", import.meta.url), "utf8");

describe("lock-editing session wiring", () => {
  it("uses transient updates for draft actions and a project commit for Apply", () => {
    assert.match(source, /setProjectState\(beginLoadPointLockEditing\)/);
    assert.match(source, /setProjectState\(cancelLoadPointLockEditing\)/);
    assert.match(source, /commitProjectState\(finishLoadPointLockEditing\)/);
  });
});
