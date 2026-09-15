import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Cost settings panel", () => {
  const source = readFileSync(resolve(import.meta.dirname, "CostCatalogEditor.tsx"), "utf8");

  it("groups project sizes separately from collapsed other sizes", () => {
    assert.match(source, /partitionPileCostItems/);
    assert.match(source, /cost\.projectSizes/);
    assert.match(source, /cost\.otherSizes/);
    assert.match(source, /<details/);
    assert.match(source, /missingSizes/);
  });

  it("supports adding sizes and protects used rows from deletion", () => {
    assert.match(source, /addPileCostItem/);
    assert.match(source, /removePileCostItem/);
    assert.match(source, /usedPileSizes\.has/);
  });

  it("labels costs with the project currency and omits pile head level", () => {
    assert.match(source, /currencyCode/);
    assert.doesNotMatch(source, /pileHeadLevel/);
  });

  it("exposes explicit personal and built-in default actions", () => {
    assert.match(source, /onSavePersonalDefault/);
    assert.match(source, /onLoadPersonalDefault/);
    assert.match(source, /onRemovePersonalDefault/);
    assert.match(source, /onLoadBuiltInDefault/);
    assert.match(source, /window\.confirm/);
  });

  it("shows bilingual provenance and scope for the built-in cost default", () => {
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../i18n/locales/en/rightPanel.json"), "utf8"));
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../i18n/locales/nl/rightPanel.json"), "utf8"));

    assert.match(source, /cost\.builtInSourceTitle/);
    assert.match(source, /cost\.builtInSourceDescription/);
    assert.match(en["cost.builtInSourceTitle"], /built-in default source/i);
    assert.match(en["cost.builtInSourceDescription"], /CROW/);
    assert.match(en["cost.builtInSourceDescription"], /December 2025/);
    assert.match(en["cost.builtInSourceDescription"], /fixed project costs are excluded/i);
    assert.match(nl["cost.builtInSourceTitle"], /bron ingebouwde standaardwaarden/i);
    assert.match(nl["cost.builtInSourceDescription"], /CROW/);
    assert.match(nl["cost.builtInSourceDescription"], /december 2025/);
    assert.match(nl["cost.builtInSourceDescription"], /vaste projectkosten zijn niet inbegrepen/i);
  });

  it("uses theme-aware controls for the catalog editor", () => {
    const styles = readFileSync(resolve(import.meta.dirname, "costSettings.css"), "utf8");
    assert.match(source, /<ThemedSelect/);
    assert.doesNotMatch(source, /<select/);
    assert.match(styles, /\.cost-add-grid input/);
    assert.match(styles, /var\(--theme-dialog-input-bg\)/);
    assert.match(styles, /\.cost-default-actions button/);
    assert.match(styles, /\.cost-add-grid\s*{[\s\S]*?font-size:\s*11px/);
    assert.match(styles, /\.cost-settings-panel \.cost-settings-table \.themed-select\s*{[\s\S]*?width:\s*100%/);
  });
});
