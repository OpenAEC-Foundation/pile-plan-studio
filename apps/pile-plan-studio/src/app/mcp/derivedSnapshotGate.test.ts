import { it } from "node:test";
import assert from "node:assert/strict";
import { createDerivedSnapshotGate } from "./derivedSnapshotGate.ts";

it("marks a retained result pending until a snapshot for changed inputs arrives", () => {
  const oldSnapshot = { status: "ready" };
  const nextSnapshot = { status: "ready" };
  const gate = createDerivedSnapshotGate("old", oldSnapshot);
  assert.equal(gate.observe("old", oldSnapshot), false);
  assert.equal(gate.observe("new", oldSnapshot), true);
  assert.equal(gate.observe("new", nextSnapshot), false);
});
