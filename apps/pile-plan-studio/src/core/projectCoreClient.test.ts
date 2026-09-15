import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  importProjectFromFilesCore,
  previewImportSourceCore,
  readProjectDocumentCore,
  refreshProjectFromFilesCore,
  writeProjectDocumentCore,
} from "./projectCoreClient.ts";

describe("project core client", () => {
  it("owns every project-document command", () => {
    assert.equal([
      importProjectFromFilesCore,
      previewImportSourceCore,
      readProjectDocumentCore,
      refreshProjectFromFilesCore,
      writeProjectDocumentCore,
    ].every((command) => typeof command === "function"), true);
  });

  it("normalizes imports and refreshes through the project-document contract", () => {
    const source = readFileSync(new URL("./projectCoreClient.ts", import.meta.url), "utf8");
    const importStart = source.indexOf("export async function importProjectFromFilesCore");
    const refreshStart = source.indexOf("export async function refreshProjectFromFilesCore");
    const readStart = source.indexOf("export async function readProjectDocumentCore");

    assert.match(source.slice(importStart, refreshStart), /validProjectDocumentFromCore/);
    assert.match(source.slice(refreshStart, readStart), /validProjectDocumentFromCore/);
    assert.match(source, /current_project: toWasmIfcppProject\(input\.currentProject\)/);
    assert.match(source, /optimization_unassigned: toWasmNumberKeyedRecord\(plan\.optimization_unassigned \?\? \{\}\)/);
  });
});
