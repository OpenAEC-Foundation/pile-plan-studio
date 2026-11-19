import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { LoadPointTopology, TipLevelRegionTopology } from "../core/tipLevelRegionContract.ts";
import { alignSharedBoundaries, expandUndersizedFootprints, fitEnclosedSiteRectangles, flattenNarrowProjections, widenCrowdedSides } from "./alignRegionBoundaries.ts";
import { createSharedAlignmentGuard, prepareSharedRegionPatches } from "./sharedRegionLayout.ts";
import { assignCompactRegionBlocks } from "./compactRegionBlocks.ts";
import { buildRectangularRegionGrid, buildRectangularTipLevelRegions, createRectangularRegionLayout, type RegionGrid } from "./rectangularTipLevelRegions.ts";

type Point = [number, number];
const edge = (from_load_point_id: number, to_load_point_id: number) => ({ from_load_point_id, to_load_point_id });
const group = (level: number, ids: number[], edges: LoadPointTopology["edges"] = []) => ({
  pile_tip_level_mm: level, legend_value_m: level / 1000, load_point_ids: ids, edges, faces: [],
});

function buildTestRegions(grid: RegionGrid, topology: TipLevelRegionTopology, points: Point[]) {
  return buildRectangularTipLevelRegions(grid, topology, {
    sites: points, faces: [],
    connections: topology.groups.flatMap(({ edges }) => edges.map(({ from_load_point_id, to_load_point_id }) =>
      [points[from_load_point_id - 1], points[to_load_point_id - 1]])),
  });
}

function render(points: Point[], outline: LoadPointTopology, groups: TipLevelRegionTopology["groups"], margin = 1000) {
  const sites = new Map(points.map((point, i) => [i + 1, point]));
  const grid = buildRectangularRegionGrid(sites, outline, margin);
  assert.ok(grid);
  const regions = buildTestRegions(grid, { groups }, points);
  assert.ok(regions);
  return { grid, regions };
}

function contains(polygon: Point[], point: Point) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x, y] = polygon[i], [u, v] = polygon[j];
    if ((y > point[1]) !== (v > point[1]) && point[0] < (u - x) * (point[1] - y) / (v - y) + x) inside = !inside;
  }
  return inside;
}

function covered(rings: Point[][], point: Point) {
  return rings.filter(ring => contains(ring, point)).length % 2 === 1;
}

test("aligned bays retain the original location ownership and fill the leftover space", () => {
  const outlineCorners: Point[] = [[0, 0], [34000, 0], [34000, 32000], [0, 32000]];
  const interior: Point[] = [6000, 13200, 21300].flatMap(y => [8500, 15600, 24500].map(x => [x, y] as Point));
  const points = [...outlineCorners, ...interior];
  const outline = {
    load_point_ids: points.map((_, i) => i + 1),
    edges: [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 1)],
    faces: [{ boundary_load_point_ids: [1, 2, 3, 4] }],
  };
  const groups = [group(-5000, [1, 2, 3, 4], outline.edges), ...interior.map((_, i) => group(-6000 - i, [i + 5]))];
  const { regions } = render(points, outline, groups, 1500);
  for (const [index, point] of interior.entries()) assert.ok(covered(regions[index + 1].fillRings, point));
  for (const point of [[1000, 16000], [32600, 14300], [15000, 29000]] as Point[]) {
    assert.equal(regions.filter(region => covered(region.fillRings, point)).length, 1);
  }
});

test("reserves clearance around a location before a different tip-level row can claim it", () => {
  const size = 20;
  const lines = Array.from({ length: size + 1 }, (_, index) => index * 500);
  const axis = { lines, centers: lines.slice(1).map(end => end - 250) };
  const mask = new Uint8Array(size * size).fill(1);
  const neighbors = new Int32Array(mask.length * 4).fill(-1);
  for (let cell = 0; cell < mask.length; cell++) {
    if (cell % size > 0) neighbors[cell * 4] = cell - 1;
    if (cell % size < size - 1) neighbors[cell * 4 + 1] = cell + 1;
    if (cell >= size) neighbors[cell * 4 + 2] = cell - size;
    if (cell < mask.length - size) neighbors[cell * 4 + 3] = cell + size;
  }
  const points: Point[] = [[4750, 4750], [2750, 4750], [6750, 2750], [6750, 6750]];
  const sites: RegionGrid["sites"] = new Map(points.map(([x, y], index) => [
    index + 1, { point: [x, y], cell: Math.floor(y / 500) * size + Math.floor(x / 500), inDenseRow: index >= 2 },
  ]));
  const edges = [edge(1, 2), edge(3, 4)];
  const grid: RegionGrid = {
    angle: 0, origin: [0, 0], x: axis, y: axis, mask, neighbors, sites,
    outlineMargin: 1500, loadPointEdges: edges,
    rows: [{ axis: 1, sites: [sites.get(3)!, sites.get(4)!], lower: 5000, upper: 7000 }],
  };
  const regions = buildTestRegions(grid, {
    groups: [group(-5000, [1, 2], [edges[0]]), group(-6000, [3, 4], [edges[1]])],
  }, points);
  assert.ok(regions);
  assert.ok(covered(regions[0].fillRings, [5400, 4750]));
  assert.ok(covered(regions[1].fillRings, [6750, 4750]));
});

