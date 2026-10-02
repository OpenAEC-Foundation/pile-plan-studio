import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { usePileOptionCosts } from "./usePileOptionCosts.ts";
import { useTechnicalAssignment } from "./useTechnicalAssignment.ts";
import type { PileOptionCostInput } from "./pileOptionCosts.ts";
import type { TechnicalAssignmentAssessment, TechnicalAssignmentContractInput } from "../../core/technicalAssignmentContract.ts";

const core = vi.hoisted(() => ({ costs: vi.fn(), assess: vi.fn() }));
vi.mock("./pileOptionCosts.ts", () => ({ calculatePileOptionCosts: core.costs }));
vi.mock("../../core/coreClient.ts", () => ({ assessTechnicalAssignmentCore: core.assess }));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => { core.costs.mockReset(); core.assess.mockReset(); });
const costInput: PileOptionCostInput = { pileCostSettings: { schema_version: 1, items: [] },
  pileHeadLevelM: 0, pileOptionsByLoadPointId: new Map() };
test("cost hook recalculates after a reference-level change and ignores the obsolete result", async () => {
  const old = deferred<Map<string, number | null>>(), next = deferred<Map<string, number | null>>();
  core.costs.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const update = vi.fn();
  const view = renderHook(input => usePileOptionCosts(input, update), { initialProps: costInput });
  view.rerender({ ...costInput, pileHeadLevelM: 2.5 }); expect(core.costs).toHaveBeenCalledTimes(2);
  expect(core.costs.mock.calls[1][0].pileHeadLevelM).toBe(2.5);
  await act(async () => next.resolve(new Map([["next", 100]])));
  await act(async () => old.resolve(new Map([["old", 10]])));
  expect(update).toHaveBeenCalledOnce();
  expect(update.mock.calls[0][0]({}).pileCostByOptionKey).toEqual(new Map([["next", 100]]));
});
test("unmount cancels pending cost updates and calculation failures do not install partial results", async () => {
  const pending = deferred<Map<string, number | null>>(); core.costs.mockReturnValueOnce(pending.promise);
  const update = vi.fn(); const view = renderHook(() => usePileOptionCosts(costInput, update)); view.unmount();
  await act(async () => pending.resolve(new Map())); expect(update).not.toHaveBeenCalled();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  core.costs.mockRejectedValueOnce(new Error("unavailable")); renderHook(() => usePileOptionCosts(costInput, update));
  await waitFor(() => expect(error).toHaveBeenCalledOnce()); expect(update).not.toHaveBeenCalled();
});
test("technical hook hides old assessments as soon as inputs change and returns idle for no input", async () => {
  const first = deferred<TechnicalAssignmentAssessment>(), next = deferred<TechnicalAssignmentAssessment>();
  core.assess.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
  const input: TechnicalAssignmentContractInput = { groups: [], optionsByLoadPoint: new Map() };
  const view = renderHook((current: TechnicalAssignmentContractInput | null) => useTechnicalAssignment(current), { initialProps: input as TechnicalAssignmentContractInput | null });
  expect(view.result.current.status).toBe("loading");
  await act(async () => first.resolve({ availability: "available", issues: [] })); expect(view.result.current.status).toBe("ready");
  view.rerender({ groups: [], optionsByLoadPoint: new Map([[1, []]]) });
  expect(view.result.current.status).toBe("loading"); expect(view.result.current.assessment).toBeNull();
  view.rerender(null);
  await act(async () => next.resolve({ availability: "available", issues: [] }));
  expect(view.result.current.status).toBe("idle"); expect(view.result.current.assessment).toBeNull();
});
