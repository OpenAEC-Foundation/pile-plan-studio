import { readFileSync } from "node:fs";
import { it } from "node:test";
import assert from "node:assert/strict";

it("provides the MCP connection copy in Dutch and English", () => {
  const nl = JSON.parse(readFileSync("src/i18n/locales/nl/settings.json", "utf8"));
  const en = JSON.parse(readFileSync("src/i18n/locales/en/settings.json", "utf8"));
  assert.deepEqual(Object.keys(nl.mcp).sort(), Object.keys(en.mcp).sort());
  assert.equal(typeof nl.mcp.description, "string");
  assert.equal(typeof nl.mcp.allowEdits, "string");
  assert.equal(typeof en.mcp.allowEdits, "string");
  assert.equal(typeof en.mcp.copyToken, "string");
});