test("leaves clearance around neighboring paired sites when reserving regular bays", () => {
  const size = 32;
  const lines = Array.from({ length: size + 1 }, (_, index) => index * 500);
  const axis = { lines, centers: lines.slice(1).map(end => end - 250) };
  const mask = new Uint8Array(size * size).fill(1);
  const neighbors = new Int32Array(mask.length * 4).fill(-1);
  for (let cell = 0; cell < mask.length; cell++) {
    if (cell % size > 0) neighbors[cell * 4] = cell - 1;
    if (cell % size < size - 1) neighbors[cell * 4 + 1] = cell + 1;
    if (cell >= size) neighbors[cell * 4 + 2] = cell - size;
    if (cell < mask.length - size) neighbors[cell * 4 + 3] = cell + size;
  }
  const regular: Point[] = [2250, 8250, 13250].flatMap(y => [2250, 8750, 13750].map(x => [x, y] as Point));
  const paired: Point[] = [[5800, 8050], [6150, 8550]];
  const sites: RegionGrid["sites"] = new Map([...regular, ...paired].map(([x, y], index) => [
    index + 1, { point: [x, y], cell: Math.floor(y / 500) * size + Math.floor(x / 500), inDenseRow: false },
  ]));
  const pair = edge(10, 11);
  const grid: RegionGrid = {
    angle: 0, origin: [0, 0], x: axis, y: axis, mask, neighbors, sites,
    outlineMargin: 1500, loadPointEdges: [pair], rows: [],
  };
  const regions = buildTestRegions(grid, {
    groups: [group(-5000, [...sites.keys()].slice(0, 9)), group(-6000, [10, 11], [pair])],
  }, [...regular, ...paired]);
  assert.ok(regions);
  assert.ok(covered(regions[1].fillRings, [5200, 8050]));
  assert.ok(covered(regions[1].fillRings, paired[1]));
});

test("moves the whole side of a crowded region when nearby connections leave room", () => {
  const size = 10;
  const lines = Array.from({ length: size + 1 }, (_, i) => 250 * i);
  const axis = { lines, centers: lines.slice(1).map(end => end - 125) };
  const labels = Int32Array.from({ length: size * size }, (_, cell) => {
    const row = Math.floor(cell / size);
    return row === 0 || row === size - 1 ? 2 : cell % size < 4 ? 0 : 1;
  });
  const grid: RegionGrid = {
    x: axis, y: axis, angle: 0, origin: [0, 0], outlineMargin: 1500,
    mask: new Uint8Array(labels.length).fill(1), neighbors: new Int32Array(), rows: [], loadPointEdges: [],
    sites: new Map([
      [1, { point: [850, 1100], cell: 43, inDenseRow: false }],
      [2, { point: [1900, 1100], cell: 47, inDenseRow: false }],
    ]),
  };
  const protectedLayout = labels.slice();
  widenCrowdedSides(grid, protectedLayout, [0, 1, 2], () => false);
  assert.deepEqual(protectedLayout, labels);

  widenCrowdedSides(grid, labels, [0, 1, 2], (_box, donor, owner) => donor === 1 && owner === 0);
  for (let row = 1; row < size - 1; row++) {
    assert.equal(labels[row * size + 5], 0);
    assert.equal(labels[row * size + 6], 1);
  }
  assert.equal(labels[47], 1);
});

