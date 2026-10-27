import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
test("pile-cap controls and limitations are translated in Dutch and English", () => {
  const read = (language: string) =>
    JSON.parse(
      readFileSync(
        new URL(
          `../../../i18n/locales/${language}/rightPanel.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ).pileCap as Record<string, string>;
  const nl = read("nl"),
    en = read("en");
  assert.deepEqual(Object.keys(nl).sort(), Object.keys(en).sort());
  for (const key of [
    "title",
    "proposal",
    "increase",
    "decrease",
    "rotate",
    "reset",
    "resetLabel",
    "forces",
    "assumptions",
    "groupChanged",
    "missingSelection",
    "failed",

  ]) {
    assert.ok(nl[key]);
    assert.ok(en[key]);
  }
  assert.match(nl.assumptions, /geen momenten/);
  assert.match(en.assumptions, /no moments/);
});
