import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const appCss = readFileSync(resolve(import.meta.dirname, "App.css"), "utf8");
const ribbonCss = readFileSync(resolve(import.meta.dirname, "components/template/ribbon/Ribbon.css"), "utf8");

describe("bundled UI font rendering", () => {
  it("ships every OpenAEC UI font used by the application", () => {
    for (const fileName of [
      "Inter-Regular.ttf",
      "Inter-Medium.ttf",
      "Inter-SemiBold.ttf",
      "SpaceGrotesk-Medium.ttf",
      "SpaceGrotesk-Bold.ttf",
    ]) {
      assert.equal(existsSync(resolve(import.meta.dirname, "../public/fonts", fileName)), true, fileName);
      assert.match(appCss, new RegExp(fileName.replace(".", "\\.")));
    }
  });

  it("maps real font weights without synthetic bold or GPU text overrides", () => {
    assert.match(appCss, /font-family:\s*"Inter";[\s\S]*?font-weight:\s*400/);
    assert.match(appCss, /font-family:\s*"Inter";[\s\S]*?font-weight:\s*500/);
    assert.match(appCss, /font-family:\s*"Inter";[\s\S]*?font-weight:\s*600/);
    assert.match(appCss, /font-family:\s*"Space Grotesk";[\s\S]*?font-weight:\s*700/);
    assert.match(appCss, /font-display:\s*swap/);
    assert.match(appCss, /font-synthesis:\s*none/);
    assert.doesNotMatch(appCss, /font-weight:\s*650/);
    assert.doesNotMatch(ribbonCss, /translateZ\(0\)|text-rendering|font-smoothing/);
  });
});