test("joins a shared divider without changing the allocation outside its area", () => {
  const width = 24, height = 24;
  const axis = {
    lines: Array.from({ length: width + 1 }, (_, i) => 1000 * i),
    centers: Array.from({ length: width }, (_, i) => 1000 * i + 500),
  };
  const sites: RegionGrid["sites"] = new Map();
  const components = new Map<number, number>();
  const edges: LoadPointTopology["edges"] = [];
  for (let i = 0; i < 7; i++) {
    const x = 3250 + i * 3000;
    for (const label of [0, 1]) {
      const id = i * 2 + label;
      const y = 4500 + x / 2 + (label === 0 ? -1800 : 1800);
      const cell = Math.floor(y / 1000) * width + Math.floor(x / 1000);
      sites.set(id, { point: [x, y], cell, inDenseRow: false });
      components.set(id, label);
      if (i > 0) edges.push(edge(id - 2, id));
    }
    edges.push(edge(i * 2, i * 2 + 1));
  }
  const mask = new Uint8Array(width * height).fill(1);
  const grid: RegionGrid = {
    x: axis, y: axis, angle: 0, origin: [0, 0], outlineMargin: 1500, mask,
    neighbors: new Int32Array(), rows: [], sites, loadPointEdges: edges,
  };
  const labels = Int32Array.from(mask, (_, i) => axis.centers[Math.floor(i / width)] < 4500 + axis.centers[i % width] / 2 ? 0 : 1);
  const join = prepareSharedRegionPatches(grid, [0, 1], components);
  const original = labels.slice();
  const patches = join(labels);
  assert.ok(patches.length > 0, "the stepped boundary can be simplified");
  for (const { seams, divider } of patches) {
    assert.deepEqual(seams, [], "the divider meets the existing boundary directly");
    assert.notEqual(divider.line[0][1], divider.line.at(-1)![1]);
  }
  assert.deepEqual(labels, original);
});

test("splits a rest block only when extending an existing boundary beats every whole assignment", () => {
  const width = 8, height = 6;
  const axis = (length: number) => ({
    lines: Array.from({ length: length + 1 }, (_, i) => i * 1000),
    centers: Array.from({ length }, (_, i) => i * 1000 + 500),
  });
  const grid: RegionGrid = {
    x: axis(width), y: axis(height), angle: 0, origin: [0, 0], outlineMargin: 1500,
    mask: new Uint8Array(width * height).fill(1), neighbors: new Int32Array(), rows: [], sites: new Map(), loadPointEdges: [],
  };
  function fill(split: number) {
    const labels = new Int32Array(width * height).fill(-1);
    const protectedTiles = new Uint8Array(labels.length);
    grid.sites.set(1, { point: [500, 500], cell: 0, inDenseRow: false });
    grid.sites.set(2, { point: [7500, 500], cell: 7, inDenseRow: false });
    for (let i = 0; i < width; i++) {
      labels[i] = i < split ? 0 : 1;
      protectedTiles[i] = 1;
    }
    assignCompactRegionBlocks(grid, labels, protectedTiles, [-1, -1], candidate => {
      assert.ok(candidate.every(label => label >= 0));
    });
    return Array.from(labels.slice(-width));
  }
  assert.deepEqual(fill(4), [0, 0, 0, 0, 1, 1, 1, 1]);
  assert.deepEqual(fill(7), [0, 0, 0, 0, 0, 0, 0, 0]);
});

test("straightens a narrow projection while keeping protected tiles and bridges", () => {
  const width = 9, height = 6;
  const axis = (length: number) => ({
    lines: Array.from({ length: length + 1 }, (_, i) => i * 1000),
    centers: Array.from({ length }, (_, i) => i * 1000 + 500),
  });
  const grid: RegionGrid = {
    x: axis(width), y: axis(height), angle: 0, origin: [0, 0], outlineMargin: 1500,
    mask: new Uint8Array(width * height).fill(1), neighbors: new Int32Array(), rows: [], sites: new Map(), loadPointEdges: [],
  };
  const source = Int32Array.from(grid.mask, (_, i) => i % width >= 6 ? 2 : 0);
  const start = 2 * width + 2;
  source.fill(2, start, start + 4);
  const protectedTiles = new Uint8Array(source.length);
  const projection = source.slice();
  flattenNarrowProjections(grid, projection, protectedTiles);
  assert.deepEqual(Array.from(projection.slice(start, start + 4)), [0, 0, 0, 0]);

  const protectedProjection = source.slice();
  protectedTiles[start] = 1;
  flattenNarrowProjections(grid, protectedProjection, protectedTiles);
  assert.deepEqual(protectedProjection, source);

  const bridge = source.slice();
  for (let row = 0; row < height; row++) bridge.fill(2, row * width, row * width + 2);
  flattenNarrowProjections(grid, bridge, new Uint8Array(source.length));
  assert.deepEqual(Array.from(bridge.slice(start, start + 4)), [2, 2, 2, 2]);
});

