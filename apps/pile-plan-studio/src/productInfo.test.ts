import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const productInfo = readFileSync(resolve(import.meta.dirname, "productInfo.ts"), "utf8");
const settings = readFileSync(
  resolve(import.meta.dirname, "components/template/settings/SettingsDialog.tsx"),
  "utf8",
);
const backstage = readFileSync(
  resolve(import.meta.dirname, "components/template/backstage/Backstage.tsx"),
  "utf8",
);
const englishSettings = readFileSync(
  resolve(import.meta.dirname, "i18n/locales/en/settings.json"),
  "utf8",
);
const dutchSettings = readFileSync(
  resolve(import.meta.dirname, "i18n/locales/nl/settings.json"),
  "utf8",
);
const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));
const tauriConfig = JSON.parse(readFileSync(resolve(import.meta.dirname, "../src-tauri/tauri.conf.json"), "utf8"));

describe("product information", () => {
  it("defines one build-versioned product identity", () => {
    assert.match(productInfo, /name:\s*"Pile Plan Studio"/);
    assert.match(productInfo, /version:\s*__APP_VERSION__/);
    assert.match(productInfo, /status:\s*"Alpha"/);
    assert.match(productInfo, /organization:\s*"OpenAEC Foundation"/);
    assert.match(productInfo, /license:\s*"LGPL-3\.0-or-later"/);
  });

  it("identifies the 0.2.2 alpha consistently in web and desktop packages", () => {
    assert.equal(packageJson.version, "0.2.2");
    assert.equal(tauriConfig.version, "0.2.2");
  });

  it("uses the shared identity in both About views", () => {
    assert.match(settings, /PRODUCT_INFO/);
    assert.match(backstage, /PRODUCT_INFO/);
    assert.doesNotMatch(settings, /Open Template|0\.1\.7|template application/i);
    assert.doesNotMatch(backstage, /0\.1\.7/);
  });

  it("provides localized product-facing About copy", () => {
    assert.match(englishSettings, /Create and evaluate pile plans/);
    assert.match(englishSettings, /"organization": "Part of"/);
    assert.match(dutchSettings, /Maak en beoordeel palenplannen/);
    assert.match(dutchSettings, /"organization": "Onderdeel van"/);
  });
});
