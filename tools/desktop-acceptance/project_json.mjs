import { readFileSync } from "node:fs";
import { initSync, read_project_document } from "../../apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/pile_plan_wasm.js";

const wasm = new URL("../../apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm", import.meta.url);
initSync({ module: readFileSync(wasm) });
const { project } = read_project_document({ contents: readFileSync(0, "utf8") });
process.stdout.write(JSON.stringify(project, (_key, value) => {
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value === "bigint") return String(value);
  return value;
}));