test("shortens narrow empty ends that touch changing neighbors or contain a site farther along", () => {
  const rows = [
    "0000001111111111",
    "0022222222222211",
    "0033333333333311",
    "0000000000111111",
    "0000000000111111",
  ];
  const xLines = Array.from({ length: 17 }, (_, i) => 1000 * i);
  const yLines = [0, 2000, 2500, 3500, 5500, 7500];
  const axis = (lines: number[]) => ({
    lines, centers: lines.slice(1).map((end, i) => (lines[i] + end) / 2),
  });
  const labels = Int32Array.from(rows.join(""), Number);
  const mask = new Uint8Array(labels.length).fill(1);
  const grid: RegionGrid = {
    x: axis(xLines), y: axis(yLines), angle: 0, origin: [0, 0], outlineMargin: 1500,
    mask, neighbors: new Int32Array(), rows: [], sites: new Map(), loadPointEdges: [],
  };
  const protectedTiles = new Uint8Array(labels.length);
  protectedTiles[16 + 12] = protectedTiles[32 + 12] = 1;
  const guarded = new Set<number>();
  flattenNarrowProjections(grid, labels, protectedTiles, {
    groups: [0, 1, 2, 3],
    canMove: (_box, donor) => {
      guarded.add(donor);
      return donor !== 3;
    },
  });
  assert.deepEqual([...labels.slice(18, 26)], [0, 0, 0, 0, 1, 1, 1, 1]);
  assert.equal(labels[16 + 12], 2);
  assert.deepEqual([...labels.slice(32, 48)], Array.from(rows[2], Number));
  assert.ok(guarded.has(2));
  assert.ok(guarded.has(3));
});

test("rotates the entire rectangular layout with the detected project axes", () => {
  const angle = Math.PI / 6;
  const rotate = ([x, y]: Point): Point => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
  const points: Point[] = [[150, 250], [4150, 250], [4150, 3250], [150, 3250]];
  const edges = [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 1)];
  const { grid, regions } = render(points.map(rotate), {
    load_point_ids: [1, 2, 3, 4], edges, faces: [{ boundary_load_point_ids: [1, 2, 3, 4] }],
  }, [group(-5000, [1, 4], [edge(4, 1)]), group(-6000, [2, 3], [edge(2, 3)])]);
  assert.ok(Math.abs(grid.angle - angle) < 1e-6);
  for (const region of regions) {
    assert.ok(region.fillRings.length > 0);
    for (const [a, b] of region.contours) {
      const heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
      assert.ok(Math.abs(Math.sin(2 * (heading - angle))) < 1e-6);
    }
  }
  for (const [index, point] of points.map(rotate).entries()) {
    assert.equal(regions.findIndex(r => covered(r.fillRings, point)), index === 0 || index === 3 ? 0 : 1);
  }
});

test("renders a connected filled area and its enclosed hole without internal tile edges", () => {
  const points: Point[] = [[0, 0], [11000, 0], [11000, 11000], [0, 11000], [4500, 5830]];
  const perimeter = [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 1)];
  const { regions } = render(points, {
    load_point_ids: [1, 2, 3, 4, 5], edges: [...perimeter, edge(2, 5)],
    faces: [{ boundary_load_point_ids: [1, 2, 3, 4] }],
  }, [group(-5000, [1, 2, 3, 4], perimeter), group(-6000, [5])]);
  const surrounding = regions[0].fillRings;
  assert.equal(surrounding.length, 2, "Only the outside and the hole should be drawn");
  assert.equal(surrounding.filter(ring => contains(ring, points[4])).length, 2);
  assert.equal(surrounding.filter(ring => contains(ring, points[0])).length, 1);
});

test("retains separate same-level components and reserves nearby unassigned locations", () => {
  const points: Point[] = [[100, 120], [131, 120], [180, 120], [3000, 120]];
  const outline = { load_point_ids: [1, 2, 3, 4], edges: [edge(1, 2), edge(2, 3), edge(3, 4)], faces: [] };
  const { regions } = render(points, outline, [group(-5000, [1, 2, 4], [edge(1, 2)])]);
  assert.ok(covered(regions[0].fillRings, points[0]));
  assert.ok(covered(regions[0].fillRings, points[3]));
  assert.ok(!covered(regions[0].fillRings, points[2]));
});

test("gives neighboring unassigned locations one transparent area with clearance", () => {
  const points: Point[] = [
    [0, 0], [16000, 0], [16000, 15000], [0, 15000],
    [1000, 5000], [1000, 10000], [15000, 5000], [15000, 10000],
    [8500, 4000], [8500, 11500],
  ];
  const outline = {
    load_point_ids: points.map((_, i) => i + 1),
    edges: [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 1), edge(9, 10)],
    faces: [{ boundary_load_point_ids: [1, 2, 3, 4] }],
  };
  const groups = [
    group(-5000, [1, 4, 5, 6], [edge(1, 5), edge(5, 6), edge(6, 4)]),
    group(-6000, [2, 3, 7, 8], [edge(2, 7), edge(7, 8), edge(8, 3)]),
  ];
  for (const aligned of [false, true]) {
    const { regions } = render(points, outline, groups, 1500, aligned);
    assert.equal(regions.length, 2);
    for (const y of [4000, 7500, 11500]) {
      for (const x of [7500, 8500, 9500]) {
        assert.ok(!regions.some(region => covered(region.fillRings, [x, y])), `Expected transparent space at ${x},${y}`);
      }
    }
    assert.ok(covered(regions[0].fillRings, points[4]));
    assert.ok(covered(regions[1].fillRings, points[6]));
  }
});

