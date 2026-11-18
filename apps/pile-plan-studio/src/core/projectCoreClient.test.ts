import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "./projectTestSupport.ts";
import { createInitialProjectState } from "../domain/project/projectState.ts";
import { projectDraftFromState } from "../app/project/projectLifecycleController.ts";

import {
  importProjectFromFilesCore,
  previewImportSourceCore,
  readProjectDocumentCore,
  refreshProjectFromFilesCore,
  toWasmIfcppProject,
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

  it("shares background serialization of a browser project snapshot and retries after a worker failure", async () => {
    const project = canonicalProjectForTest(readFileSync(new URL(
      "../../../../sample_project/sample_project.ifcpp", import.meta.url,
    ), "utf8"));
    const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
    const draft = projectDraftFromState(state);
    const jobs: Array<{ id: number; draft: typeof draft }> = [];
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
      terminated = false;
      constructor() { workers.push(this); }
      postMessage(job: typeof jobs[number]) { jobs.push(job); }
      terminate() { this.terminated = true; }
    }
    const original = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker });
    try {
      const prepared = writeProjectDocumentCore(draft);
      const recovery = writeProjectDocumentCore(draft);
      const assertions = [assert.rejects(prepared, /Interrupted/), assert.rejects(recovery, /Interrupted/)];
      for (const assertion of assertions) void assertion.catch(() => {});
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].draft, draft);
      workers[0].onerror!({ message: "Interrupted", preventDefault() {} });
      await Promise.all(assertions);
      assert.equal(workers[0].terminated, true);

      const retry = writeProjectDocumentCore(draft);
      assert.equal(workers.length, 2);
      assert.equal(jobs[1].draft, draft);
      workers[1].onmessage!({ data: { id: jobs[1].id, result: "IFCPP contents" } });
      assert.equal(await retry, "IFCPP contents");
      assert.equal(await writeProjectDocumentCore(draft), "IFCPP contents");
      assert.equal(jobs.length, 2);
    } finally {
      if (original) Object.defineProperty(globalThis, "Worker", original);
      else Reflect.deleteProperty(globalThis, "Worker");
    }
  });

  it("passes pile numbers with numeric location keys to the source refresh core", () => {
    const project = canonicalProjectForTest(readFileSync(new URL(
      "../../../../sample_project/sample_project.ifcpp", import.meta.url,
    ), "utf8"));
    const plan = project.user_state.pile_plans![0];
    const id = project.inputs.load_points[0].id;
    plan.revit_marks_by_load_point = { [id]: "001-A" };

    assert.deepEqual(toWasmIfcppProject(project).user_state.pile_plans?.[0].revit_marks_by_load_point,
      new Map([[id, "001-A"]]));
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
