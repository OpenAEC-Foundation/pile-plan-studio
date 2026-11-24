import assert from "node:assert/strict";
import { test } from "node:test";
import { createCadRegionClipper } from "./cadRegionClipping.ts";

test("CAD regions stop at the viewer margin and keep holes inside a fill", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 10_000, y: 0 };
  const clip = createCadRegionClipper({
    points: [from, to], edges: [[from, to]], faces: [], marginPx: 1500,
  });
  const result = clip([
    [[-9000, -9000], [20_000, -9000], [20_000, 9000], [-9000, 9000]],
    [[4000, -250], [4200, -250], [4200, 250], [4000, 250]],
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].length, 2);
  const coordinates = result[0][0];
  assert.equal(Math.min(...coordinates.map(([x]) => x)), -1500);
  assert.equal(Math.max(...coordinates.map(([x]) => x)), 11_500);
  assert.equal(Math.max(...coordinates.map(([, y]) => y)), 1500);
  assert.deepEqual(clip([[[0, 6000], [100, 6000], [100, 6100], [0, 6100]]]), []);
});