test("reserves a centered transparent area within a tight gap when it can fit", () => {
  const points: Point[] = [
    [0, 0], [12000, 0], [12000, 12000], [0, 12000],
    [6000, 6000], [5500, 4900], [8750, 5450], [2750, 5450], [5500, 9750],
  ];
  const neighbors = [edge(6, 7), edge(6, 8), edge(8, 9)];
  const outline = {
    load_point_ids: points.map((_, i) => i + 1),
    edges: [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 1), ...neighbors, edge(5, 6), edge(5, 7), edge(5, 8)],
    faces: [{ boundary_load_point_ids: [1, 2, 3, 4] }],
  };
  const layout = createRectangularRegionLayout(new Map(points.map((point, i) => [i + 1, point])), outline, 1500);
  const surrounding = group(-5000, [1, 2, 3, 4, 6, 7, 8, 9], [...outline.edges.slice(0, 4), ...neighbors]);
  const topology = { groups: [surrounding] };
  const drawn = layout(topology);
  assert.ok(drawn);
  for (const x of [5500, 6000, 6500]) for (const y of [5500, 6000, 6500]) {
    assert.ok(!covered(drawn[0].fillRings, [x, y]));
  }
  assert.ok(covered(drawn[0].fillRings, points[5]));
  const assigned = layout({ groups: [surrounding, group(-6000, [5])] });
  assert.ok(assigned && covered(assigned[1].fillRings, points[4]));
});

test("aligns one continuing side across two different neighbors", () => {
  const size = 8;
  const axis = {
    lines: Array.from({ length: size + 1 }, (_, i) => 1000 * i),
    centers: Array.from({ length: size }, (_, i) => 1000 * i + 500),
  };
  const mask = new Uint8Array(size * size).fill(1);
  const grid: RegionGrid = {
    x: axis, y: axis, angle: 0, origin: [0, 0], outlineMargin: 1500, mask,
    neighbors: new Int32Array(), rows: [], sites: new Map(), loadPointEdges: [],
  };
  const labels = Int32Array.from(mask, (_, i) => {
    const row = Math.floor(i / size), column = i % size;
    const cut = row >= 2 && row < 6 ? 5 : 3;
    return column < cut ? 0 : row < 4 ? 1 : 2;
  });
  alignSharedBoundaries(grid, labels, new Uint8Array(labels.length), undefined, [0, 1, 2]);
  for (let row = 0; row < size; row++) {
    assert.deepEqual([...labels.slice(row * size, row * size + 5)], [0, 0, 0, row < 4 ? 1 : 2, row < 4 ? 1 : 2]);
  }
});

test("joins both ends of a narrow offset even when the tip levels change on both sides", () => {
  const rows = [
    "0000111", "0000111",
    "2223111", "2223333", "2223333", "4443333",
    "5555666", "5555666",
  ];
  const axis = (size: number) => ({
    lines: Array.from({ length: size + 1 }, (_, i) => 400 * i),
    centers: Array.from({ length: size }, (_, i) => 400 * i + 200),
  });
  const labels = Int32Array.from(rows.join(""), Number);
  const grid: RegionGrid = {
    x: axis(7), y: axis(8), angle: 0, origin: [0, 0], outlineMargin: 1500,
    mask: new Uint8Array(labels.length).fill(1),
    neighbors: new Int32Array(), rows: [], sites: new Map(), loadPointEdges: [],
  };
  const protectedTiles = new Uint8Array(labels.length);
  const levels = [0, 1, 2, 3, 4, 5, 6];
  const fixed = labels.slice();
  protectedTiles[3 * 7 + 3] = 1;

  alignSharedBoundaries(grid, fixed, protectedTiles, undefined, levels);
  assert.equal(fixed[3 * 7 + 3], 3);

  protectedTiles.fill(0);
  alignSharedBoundaries(grid, labels, protectedTiles, undefined, levels);
  assert.deepEqual([...labels].filter((_, index) => index % 7 === 3), [0, 0, 2, 2, 2, 4, 5, 5]);
  assert.deepEqual([...labels].filter((_, index) => index % 7 === 4), [1, 1, 1, 3, 3, 3, 6, 6]);
});

