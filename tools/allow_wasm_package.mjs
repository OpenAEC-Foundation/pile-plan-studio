import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const relativePackageDir = process.argv[2];
if (!relativePackageDir) {
  throw new Error("Expected the generated WASM package directory as the first argument.");
}
const packageDir = resolve(process.cwd(), relativePackageDir);

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
