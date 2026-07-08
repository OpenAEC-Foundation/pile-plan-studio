import { writeFileSync } from "node:fs";
import { join } from "node:path";

const packageDir = join(process.cwd(), "src", "wasm", "pile-plan-wasm");

writeFileSync(
  join(packageDir, ".gitignore"),
  [
    "!.gitignore",
    "!package.json",
    "!*.js",
    "!*.d.ts",
    "!*.wasm",
    "",
  ].join("\n"),
);
