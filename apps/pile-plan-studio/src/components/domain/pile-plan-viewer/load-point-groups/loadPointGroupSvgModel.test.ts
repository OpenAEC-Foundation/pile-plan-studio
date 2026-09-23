import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { LoadPointGroupGeometry } from "../../../../viewer/loadPointGroupGeometry.ts";
import { buildLoadPointGroupSvgModel } from "./loadPointGroupSvgModel.ts";

const geometry: LoadPointGroupGeometry[] = [{
  key: "group:1-2",
  loadPointIds: [1, 2],
  state: "selected",
  hasConflict: false,
  diameterPx: 16.5,
  faces: [],
  segments: [{
    fromLoadPointId: 1,
    toLoadPointId: 2,
    x1: 10,
    y1: 20,
    x2: 30,
    y2: 20,
  }],
  circles: [
    { loadPointId: 1, x: 10, y: 20, radius: 8.25 },
    { loadPointId: 2, x: 30, y: 20, radius: 8.25 },
  ],
}];

describe("load-point group SVG model", () => {
  it("builds a directly filtered primitive without a full-canvas mask", () => {
    const model = buildLoadPointGroupSvgModel(geometry);
    const [group] = model.groups;

    assert.equal(group.key, "group:1-2");
    assert.equal(group.primitiveId, "load-point-group-shape-group-1-2");
    assert.equal(group.filterId, "load-point-group-outline-selected");
    assert.equal("maskId" in group, false);
    assert.equal("maskType" in group, false);
    assert.equal(group.edgePath?.strokeWidth, 16.5);
    assert.equal(group.state, "selected");
    assert.match(group.nodePath!, /A 8\.25 8\.25/);
    assert.deepEqual(model.filters, [
      { id: "load-point-group-outline-default", color: "#747b82", ringWidthPx: 1 },
      { id: "load-point-group-outline-selected", color: "#d97706", ringWidthPx: 1 },
      { id: "load-point-group-outline-conflict", color: "#c62828", ringWidthPx: 1 },
    ]);
  });

  it("reuses a status filter while retaining unique primitive identifiers", () => {
    const model = buildLoadPointGroupSvgModel([
      geometry[0],
      { ...geometry[0], key: "group:3-4", loadPointIds: [3, 4] },
    ]);

    assert.notEqual(model.groups[0].primitiveId, model.groups[1].primitiveId);
    assert.equal(model.groups[0].filterId, model.groups[1].filterId);
  });

  it("keeps the conflict warning on a selected conflict group", () => {
    const [group] = buildLoadPointGroupSvgModel([{ ...geometry[0], hasConflict: true }]).groups;

    assert.equal(group.filterId, "load-point-group-outline-selected");
    assert.deepEqual(group.warningPoint, { x: 42.25, y: 7.75 });
  });
});
