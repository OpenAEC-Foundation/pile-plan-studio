/**
 * The assistant tools of the OpenAEC SuperCloud workplace as a file next to the bundle:
 * apps/pile-plan-studio/public/mcp-tools.json. The same list as `window.__OPDS_APP__.definitions()`
 * (src/app/supercloud/siteHost.ts): the MCP tools without file operations and imports.
 *
 *   node tools/werkplek-tools.mjs           write
 *   node tools/werkplek-tools.mjs --check   compare only
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const app = fileURLToPath(new URL("../apps/pile-plan-studio/", import.meta.url));
const require = createRequire(`${app}package.json`);
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const target = `${app}public/mcp-tools.json`;

const server = await createServer({ root: app, configFile: false, logLevel: "error", appType: "custom",
  server: { middlewareMode: true, hmr: false } });
let text;
try {
  const { workplaceTools, workplaceDefinition } = await server.ssrLoadModule("/src/app/supercloud/siteHost.ts");
  text = JSON.stringify(workplaceTools().map(workplaceDefinition), null, 2) + "\n";
} finally {
  await server.close();
}
if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(target, "utf8"); } catch { /* missing */ }
  if (current !== text) {
    console.error("apps/pile-plan-studio/public/mcp-tools.json is out of date: run node tools/werkplek-tools.mjs");
    process.exit(1);
  }
  console.log(`Workplace tools: ${JSON.parse(text).length}, equal to the MCP server.`);
} else {
  writeFileSync(target, text);
  console.log(`Written: apps/pile-plan-studio/public/mcp-tools.json (${JSON.parse(text).length} tools)`);
}
