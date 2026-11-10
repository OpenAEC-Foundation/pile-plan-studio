import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import packageJson from "./package.json" with { type: "json" };
import { releaseInfo } from "../../tools/release-version.mjs";

const productRelease = releaseInfo(packageJson, { allowLegacy: true });

function supercloud(): Plugin {
  return {
    name: "pile-plan-supercloud",
    transformIndexHtml(html) {
      return html.replace(/^\s*<script id="openaec-analytics-loader"[^>]*><\/script>\s*$/m, "");
    },
    async generateBundle() {
      const { siteToolDefinitions } = await import("./src/app/supercloud/siteMcpTools.ts");
      this.emitFile({
        type: "asset",
        fileName: "mcp-tools.json",
        source: JSON.stringify({ tools: siteToolDefinitions() }, null, 2) + "\n",
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const platform = mode === "platform";
  return {
    plugins: [react(), ...(platform ? [supercloud()] : [])],
    ...(platform ? {
      base: "./",
      build: { outDir: "dist-platform", assetsInlineLimit: 0 },
      worker: { format: "es" as const },
    } : {}),
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
  };
});
