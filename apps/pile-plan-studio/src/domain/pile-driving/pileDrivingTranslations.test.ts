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
  assert.deepEqual(Object.keys(nl.assessment), Object.keys(en.assessment));
  assert.equal(nl.ignoreCsvLeadingZeros, "Voorloopnullen negeren");
  assert.equal(en.ignoreCsvLeadingZeros, "Ignore leading zeros");
  assert.equal(nl.importSettings, "Importinstellingen");
  assert.equal(en.importSettings, "Import settings");
  assert.equal(nl.checks.settings, "Controle-instellingen");
  assert.equal(en.checks.settings, "Check settings");
  for (const language of ["nl", "en"]) {
    const common = load(language, "common");
    const panel = load(language, "rightPanel");
    assert.ok(common.history.actions["driving-color-visibility"].trim());
    for (const status of ["good", "doubtful", "deviation"]) {
      const label = panel.pileDriving.assessment[status];
      assert.ok(label.trim());
      assert.ok(common.viewer.drivingStatus[status].endsWith(label));
      const short = panel.pileDriving.assessment.short[status];
      assert.ok(short.trim() && short.length <= label.length);
    }
    assert.equal(panel.pileDriving.mark, common.tableImport.fields["revit-mark"]);
    assert.ok(panel["selectionOverview.pileNumbers"].trim());
    assert.ok(panel["loadPoints.pileName"].includes("{{number}}"));
    assert.ok(panel["cpts.editMember"].includes("{{name}}"));
    assert.ok(panel.pileDriving.assessment.showColors.trim());
    assert.ok(panel.pileDriving.assessment.automatic.includes("{{status}}"));
    assert.ok(panel.pileDriving.assessment.automaticChoice.trim());
    assert.ok(panel.pileDriving.assessment.reason.trim());
    assert.ok(panel.pileDriving.assessment.reasonSaveFailed.trim());
    assert.ok(panel.pileDriving.assessment.mixedReasons.trim());
    assert.ok(panel.pileDriving.checks.labels["manual-status"].trim());
    assert.ok(panel.pileDriving.assessment.selectedLocations_other.includes("{{count}}"));
  }
  for (const labels of [nl, en]) {
    for (const key of ["addFiles", "empty", "removeFile", "allFiles", "exampleFile", "independentSettings", "sharedHelp", "resetTable"]) {
      assert.ok(labels[key].trim());
    }
    for (const key of ["paalnummer", "referentieniveau", "mm_zakking_per_tocht", "energie_per_slag_kj"]) {
      assert.ok(labels.columns[key].trim());
    }
    assert.ok(Object.values(labels.overview).every(value => typeof value === "string" && value.trim()));
    assert.ok(labels.overview.followFilter.trim());
    assert.ok(labels.overview.checkAll.trim());
    assert.ok(labels.overview.uncheckAll.trim());
    assert.ok(labels.overview.filteredCount.includes("{{shown}}") && labels.overview.filteredCount.includes("{{total}}"));
  }
  assert.deepEqual(Object.keys(nl.checks), Object.keys(en.checks));
  for (const part of ["labels", "status", "values", "limits", "energyBySize", "neighborhood", "neighborhoodCptMatching"]) {
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
    assert.ok(labels.checks.limits.energy_window_increments.trim());
    assert.ok(labels.checks.limits.neighborhood_window_increments.trim());
    assert.ok(labels.checks.limits.neighborhood_minimum_peers.trim());
    for (const mode of ["identical", "include-all", "allow-one-missing"]) {
      assert.ok(labels.checks.neighborhoodCptMatching[mode].trim());
    }
    assert.ok(labels.checks.remarkRecorded.trim());
    assert.ok(labels.checks.neighborhood.locationFallback.includes("{{id}}"));
    assert.ok(labels.checks.settingsHelp.trim());
    assert.ok(labels.checks.neighborhood.show.trim());
    assert.ok(labels.checks.neighborhood.hide.trim());
    assert.ok(labels.checks.neighborhood.titleBySize.includes("{{size}}"));
    for (const value of ["reference", "actual", "other", "tolerance"]) {
      assert.ok(labels.checks.values.trend.includes(`{{${value}}}`));
      assert.ok(labels.checks.values.neighborhood.includes(`{{${value}}}`));
    }
  }
  for (const language of ["nl", "en"]) {
    assert.ok(load(language, "ribbon").plan.pileDriving.trim());
  }
});
