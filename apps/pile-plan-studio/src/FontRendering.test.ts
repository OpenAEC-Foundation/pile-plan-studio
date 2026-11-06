import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const appCss = readFileSync(resolve(import.meta.dirname, "App.css"), "utf8");
const ribbonCss = readFileSync(resolve(import.meta.dirname, "components/template/ribbon/Ribbon.css"), "utf8");
const fontCss = readFileSync(resolve(import.meta.dirname, "openaec/openaec-fonts.css"), "utf8");

describe("bundled UI font rendering", () => {
  it("ships every OpenAEC UI font used by the application", () => {
    for (const fileName of [
      "Inter-Regular.ttf",
      "Inter-Medium.ttf",
      "Inter-SemiBold.ttf",
      "SpaceGrotesk-Medium.ttf",
      "SpaceGrotesk-Bold.ttf",
    ]) {
      assert.equal(existsSync(resolve(import.meta.dirname, "openaec/fonts", fileName)), true, fileName);
      assert.match(fontCss, new RegExp(fileName.replace(".", "\\.")));
    }
  });

  it("maps real font weights without synthetic bold or GPU text overrides", () => {
    assert.match(fontCss, /font-family:\s*"Inter";[^}]*?font-weight:\s*400/);
    assert.match(fontCss, /font-family:\s*"Inter";[^}]*?font-weight:\s*500/);
    assert.match(fontCss, /font-family:\s*"Inter";[^}]*?font-weight:\s*600/);
    assert.match(fontCss, /font-family:\s*"Space Grotesk";[^}]*?font-weight:\s*700/);
    assert.match(fontCss, /font-display:\s*swap/);
    assert.match(appCss, /font-synthesis:\s*none/);
    assert.doesNotMatch(appCss, /font-weight:\s*650/);
    assert.doesNotMatch(ribbonCss, /translateZ\(0\)|text-rendering|font-smoothing/);
  });

  it("resolves every bundled font fallback offline and includes its licence", () => {
    for (const [, path] of fontCss.matchAll(/url\("([^"]+)"\)/g)) {
      assert.equal(existsSync(resolve(import.meta.dirname, "openaec", path)), true, path);
    }
    for (const family of ["Inter", "SpaceGrotesk", "JetBrainsMono", "NotoSans"]) {
      assert.equal(existsSync(resolve(import.meta.dirname, `openaec/fonts/${family}-OFL.txt`)), true);
    }
    assert.match(fontCss, /font-family:\s*"Inter AEC"/);
  });
});
