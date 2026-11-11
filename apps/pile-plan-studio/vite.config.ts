import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import packageJson from "./package.json" with { type: "json" };
import { readFileSync } from "node:fs";
import { releaseInfo } from "../../tools/release-version.mjs";

/**
 * The SuperCloud workplace build (`npm run build:platform`): the icon sprites inline in index.html, because a frame
 * with an opaque origin refuses a <use> into a separate SVG file (studioSprite.ts, SimpleIconControls.tsx).
 */
function inlineSprites() {
  return {
    name: "openaec-inline-sprites",
    enforce: "pre" as const,
    apply: (_config: unknown, env: { mode: string }) => env.mode === "platform",
    // The sprite URL is empty in this build, so studioSprite.ts needs no generated manifest: a stub keeps the list of
    // Blueprint file names out of the bundle (the workplace checks every file name a bundle mentions).
    resolveId(source: string, importer?: string) {
      return source === "./manifest.json" && importer?.replaceAll("\\", "/").endsWith("src/openaec/studioSprite.ts")
        ? "\0openaec-manifest-stub" : null;
    },
    load(id: string) {
      return id === "\0openaec-manifest-stub"
        ? 'export default { generated: [{ path: "icons/studio.svg", sha256: "" }] };' : null;
    },
    transformIndexHtml(html: string) {
      const sprites = ["src/openaec/icons/studio.svg", "src/components/template/icons/simple-controls.svg",
        "src/components/template/icons/pile-plan-proposals.svg", "src/components/domain/right-panel/cptAlgorithmDiagrams.svg"]
        .map((path) => readFileSync(new URL(`./${path}`, import.meta.url), "utf8").replace(/<\?xml[^>]*>\s*/, "")
          .replace("<svg", '<svg style="display:none" aria-hidden="true"'))
        .join("");
      return html.replace("<body>", `<body>${sprites}`);
    },
  };
}

const productRelease = releaseInfo(packageJson, { allowLegacy: true });

export default defineConfig({
  plugins: [react(), inlineSprites()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_RELEASE_STATUS__: JSON.stringify(productRelease.status),
  },
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