test("removes an empty step that returns to the same cut and leaves clearance", () => {
  const rows = ["0000111", "0000111", "0001111", "0001111", "0001111", "0001111", "0000111", "0000111"];
  const axis = (size: number) => ({
    lines: Array.from({ length: size + 1 }, (_, i) => 400 * i),
    centers: Array.from({ length: size }, (_, i) => 400 * i + 200),
  });
  const levels = [0, 1];
  for (const [siteX, remainingOwner] of [[2325, 0], [2250, 1]]) {
    const labels = Int32Array.from(rows.join(""), Number);
    const siteCell = 3 * 7 + 5;
    const grid: RegionGrid = {
      x: axis(7), y: axis(8), angle: 0, origin: [0, 0], outlineMargin: 1500,
      mask: new Uint8Array(labels.length).fill(1), neighbors: new Int32Array(), rows: [],
      sites: new Map([[7, { point: [siteX, 1400], cell: siteCell, inDenseRow: false }]]),
      loadPointEdges: [],
    };
    const protectedTiles = new Uint8Array(labels.length);
    protectedTiles[siteCell] = 1;
    const guard = createSharedAlignmentGuard(grid, labels, new Map([[7, 1]]), levels);
    alignSharedBoundaries(grid, labels, protectedTiles, guard(), levels);
    assert.equal(labels[3 * 7 + 3], remainingOwner);
    assert.equal(labels[siteCell], 1);
  }
});

test("fits a rectangle around one enclosed site by moving both parts of a stepped side", () => {
  const makeAxis = (lines: number[]) => ({ lines, centers: lines.slice(1).map((end, i) => (lines[i] + end) / 2) });
  const x = makeAxis([11000, 11600, 12500, 13000, 13400, 14000, 14500, 15100, 15700]);
  const y = makeAxis([52900, 53650, 54125, 55100, 55825, 56375]);
  const width = x.centers.length;
  const tile = (column: number, row: number) => row * width + column;
  const site = { point: [13500, 54850] as Point, cell: tile(4, 2), inDenseRow: false };
  const redSite = { point: [11500, 56100] as Point, cell: tile(0, 4), inDenseRow: false };
  const mask = new Uint8Array(width * y.centers.length).fill(1);
  const grid: RegionGrid = {
    x, y, mask, angle: 0, origin: [0, 0], outlineMargin: 1500, neighbors: new Int32Array(),
    sites: new Map([[1, site], [2, redSite]]), loadPointEdges: [], rows: [],
  };
  const labels = new Int32Array(mask.length).fill(0);
  labels.fill(2, tile(0, 3));
  labels.fill(1, tile(1, 2), tile(6, 2));
  labels.fill(1, tile(3, 3), tile(6, 3));
  const fixed = new Uint8Array(labels.length);
  fixed[site.cell] = fixed[redSite.cell] = 1;
  const guard = createSharedAlignmentGuard(grid, labels, new Map([[1, 1], [2, 2]]), [0, 1, 0]);

  fitEnclosedSiteRectangles(grid, labels, fixed, [0, 1, 0], guard({ shift: 3000, span: 3000 }));

  assert.deepEqual([...labels.slice(tile(0, 2), tile(0, 3))], [0, 0, 1, 1, 1, 1, 0, 0]);
  assert.deepEqual([...labels.slice(tile(0, 3), tile(0, 4))], [2, 2, 1, 1, 1, 1, 2, 2]);
  assert.equal(labels[redSite.cell], 2);
});

test("enlarges a small isolated footprint in proportion to the free space around it", () => {
  const axis = {
    lines: Array.from({ length: 10 }, (_, i) => 500 * i),
    centers: Array.from({ length: 9 }, (_, i) => 500 * i + 250),
  };
  const mask = new Uint8Array(81).fill(1);
  const sites: RegionGrid["sites"] = new Map([
    [1, { point: [2250, 2250], cell: 40, inDenseRow: false }],
    [2, { point: [250, 2250], cell: 36, inDenseRow: false }],
    [3, { point: [4250, 2250], cell: 44, inDenseRow: false }],
  ]);
  const grid: RegionGrid = {
    x: axis, y: axis, angle: 0, origin: [0, 0], outlineMargin: 1500,
    mask, neighbors: new Int32Array(), rows: [], sites, loadPointEdges: [],
  };
  const labels = new Int32Array(mask.length);
  const protectedTiles = new Uint8Array(mask.length);
  labels[40] = 1;
  protectedTiles[36] = protectedTiles[40] = protectedTiles[44] = 1;
  expandUndersizedFootprints(grid, labels, protectedTiles, [0, 1], () => true);
  for (const cell of [30, 31, 32, 39, 40, 41, 48, 49, 50]) {
    assert.equal(labels[cell], 1);
    assert.equal(protectedTiles[cell], 1);
  }
  assert.equal(labels[36], 0);
  assert.equal(labels[44], 0);
});

