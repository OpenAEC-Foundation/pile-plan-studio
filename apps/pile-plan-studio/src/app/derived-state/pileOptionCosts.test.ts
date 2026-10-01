import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProjectState } from "../../domain/project/projectState.ts";
import type { PileConfigurationOption } from "../../core/projectTypes.ts";
import { calculatePileOptionCosts } from "./pileOptionCosts.ts";

const option = (size: number, tip: number) => ({
  configuration: { pile_size_mm: size, pile_tip_level_mm: tip },
  pile_size_mm: size, pile_tip_level_m: tip / 1000,
}) as PileConfigurationOption;
const input = (rows: PileConfigurationOption[][]) => ({
  pileOptionsByLoadPointId: new Map(rows.map((items, index) => [index, items])),
  pileCostSettings: { items: [] }, pileHeadLevelM: null,
}) as Pick<ProjectState, "pileOptionsByLoadPointId" | "pileCostSettings" | "pileHeadLevelM">;

test("cost derivation calculates shared configurations once and retains missing costs", async () => {
  const calls: number[] = [];
  const result = await calculatePileOptionCosts(input([
    [option(290, -18000), option(320, -18001)], [option(290, -18000)],
  ]), async (request) => {
    calls.push(request.pileSizeMm);
    assert.equal(request.pileHeadLevelM, 0);
    return request.pileSizeMm === 290 ? 123 : null;
  });
  assert.deepEqual(calls, [290, 320]);
  assert.deepEqual([...result.values()], [123, null]);
});

test("empty options clear costs without core requests", async () => {
  const result = await calculatePileOptionCosts(input([]), async () => { throw new Error("unexpected request"); });
  assert.equal(result.size, 0);
});

test("cost requests use the changed project pile head level", async () => {
  const state = { ...input([[option(290, -18000)]]), pileHeadLevelM: 2.5 };
  await calculatePileOptionCosts(state, async (request) => {
    assert.equal(request.pileHeadLevelM, 2.5);
    assert.equal(request.pileTipLevelM, -18);
    assert.equal(request.settings, state.pileCostSettings);
    return 456;
  });
});

test("a failed calculation rejects the batch without returning partial costs", async () => {
  await assert.rejects(calculatePileOptionCosts(input([[option(290, -18000)]]),
    async () => { throw new Error("core unavailable"); }), /core unavailable/);
});
