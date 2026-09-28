import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMcpFileOperationSession } from "./fileOperationSession.ts";

const marker = { project_instance_id: "project-a", project_revision: 4 };

describe("MCP file operations", () => {
  it("returns a handle before the dialog settles and reports cancellation", async () => {
    let finish!: (value: { status: "cancelled" }) => void;
    const session = createMcpFileOperationSession({
      run: () => new Promise((resolve) => { finish = resolve; }),
    });
    const started = session.start({ kind: "open" }, marker);
    assert.equal(typeof started.data.operation_id, "string");
    assert.equal(session.status(started.data.operation_id as string).data.status, "pending");
    await Promise.resolve();
    finish({ status: "cancelled" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(session.status(started.data.operation_id as string).data.status, "cancelled");
  });

  it("refuses another active dialog and never returns a local path", async () => {
    let finish!: (value: { status: "completed"; basename: string; path: string }) => void;
    const session = createMcpFileOperationSession({ run: () => new Promise((resolve) => { finish = resolve; }) });
    const first = session.start({ kind: "save" }, marker);
    assert.throws(() => session.start({ kind: "save-as" }, marker), /file_operation_busy/);
    await Promise.resolve();
    finish({ status: "completed", basename: "model.ifcpp", path: "C:\\secret\\model.ifcpp" });
    await new Promise((resolve) => setImmediate(resolve));
    const result = session.status(first.data.operation_id as string);
    assert.equal(result.data.basename, "model.ifcpp");
    assert.equal(JSON.stringify(result).includes("C:\\secret"), false);
  });

  it("invalidates pending work when the bridge stops", async () => {
    let validAtFinish!: () => boolean;
    let finish!: (value: { status: "completed"; basename: string }) => void;
    const session = createMcpFileOperationSession({
      run: (_request, _marker, isValid) => {
        validAtFinish = isValid;
        return new Promise((resolve) => { finish = resolve; });
      },
    });
    session.start({ kind: "open" }, marker);
    await Promise.resolve();
    session.invalidate();
    assert.equal(validAtFinish(), false);
    finish({ status: "completed", basename: "late.ifcpp" });
    await assert.rejects(async () => session.start({ kind: "open" }, marker), /file_operation_unavailable/);
  });
});
