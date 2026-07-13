import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getProjectFileCommands, projectFileName, saveGeneratedFile, savePreparedFile } from "./projectPersistence.ts";

describe("project persistence", () => {
  it("offers download only in the browser", () => {
    assert.deepEqual(getProjectFileCommands(false), { save: false, saveAs: false, download: true });
  });

  it("offers save and save as only on desktop", () => {
    assert.deepEqual(getProjectFileCommands(true), { save: true, saveAs: true, download: false });
  });

  it("creates a safe IFCPP file name", () => {
    assert.equal(projectFileName("LIS Gebouw"), "LIS-Gebouw.ifcpp");
    assert.equal(projectFileName(""), "pile-plan-project.ifcpp");
  });

  it("opens the file picker before generating asynchronous file contents", async () => {
    const events: string[] = [];
    const blob = new Blob(["project"]);

    const saved = await saveGeneratedFile(
      { fileName: "project.ifcpp", mimeType: "application/json", extensions: [".ifcpp"] },
      async () => {
        events.push("generate");
        return blob;
      },
      {
        pickFile: async () => {
          events.push("pick");
          return {
            write: async (value) => {
              assert.equal(value, blob);
              events.push("write");
            },
          };
        },
        downloadFile: () => events.push("download"),
      },
    );

    assert.equal(saved, true);
    assert.deepEqual(events, ["pick", "generate", "write"]);
  });

  it("falls back to a browser download when no file picker is available", async () => {
    const downloads: Array<{ blob: Blob; fileName: string }> = [];
    const events: string[] = [];
    const blob = new Blob(["image"]);

    const saved = await saveGeneratedFile(
      { fileName: "view.png", mimeType: "image/png", extensions: [".png"] },
      async () => {
        events.push("generate");
        return blob;
      },
      {
        waitForPaint: async () => { events.push("paint"); },
        downloadFile: (value, fileName) => {
          events.push("download");
          downloads.push({ blob: value, fileName });
        },
        waitForDownloadHandoff: async () => { events.push("handoff"); },
      },
    );

    assert.equal(saved, true);
    assert.deepEqual(events, ["paint", "generate", "download", "handoff"]);
    assert.deepEqual(downloads, [{ blob, fileName: "view.png" }]);
  });

  it("paints the busy state before starting a prepared fallback download", async () => {
    const events: string[] = [];
    const saved = await savePreparedFile(
      { fileName: "project.ifcpp", mimeType: "application/json", extensions: [".ifcpp"] },
      new Blob(["project"]),
      {
        waitForPaint: async () => { events.push("paint"); },
        downloadFile: () => events.push("download"),
        waitForDownloadHandoff: async () => { events.push("handoff"); },
      },
    );

    assert.equal(saved, true);
    assert.deepEqual(events, ["paint", "download", "handoff"]);
  });

  it("keeps the temporary download link alive until the WebView accepts it", () => {
    const source = readFileSync(new URL("./projectPersistence.ts", import.meta.url), "utf8");
    assert.match(source, /window\.setTimeout\(\(\) => \{\s*link\.remove\(\);\s*URL\.revokeObjectURL\(url\);/);
    assert.doesNotMatch(source, /link\.click\(\);\s*link\.remove\(\);/);
  });
});