test("fills touching areas of the same level without an internal outline", () => {
  const points: Point[] = [[100, 100], [4500, 100], [6000, 100]];
  const outline = { load_point_ids: [1, 2, 3], edges: [edge(1, 2), edge(2, 3)], faces: [] };
  const { regions } = render(points, outline, [group(-5000, [1, 2, 3], [edge(2, 3)])]);
  assert.ok(points.every(point => covered(regions[0].fillRings, point)));
  assert.ok(covered(regions[0].fillRings, [3000, 100]));
  assert.ok(!regions[0].contours.some(([a, b]) => (a[1] < 100) !== (b[1] < 100) && a[0] > 100 && a[0] < 6000));
});

test("keeps the colors of a dense row close to it when there are farther apart sites across the open area", () => {
  const points: Point[] = [
    [150, 150], [1150, 150], [2150, 150], [3150, 150], [4150, 150], [5150, 150],
    [150, 8150], [5150, 8150],
  ];
  const edges = [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 5), edge(5, 6), edge(6, 8), edge(8, 7), edge(7, 1)];
  const outline = { load_point_ids: points.map((_, i) => i + 1), edges,
    faces: [{ boundary_load_point_ids: [1, 2, 3, 4, 5, 6, 8, 7] }] };
  const groups = points.slice(0, 6).map((_, i) => group(-5000 - i, [i + 1]));
  groups.push(group(-8000, [7, 8], [edge(7, 8)]));
  const { grid, regions } = render(points, outline, groups);
  assert.ok(grid.x.lines.every(cut => Math.abs(cut - 1000) >= 10), "Raster rounding must leave the site inside its assigned tile");
  for (const x of [800, 2200, 4000]) {
    assert.ok(covered(regions[6].fillRings, [x, 2800]), "The open area should have a broad, uninterrupted fill");
  }
  points.forEach((point, i) => assert.ok(covered(regions[Math.min(i, 6)].fillRings, point)));
});

test("gives a staggered dense row one straight edge through its different colors", () => {
  const points: Point[] = [
    [150, 350], [1150, -250], [2150, 350], [3150, -250], [4150, 350], [5150, -250],
    [150, 8150], [5150, 8150], [150, -7150], [5150, -7150],
  ];
  const edges = [
    edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 5), edge(5, 6),
    edge(6, 8), edge(8, 7), edge(7, 1), edge(1, 9), edge(9, 10), edge(10, 6),
  ];
  const outline = { load_point_ids: points.map((_, i) => i + 1), edges,
    faces: [{ boundary_load_point_ids: [1, 6, 8, 7] }, { boundary_load_point_ids: [6, 1, 9, 10] }] };
  const groups = points.slice(0, 6).map((_, i) => group(-5000 - i, [i + 1]));
  groups.push(group(-8000, [7, 8], [edge(7, 8)]), group(-9000, [9, 10], [edge(9, 10)]));
  const { regions } = render(points, outline, groups);
  const upperEdge = 1350;
  for (const x of [410, 940, 1730, 2330, 2930, 3710, 4530, 5000]) {
    assert.ok(regions.slice(0, 6).some(region => covered(region.fillRings, [x, upperEdge - 5])));
    assert.ok(covered(regions[6].fillRings, [x, upperEdge + 5]));
  }
});

test("uses an aligned Gabriel outline row even when its sites are too far apart for dense-row detection", () => {
  const points: Point[] = [
    [150, 6150], [4750, 6150], [9350, 6150], [13950, 6150], [18550, 6150], [23150, 6150],
    [150, -7150], [23150, -7150],
  ];
  const edges = [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 5), edge(5, 6), edge(6, 8), edge(8, 7), edge(7, 1)];
  const outline = { load_point_ids: points.map((_, i) => i + 1), edges,
    faces: [{ boundary_load_point_ids: [1, 2, 3, 4, 5, 6, 8, 7] }] };
  const groups = points.slice(0, 6).map((_, i) => group(-5000 - i, [i + 1]));
  groups.push(group(-8000, [7, 8], [edge(7, 8)]));
  const { regions } = render(points, outline, groups, 1500);
  for (const x of [500, 2500, 3620, 5400, 9750, 16550, 21100]) {
    assert.ok(regions.slice(0, 6).some(region => covered(region.fillRings, [x, 4160])));
    assert.ok(covered(regions[6].fillRings, [x, 3500]), "The open area beyond the row should keep its group color");
  }
  for (const [index, [x, y]] of points.slice(1, 5).entries()) {
    assert.ok(covered(regions[index + 1].fillRings, [x, y + 1400]),
      "The outer fringe should use the color of the row directly beneath it");
  }
  for (let x = 600; x < 22500; x += 187) {
    assert.ok(!covered(regions[6].fillRings, [x, 7540]),
      `The interior color must not wrap around the row at x=${x}`);
  }
});

