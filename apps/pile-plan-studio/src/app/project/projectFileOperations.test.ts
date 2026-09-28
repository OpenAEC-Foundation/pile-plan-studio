import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runProjectFileOperation } from "./projectFileOperations.ts";
import { McpReadError } from "../mcp/readModel.ts";

const marker = { project_instance_id: "one", project_revision: 2 };

describe("project file operations", () => {
  it("does not write a project changed while Save As was open", async () => {
    let current = { ...marker };
    let writes = 0;
    let saved = 0;
    const result = await runProjectFileOperation({ kind: "save-as" }, marker, () => true, {
      currentMarker: () => current,
      currentPath: () => null,
      chooseOpen: async () => null,
      chooseSave: async () => { current = { ...marker, project_revision: 3 }; return "C:\\plans\\new.ifcpp"; },
      suggestedName: () => "new.ifcpp",
      openProject: async () => true,
      serialize: async () => "{}",
      writeProject: async () => { writes++; },
      didSave: () => { saved++; },
    });
    assert.equal(result.status, "failed");
    assert.equal(writes, 0);
    assert.equal(saved, 0);
  });

  it("does not mark clean when a disk write fails", async () => {
    let saved = 0;
    const result = await runProjectFileOperation({ kind: "save" }, marker, () => true, {
      currentMarker: () => marker,
      currentPath: () => "C:\\plans\\old.ifcpp",
      chooseOpen: async () => null,
      chooseSave: async () => null,
      suggestedName: () => "old.ifcpp",
      openProject: async () => true,
      serialize: async () => "{}",
      writeProject: async () => { throw new Error("disk full"); },
      didSave: () => { saved++; },
    });
    assert.equal(result.status, "failed");
    assert.equal(saved, 0);
  });

  it("treats a cancelled picker as no project change", async () => {
    let opened = 0;
    const result = await runProjectFileOperation({ kind: "open" }, marker, () => true, {
      currentMarker: () => marker,
      currentPath: () => null,
      chooseOpen: async () => null,
      chooseSave: async () => null,
      suggestedName: () => "project.ifcpp",
      openProject: async () => { opened++; return true; },
      serialize: async () => "{}",
      writeProject: async () => {},
      didSave: () => {},
    });
    assert.equal(result.status, "cancelled");
    assert.equal(opened, 0);
  });

  it("does not export a plan after the project changes in the Save dialog", async () => {
    let current = { ...marker };
    let writes = 0;
    let pickerOpened = false;
    const result = await runProjectFileOperation({ kind: "export", planId: "plan-b", format: "csv" }, marker,
      () => true, {
        currentMarker: () => current,
        currentPath: () => null,
        chooseOpen: async () => null,
        chooseSave: async () => null,
        chooseExport: async () => { pickerOpened = true; current = { ...marker, project_revision: 3 }; return "C:\\plans\\plan-b.csv"; },
        suggestedName: () => "project.ifcpp",
        openProject: async () => true,
        serialize: async () => "{}",
        writeProject: async () => {},
        didSave: () => {},
        exportPlan: async () => ({ basename: "plan-b.csv", bytes: new Uint8Array([1, 2]) }),
        writeExport: async () => { writes++; },
      });
    assert.equal(result.status, "failed");
    assert.equal(result.status === "failed" ? result.code : null, "project_changed");
    assert.equal(pickerOpened, true);
    assert.equal(writes, 0);
  });
  it("preserves a specific validation error from export", async () => {
    const result = await runProjectFileOperation({ kind: "export", planId: "missing", format: "csv" }, marker,
      () => true, {
        currentMarker: () => marker, currentPath: () => null,
        chooseOpen: async () => null, chooseSave: async () => null,
        suggestedName: () => "project.ifcpp", openProject: async () => true,
        serialize: async () => "{}", writeProject: async () => {}, didSave: () => {},
        exportPlan: async () => { throw new McpReadError("unknown_plan"); },
        chooseExport: async () => null, writeExport: async () => {},
      });
    assert.equal(result.status, "failed");
    assert.equal(result.status === "failed" ? result.code : null, "unknown_plan");
  });
});
