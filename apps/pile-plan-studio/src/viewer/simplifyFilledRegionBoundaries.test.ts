import { strict as assert } from "node:assert";
import { test } from "node:test";
import { straightenSharedFilledBorders } from "./simplifyFilledRegionBoundaries.ts";

type Point = [number, number];

const boundary: Point[] = [[2000, 0], [2300, 1000], [1850, 2000], [2000, 3000]];
const left = [[0, 0], ...boundary, [0, 3000]] as Point[];
const right = [...boundary.toReversed(), [4000, 0], [4000, 3000]] as Point[];

test("replaces both sides of a shared border and respects protected Gabriel connections", () => {
  const contours = boundary.slice(1).map((point, index): [Point, Point] => [boundary[index], point]);
  const shapes = [left, right].map(area => ({
    fillRings: [area], contours,
  }));
  const shared = contours.map(line => ({ line, groups: [0, 1], fixed: false }));
  const options = { sites: [[1000, 1500], [3200, 1500]] as Point[], faces: [], connections: [] };
  const straight = straightenSharedFilledBorders(shapes, shared, options);
  assert.deepEqual(straight.map(area => area.contours), [
    [[boundary[0], boundary[3]]], [[boundary[0], boundary[3]]],
  ]);
  assert.deepEqual(straight[0].fillRings.at(-1), boundary);
  assert.deepEqual(straight[1].fillRings.at(-1), boundary);
  const connection: [Point, Point] = [[1850, 1000], [2250, 1000]];
  const bent = straightenSharedFilledBorders(shapes, shared, { ...options, connections: [connection] });
  assert.deepEqual(bent[0].contours, [[boundary[0], boundary[1]], [boundary[1], boundary[3]]]);
  const otherConnection: [Point, Point] = [[2150, 1500], [2290, 1500]];
  assert.deepEqual(straightenSharedFilledBorders(shapes, shared, {
    ...options, connections: [connection, otherConnection],
  }), shapes);
});

test("keeps both parallel sides of a short step and replaces only its abrupt transition", () => {
  const points: Point[] = [[2000, 0], [2000, 5000], [2600, 5000], [2600, 10000]];
  const contours = points.slice(1).map((point, index): [Point, Point] => [points[index], point]);
  const shapes = [
    { fillRings: [[[0, 0] as Point, ...points, [0, 10000] as Point]], contours },
    { fillRings: [[...points.slice().reverse(), [6000, 0] as Point, [6000, 10000] as Point]], contours },
  ];
  const shared = contours.map(line => ({ line, groups: [0, 1], fixed: false }));
  const result = straightenSharedFilledBorders(shapes, shared, { sites: [], faces: [], connections: [] });
  const [first, transition, last] = result[0].contours;
  assert.equal(result[0].contours.length, 3);
  assert.deepEqual(result[1].contours, result[0].contours);
  assert.equal(first[0][0], first[1][0]);
  assert.equal(last[0][0], last[1][0]);
  assert.notEqual(transition[0][1], transition[1][1]);
});

test("straightens a tiny offset between compact regions when the swept area is empty", () => {
  const points: Point[] = [[2000, 0], [2000, 3000], [2200, 3000], [2200, 6000]];
  const contours = points.slice(1).map((point, index): [Point, Point] => [points[index], point]);
  const shapes = [0, 1].map(() => ({ fillRings: [], contours }));
  const shared = contours.map(line => ({ line, groups: [0, 1], fixed: false, shortOffsetsOnly: true }));
  const result = straightenSharedFilledBorders(shapes, shared, { sites: [], faces: [], connections: [] });
  assert.deepEqual(result[0].contours, [[points[0], points[3]]]);
  assert.deepEqual(result[0].contours, result[1].contours);

  const kept = straightenSharedFilledBorders(shapes, shared, { sites: [[2060, 2200]], faces: [], connections: [] });
  assert.deepEqual(kept, shapes);
});

test("straightens a small step in the display margin and keeps the joins across the face outline", () => {
  const points: Point[] = [[2000, 0], [2000, 3000], [2200, 3000], [2200, 6000]];
  const contours = points.slice(1).map((point, index): [Point, Point] => [points[index], point]);
  const shapes = [0, 1].map(() => ({ fillRings: [], contours }));
  const shared = contours.map(line => ({ line, groups: [0, 1], fixed: false, shortOffsetsOnly: true }));
  const outside: Point[][] = [[[0, -1000], [1000, -1000], [1000, 7000], [0, 7000]]];
  const crossed: Point[][] = [[[0, -1000], [4000, -1000], [4000, 4200], [0, 4200]]];

  const simplified = straightenSharedFilledBorders(shapes, shared, { sites: [], faces: outside, connections: [] });
  assert.deepEqual(simplified[0].contours, [[points[0], points[3]]]);
  assert.deepEqual(simplified[0].contours, simplified[1].contours);
  const kept = straightenSharedFilledBorders(shapes, shared, { sites: [], faces: crossed, connections: [] });
  assert.deepEqual(kept, shapes);
});

test("a shared shortcut cannot introduce a backward turn at its next unchanged segment", () => {
  const points: Point[] = [[-1300, -700], [0, -700], [0, 0], [2600, 0], [2600, -700], [3150, -700], [3150, 1900], [7050, 1900]];
  const contours = points.slice(1).map((point, index): [Point, Point] => [points[index], point]);
  const shapes = [0, 1].map(() => ({ fillRings: [], contours }));
  const shared = contours.map(line => ({ line, groups: [0, 1], fixed: false }));
  const sites: Point[] = [[1940, -900], [2140, 1200], [2400, -1990]];
  const [first] = straightenSharedFilledBorders(shapes, shared, { sites, faces: [], connections: [] });
  const vec = (a: Point, b: Point) => [b[0] - a[0], b[1] - a[1]];
  for (const [start, end] of first.contours) {
    const next = first.contours.find(([point]) => point[0] === end[0] && point[1] === end[1]);
    if (!next) continue;
    const [x, y] = vec(start, end);
    const [u, v] = vec(next[0], next[1]);
    assert.ok(x * u + y * v >= -.17 * Math.hypot(x, y) * Math.hypot(u, v));
  }
});