test("widens a perimeter row halfway to neighboring sites less than four metres away", () => {
  const points: Point[] = [
    [150, 6150], [4750, 6150], [9350, 6150], [13950, 6150], [18550, 6150], [23150, 6150],
    [150, 3150], [23150, 3150],
  ];
  const edges = [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 5), edge(5, 6), edge(6, 8), edge(8, 7), edge(7, 1)];
  const outline = { load_point_ids: points.map((_, i) => i + 1), edges,
    faces: [{ boundary_load_point_ids: [1, 2, 3, 4, 5, 6, 8, 7] }] };
  const groups = points.slice(0, 6).map((_, i) => group(-5000 - i, [i + 1]));
  groups.push(group(-8000, [7, 8], [edge(7, 8)]));
  const { grid, regions } = render(points, outline, groups, 1500);
  const outerRow = grid.rows.find(row => row.axis === 0 && row.outside === 1);
  assert.equal(outerRow?.lower, -1500);
  assert.ok(covered(regions[6].fillRings, points[6]));
});

test("shares the inward perimeter cut across colors, including a more widely spaced end site", () => {
  const points: Point[] = [
    [150, 6150], [6250, 6150], [10850, 6150], [15450, 6150], [20050, 6150], [24650, 6150],
    [150, -7150], [24650, -7150],
  ];
  const edges = [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 5), edge(5, 6), edge(6, 8), edge(8, 7), edge(7, 1)];
  const { grid, regions } = render(points, {
    load_point_ids: points.map((_, i) => i + 1), edges,
    faces: [{ boundary_load_point_ids: [1, 2, 3, 4, 5, 6, 8, 7] }],
  }, [...points.slice(0, 6).map((_, i) => group(-5000 - i, [i + 1])), group(-8000, [7, 8], [edge(7, 8)])], 1500);

  const row = grid.rows.find(row => row.axis === 0 && row.outside === 1);
  assert.equal(row?.sites.length, 6);
  assert.equal(row?.lower, -2000);
  for (const [index, [x]] of points.slice(0, 6).entries()) {
    assert.ok(covered(regions[index].fillRings, [x, 4200]));
    assert.ok(!covered(regions[index].fillRings, [x, 4100]));
  }
});

test("gives a separate site an even minimum clearance on all four sides", () => {
  const points: Point[] = [[0, 0], [11000, 0], [11000, 11000], [0, 11000], [4670, 5830]];
  const perimeter = [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 1)];
  const outline = { load_point_ids: [1, 2, 3, 4, 5], edges: [...perimeter, edge(2, 5)],
    faces: [{ boundary_load_point_ids: [1, 2, 3, 4] }] };
  const { grid, regions } = render(points, outline, [group(-5000, [1, 2, 3, 4], perimeter), group(-6000, [5])]);
  assert.ok(grid.x.lines.includes(3670) && grid.x.lines.includes(5670), "The grid should permit equal spacing in X");
  assert.ok(grid.y.lines.includes(4830) && grid.y.lines.includes(6830), "The grid should permit equal spacing in Y");
  for (const point of [[3675, 4835], [5665, 4835], [5665, 6825], [3675, 6825]] as Point[]) {
    assert.ok(covered(regions[1].fillRings, point));
  }
});

test("lets a centered clearance edge replace a nearby regular grid line", () => {
  const points: Point[] = [[0, 0], [11000, 0], [11000, 11000], [0, 11000], [4500, 5830]];
  const perimeter = [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 1)];
  const outline = { load_point_ids: [1, 2, 3, 4, 5], edges: [...perimeter, edge(2, 5)],
    faces: [{ boundary_load_point_ids: [1, 2, 3, 4] }] };
  const { grid, regions } = render(points, outline, [group(-5000, [1, 2, 3, 4], perimeter), group(-6000, [5])], 1500);
  assert.ok(grid.x.lines.includes(5500));
  assert.ok(!grid.x.lines.includes(5375), "Avoid a 125 mm strip beside the reserved edge");
  assert.ok(covered(regions[1].fillRings, points[4]));
});
