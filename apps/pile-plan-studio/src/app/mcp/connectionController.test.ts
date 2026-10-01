import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpConnectionController } from "./connectionController.ts";

const connection = { endpoint: "local", token: "token" };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(start = async () => connection) {
  let stops = 0, disposals = 0, disabled = 0;
  const controller = createMcpConnectionController({ isDesktop: () => true,
    createBridge: async () => ({ start, stop: async () => { stops++; } }),
    createSession: () => ({ dispatch: async () => "{}", dispose: () => { disposals++; } }),
    disableWrites: () => { disabled++; },
  });
  return { controller, counts: () => ({ stops, disposals, disabled }) };
}
test("start publishes connection and stop disposes the scoped session and disables writes", async () => {
  const { controller, counts } = setup();
  await controller.setEnabled(true);
  assert.equal(controller.getState().status, "on");
  assert.equal(controller.getState().connection, connection);
  await controller.setEnabled(false);
  assert.equal(controller.getState().status, "off");
  assert.deepEqual(counts(), { stops: 1, disposals: 1, disabled: 1 });
});
test("redundant enable does not invalidate a connected session", async () => {
  const { controller, counts } = setup();
  await controller.setEnabled(true);
  await controller.setEnabled(true);
  assert.equal(controller.getState().status, "on");
  assert.equal(counts().disposals, 0);
});
test("stop during startup cannot publish a late connection", async () => {
  const started = deferred<typeof connection>();
  const { controller } = setup(() => started.promise);
  const enabling = controller.setEnabled(true);
  await Promise.resolve();
  const stopping = controller.setEnabled(false);
  started.resolve(connection);
  await Promise.all([enabling, stopping]);
  assert.equal(controller.getState().status, "off");
  assert.equal(controller.getState().connection, null);
});
test("late failure from a stopped run cannot dispose a newer session", async () => {
  const first = deferred<typeof connection>();
  let starts = 0;
  const { controller, counts } = setup(() => ++starts === 1 ? first.promise : Promise.resolve(connection));
  const old = controller.setEnabled(true);
  await Promise.resolve();
  const stopping = controller.setEnabled(false);
  const restarting = controller.setEnabled(true);
  first.reject(new Error("old failure"));
  await Promise.all([old, stopping, restarting]);
  assert.equal(controller.getState().status, "on");
  assert.equal(counts().disposals, 1);
});
test("disposal prevents late startup status and disposes its session", async () => {
  const started = deferred<typeof connection>();
  const { controller, counts } = setup(() => started.promise);
  const enabling = controller.setEnabled(true);
  await Promise.resolve();
  controller.dispose();
  started.resolve(connection);
  await enabling;
  assert.equal(controller.getState().connection, null);
  assert.equal(counts().disposals, 1);
});

test("repeated enable during startup retains the original connection attempt", async () => {
  const started = deferred<typeof connection>();
  const { controller } = setup(() => started.promise);
  const enabling = controller.setEnabled(true);
  await controller.setEnabled(true);
  started.resolve(connection);
  await enabling;
  assert.equal(controller.getState().status, "on");
});

test("startup failure cleans its session and publishes the error", async () => {
  const { controller, counts } = setup(async () => { throw new Error("listener unavailable"); });
  await controller.setEnabled(true);
  assert.equal(controller.getState().status, "error");
  assert.equal(controller.getState().error, "listener unavailable");
  assert.equal(counts().disposals, 1);
});

test("a new native listener starts only after the previous listener stops", async () => {
  const stopped = deferred<void>();
  let starts = 0;
  const controller = createMcpConnectionController({ isDesktop: () => true,
    createBridge: async () => ({ start: async () => { starts++; return connection; }, stop: () => stopped.promise }),
    createSession: () => ({ dispatch: async () => "{}", dispose: () => {} }), disableWrites: () => {},
  });
  await controller.setEnabled(true);
  const stopping = controller.setEnabled(false);
  const restarting = controller.setEnabled(true);
  await Promise.resolve();
  assert.equal(starts, 1);
  stopped.resolve();
  await Promise.all([stopping, restarting]);
  assert.equal(starts, 2);
  assert.equal(controller.getState().status, "on");
});

test("browser connections never create a native bridge", async () => {
  const controller = createMcpConnectionController({ isDesktop: () => false,
    createBridge: async () => { throw new Error("unexpected native bridge"); },
    createSession: () => { throw new Error("unexpected session"); }, disableWrites: () => {},
  });
  await controller.setEnabled(true);
  assert.equal(controller.getState().status, "off");
});

test("restart waits for a cancelled startup to finish its native cleanup", async () => {
  const first = deferred<typeof connection>();
  let starts = 0;
  const { controller } = setup(() => ++starts === 1 ? first.promise : Promise.resolve(connection));
  const starting = controller.setEnabled(true);
  await Promise.resolve();
  const stopping = controller.setEnabled(false);
  const restarting = controller.setEnabled(true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(starts, 1);
  first.reject(new Error("cancelled startup"));
  await Promise.all([starting, stopping, restarting]);
  assert.equal(starts, 2);
  assert.equal(controller.getState().status, "on");
});
