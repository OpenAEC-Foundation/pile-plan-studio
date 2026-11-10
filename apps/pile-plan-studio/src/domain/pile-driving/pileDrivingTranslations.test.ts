import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("driving record labels and import diagnostics are available in English and Dutch", () => {
  const load = (language: string, namespace: string) => JSON.parse(readFileSync(
    new URL(`../../i18n/locales/${language}/${namespace}.json`, import.meta.url), "utf8",
  ));
  const nl = load("nl", "rightPanel").pileDriving;
  const en = load("en", "rightPanel").pileDriving;
  assert.deepEqual(Object.keys(nl), Object.keys(en));
  assert.deepEqual(Object.keys(nl.columns), Object.keys(en.columns));
  assert.deepEqual(Object.keys(nl.errors), Object.keys(en.errors));
  assert.deepEqual(Object.keys(nl.overview), Object.keys(en.overview));
  for (const labels of [nl, en]) {
    for (const key of ["addFiles", "empty", "removeFile", "allFiles", "exampleFile", "settings", "importSettings", "independentSettings", "sharedHelp", "resetTable"]) {
      assert.ok(labels[key].trim());
    }
    for (const key of ["paalnummer", "referentieniveau", "mm_zakking_per_tocht", "energie_per_slag_kj"]) {
      assert.ok(labels.columns[key].trim());
    }
    assert.ok(Object.values(labels.overview).every(value => typeof value === "string" && value.trim()));
  }
  assert.deepEqual(Object.keys(nl.checks), Object.keys(en.checks));
  for (const part of ["labels", "status", "values", "limits", "energyBySize", "neighborhood"]) {
    assert.deepEqual(Object.keys(nl.checks[part]), Object.keys(en.checks[part]));
    assert.ok(Object.values(nl.checks[part]).every(value => typeof value === "string" && value.trim()));
    assert.ok(Object.values(en.checks[part]).every(value => typeof value === "string" && value.trim()));
  }
  assert.match(nl.checks.limits.peer_energy_spread_kj, /energiespreiding/);
  assert.match(en.checks.limits.peer_energy_spread_kj, /energy spread/);
  assert.ok(nl.checks.energyRange.trim());
  assert.ok(en.checks.energyRange.trim());
  for (const labels of [nl, en]) {
    for (const key of ["planLimits", "calendarLimits", "energyLimits"]) {
      assert.ok(labels.checks[key].trim());
    }
    assert.ok(labels.checks.limits.end_window_increments.trim());
    assert.ok(labels.checks.settingsHelp.trim());
    assert.ok(labels.checks.neighborhood.show.trim());
    assert.ok(labels.checks.neighborhood.hide.trim());
    assert.ok(labels.checks.neighborhood.titleBySize.includes("{{size}}"));
    assert.ok(labels.checks.neighborhood.included.trim());
    for (const value of ["reference", "actual", "other", "tolerance"]) {
      assert.ok(labels.checks.values.trend.includes(`{{${value}}}`));
    }
  }
  for (const language of ["nl", "en"]) {
    assert.ok(load(language, "ribbon").plan.pileDriving.trim());
  }
});
